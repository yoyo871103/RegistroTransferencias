// ENZONA en el emulador (app ya con licencia y permisos, tras prueba-emulador.js).
const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const ADB = CFG.ADB;
const PKG = 'com.vtsoftware.transferencias';
const DIR = CFG.SALIDA;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' });
const pidof = () => { try { return adb('shell', 'pidof', PKG).trim(); } catch(e){ return ''; } };
const espera = ms => new Promise(r => setTimeout(r, ms));
const foto = n => fs.writeFileSync(`${DIR}/${n}.png`, execFileSync(ADB, ['exec-out', 'screencap', '-p']));
const notifApp = () => adb('shell', 'dumpsys', 'notification', '--noredact')
  .split('NotificationRecord(').filter(b => b.includes('pkg=' + PKG)).join(' | ');
const COD = 'Zq7' + Date.now().toString(36).slice(-5) + 'Ab9';   // número nuevo en cada ejecución, con minúsculas
const PAGO = 'ENZONA pago recibido, Importe: 10.00 CUP No.: ' + COD;

let browser, pg;
async function conectar(){
  if (browser) try { browser.disconnect(); } catch(e){}
  let sock = '';
  for (let i = 0; i < 30 && !sock; i++){
    const pid = pidof();
    if (pid && adb('shell', 'cat', '/proc/net/unix').includes('webview_devtools_remote_' + pid)) sock = 'webview_devtools_remote_' + pid;
    else await espera(500);
  }
  await espera(800);
  adb('forward', 'tcp:9333', 'localabstract:' + sock);
  browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
  pg = (await browser.pages()).find(p => p.url().startsWith('https://localhost'));
  pg.on('dialog', d => { console.log('  (diálogo: ' + d.message().split('\n')[0] + ')'); d.accept(); });
  await pg.waitForFunction(() => typeof window.usarSms === 'function');
}
const txt = s => pg.$eval(s, e => e.textContent);
const val = s => pg.$eval(s, e => e.value);
const datos = () => pg.evaluate(() => JSON.parse(AlmacenNativo.leer()));

(async () => {
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar();
  ok(await pg.evaluate(() => document.querySelector('.vista.on').id) === 'vInicio', 'app con licencia');
  await pg.evaluate(() => document.querySelectorAll('#vInicio .pie button')[1].click());
  ok((await val('#smsRem')).includes('ENZONA'), 'ENZONA añadido a los remitentes de una instalación anterior: ' + await val('#smsRem'));
  await pg.evaluate(() => { ver('vInicio'); pintarInicio(); });

  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await espera(800);
  adb('emu', 'sms', 'send', 'ENZONA', 'Por su seguridad no comparta este codigo. Es solo para uso personal. CODIGO DE ACCESO ENZONA: 398213');
  adb('emu', 'sms', 'send', 'ENZONA', PAGO);
  await espera(5000);
  const n = notifApp();
  ok(n.includes(COD + ' · 10.00 CUP'), 'notificación con el número tal cual: ' + COD);
  ok(!n.includes('398213'), 'el código de acceso no se notifica');
  adb('shell', 'cmd', 'statusbar', 'expand-notifications'); await espera(1500);
  foto('e1-notificacion');
  adb('shell', 'cmd', 'statusbar', 'collapse');

  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar(); await espera(1000);
  await pg.evaluate(() => abrirLote()); await espera(500);
  const band = await txt('#bandeja');
  ok(band.includes(COD) && band.includes('ENZONA') && band.includes('10.00'), 'Por registrar: número, ENZONA e importe');
  await pg.evaluate(c => usarSms(c), COD);
  ok(await val('#inCod') === COD && await pg.$eval('#inCod', e => e.classList.contains('exacto')) &&
     await txt('#pre') === '' && await val('#inImp') === '10.00', 'Registrar: número con sus minúsculas en "Otro"');
  foto('e2-cargado');
  await pg.evaluate(() => agregar()); await espera(800);
  const d = await datos();
  const r = d.registros.find(x => x.codigo.toUpperCase() === COD.toUpperCase());
  ok(r && r.codigo === COD && r.importe === 10, 'registrado tal cual, sin preguntar por los 13 caracteres: ' + (r && r.codigo));

  // el mismo SMS otra vez: ni aviso ni lista
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await espera(800);
  const antes = (notifApp().match(new RegExp(COD, 'g')) || []).length;
  adb('emu', 'sms', 'send', 'ENZONA', PAGO);
  await espera(4000);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar(); await espera(1000);
  await pg.evaluate(() => abrirLote()); await espera(500);
  ok(!(await txt('#bandeja')).includes(COD), 'repetido: no se vuelve a ofrecer');

  // el Excel lleva el número tal cual
  const fila = await pg.evaluate(c => {
    const ws = construirLibro(JSON.parse(AlmacenNativo.leer()).registros.filter(r => r.codigo === c)).Sheets.TRANSFERENCIAS;
    return ws.C2.v;
  }, COD);
  ok(fila === COD, 'Excel: ' + fila);
  browser.disconnect();
})().catch(e => { console.error('ERROR', e); process.exit(1); });
