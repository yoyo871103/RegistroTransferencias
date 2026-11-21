// Guardar en la tablet (sin apps extra): el Excel y la copia de seguridad se guardan
// en Descargas/Registro de Transferencias, se ven desde fuera de la app (como al
// conectar el cable) y un segundo guardado no pisa el primero.
// Necesita el APK de PRUEBAS instalado y un emulador abierto. Borra los datos de la app.
const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { licenciaPara } = require(CFG.APK + '/licencia.js');
const SECRETO = fs.readFileSync(CFG.APK + '/licencia.secreto', 'utf8').trim();
const ADB = CFG.ADB;
const PKG = 'com.vtsoftware.transferencias';
const CARPETA = '/sdcard/Download/Registro de Transferencias';
const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || d === undefined ? '' : '  → ' + JSON.stringify(d))); if (!c) process.exitCode = 1; };
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' });
const pidof = () => { try { return adb('shell', 'pidof', PKG).trim(); } catch(e){ return ''; } };
const espera = ms => new Promise(r => setTimeout(r, ms));
const listar = () => { try { return adb('shell', 'ls', '"' + CARPETA + '"').split(/\r?\n/).filter(Boolean); } catch(e){ return []; } };

let browser, pg;
async function conectar(intento = 1){
  if (browser) try { browser.disconnect(); } catch(e){}
  let sock = '';
  for (let i = 0; i < 20 && !sock; i++){
    const pid = pidof();
    if (pid && adb('shell', 'cat', '/proc/net/unix').includes('webview_devtools_remote_' + pid)) sock = 'webview_devtools_remote_' + pid;
    else await espera(500);
  }
  try {
    adb('forward', 'tcp:9333', 'localabstract:' + sock);
    browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
    pg = (await browser.pages()).find(p => p.url().startsWith('https://localhost'));
    if (!pg) throw new Error('sin página');
    await pg.waitForFunction(() => typeof window.activarLicencia === 'function', { timeout: 10000 });
  } catch (e){
    if (intento >= 3) throw e;
    await espera(1500);
    return conectar(intento + 1);
  }
  pg.on('dialog', d => d.accept());
  await espera(600);
}
const caja = () => pg.$eval('#cajaModal', e => e.innerText);
async function pulsar(texto){
  await pg.evaluate(t => [].find.call(document.querySelectorAll('#cajaModal button'), b => b.textContent.indexOf(t) === 0).click(), texto);
  await espera(1500);
}

(async () => {
  // archivos de una pasada anterior: fuera, para contar bien
  try { adb('shell', 'rm', '-rf', '"' + CARPETA + '"'); } catch(e){}
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar();
  const codigo = await pg.evaluate(() => LicenciaNativa.codigo());
  await pg.evaluate(l => { document.getElementById('inLic').value = l; activarLicencia(); }, licenciaPara(SECRETO, codigo));
  await espera(500);

  // dos registros de hoy, como los anotaría el cajero
  await pg.evaluate(() => {
    // recién borrados los datos todavía no hay archivo: la app completa lo que falte al abrir
    var d = JSON.parse(AlmacenNativo.leer() || '{}');
    var f = new Date(), hoy = f.getFullYear() + '-' + ('0' + (f.getMonth() + 1)).slice(-2) + '-' + ('0' + f.getDate()).slice(-2);
    d.registros = [
      { id:'a', fecha:hoy, hora:'10:00', cajero:'Ana', codigo:'KW601GUARD1999', importe:150, nombre:'', ci:'', telefono:'' },
      { id:'b', fecha:hoy, hora:'10:05', cajero:'Ana', codigo:'KW601GUARD2999', importe:250, nombre:'', ci:'', telefono:'' }];
    AlmacenNativo.escribir(JSON.stringify(d));
  });
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar();

  await pg.evaluate(() => exportarTodo());
  await espera(800);
  const t = await caja();
  ok(t.includes('Excel listo') && t.includes('Guardar en la tablet') && t.includes('Compartir'), 'exportar: ofrece guardar o compartir', t);
  await pulsar('Guardar en la tablet');
  const t2 = await caja();
  ok(t2.includes('Guardado en la tablet') && t2.includes('TRANSFERENCIAS_TODO.xlsx') && t2.includes('Descargas › Registro de Transferencias'),
     'guardado: dice el nombre y la carpeta', t2);
  let l = listar();
  ok(l.includes('TRANSFERENCIAS_TODO.xlsx'), 'el Excel está en ' + CARPETA, l);

  // el contenido es el Excel de verdad (se saca como por cable)
  const local = CFG.SALIDA + '/guardado.xlsx';
  adb('pull', CARPETA + '/TRANSFERENCIAS_TODO.xlsx', local);
  const b = fs.readFileSync(local);
  ok(b.length > 1000 && b[0] === 0x50 && b[1] === 0x4b, 'es un .xlsx válido (' + b.length + ' bytes)');
  ok(b.toString('latin1').includes('xl/worksheets'), 'con su hoja de cálculo');

  // otra vez: no pisa el anterior
  await pulsar('Entendido');
  await pg.evaluate(() => exportarTodo()); await espera(800);
  await pulsar('Guardar en la tablet');
  l = listar();
  ok(l.length === 2 && l.some(n => /^TRANSFERENCIAS_TODO \(1\)\.xlsx$/.test(n)), 'el segundo se guarda aparte: ' + l.join(' | '), l);
  ok((await caja()).includes('TRANSFERENCIAS_TODO (1).xlsx'), 'y dice el nombre con el que quedó');
  await pulsar('Entendido');

  // la copia de seguridad también se puede guardar
  await pg.evaluate(() => respaldar()); await espera(800);
  ok((await caja()).includes('Copia de seguridad lista'), 'copia de seguridad: ofrece guardar o compartir');
  await pulsar('Guardar en la tablet');
  l = listar();
  const resp = l.find(n => /^respaldo_transferencias_.*\.json$/.test(n));
  ok(!!resp, 'la copia de seguridad está en la carpeta', l);
  if (resp){
    const json = JSON.parse(adb('shell', 'cat', '"' + CARPETA + '/' + resp + '"'));
    ok(json.registros.length === 2 && json.registros[0].codigo === 'KW601GUARD1999', 'y tiene los registros');
  }
  await pulsar('Entendido');

  // compartir sigue igual
  await pg.evaluate(() => exportarTodo()); await espera(800);
  await pulsar('Compartir');
  await espera(1500);
  const arriba = adb('shell', 'dumpsys', 'activity', 'activities').split('\n').filter(x => /topResumedActivity/.test(x)).join(' ');
  ok(/ChooserActivity|chooser|ResolverActivity/i.test(arriba), 'Compartir abre el selector de Android', arriba.trim().slice(0, 140));
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');

  browser.disconnect();
})().catch(e => { console.error('ERROR', e); process.exit(1); });
