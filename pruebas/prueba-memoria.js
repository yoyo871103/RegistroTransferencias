const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const url = CFG.URL;
const CLAVE = 'vt_registro_transferencias_v1';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const DESC = path.join(CFG.SALIDA, 'descargas');

(async () => {
  fs.rmSync(DESC, { recursive: true, force: true }); fs.mkdirSync(DESC);
  const b = await puppeteer.launch({ executablePath: CFG.CHROME,
    headless: true, args: ['--allow-file-access-from-files'] });
  const pg = await b.newPage();
  const cdp = await pg.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DESC });
  await pg.setViewport({ width: 400, height: 900 });
  const dialogs = [];
  pg.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const txt = s => pg.$eval(s, e => e.textContent);
  const disco = () => pg.evaluate(k => JSON.parse(localStorage.getItem(k)), CLAVE);
  const hoyISO = () => pg.evaluate(() => { var f = new Date();
    return f.getFullYear() + '-' + String(f.getMonth()+1).padStart(2,'0') + '-' + String(f.getDate()).padStart(2,'0'); });
  // datos de relleno: n registros en un lote viejo; extra = cajero de relleno para ajustar el tamaño
  const llenar = (n, extra, ultimaCopia) => pg.evaluate((k, n, extra, uc) => {
    var rs = [];
    for (var i = 0; i < n; i++) rs.push({ id:'r' + i, fecha:'2026-01-05', cajero:'Viejo',
      codigo:'KW601' + String(10000 + i % 90000) + '999', importe:100, hora:'09:00',
      nombre:'María Fernández Rodríguez', ci:'88110305549', telefono:'+53 5555 1803' });
    var d = { cajeros:['Cajero 1', 'Viejo'], registros:rs, ultimaCopia:uc };
    if (extra) d.relleno = 'x'.repeat(extra);
    localStorage.setItem(k, JSON.stringify(d));
  }, CLAVE, n, extra || 0, ultimaCopia || null);

  await pg.goto(url);
  await pg.evaluate(() => localStorage.clear());
  await pg.reload();

  // 1. sin registros: sin alertas
  ok((await txt('#alertas')) === '', 'sin registros no hay alertas');

  // 2. recordatorio de copia
  await llenar(3, 0, null);
  await pg.reload();
  ok((await txt('#alertas')).includes('Nunca se ha guardado una copia'), 'aviso: nunca hubo copia');
  await pg.click('#alertas button');
  await new Promise(r => setTimeout(r, 800));
  ok((await txt('#alertas')) === '', 'tras guardar copia desaparece el aviso');
  ok((await disco()).ultimaCopia === await hoyISO(), 'ultimaCopia = hoy');
  ok(fs.readdirSync(DESC).some(f => f.startsWith('respaldo_transferencias_')), 'se descargó el respaldo');
  await llenar(3, 0, '2026-01-01');
  await pg.reload();
  ok(/Hace \d+ días de la última copia/.test(await txt('#alertas')), 'aviso: hace N días');
  await llenar(3, 0, await hoyISO());
  await pg.reload();
  ok((await txt('#alertas')) === '', 'copia reciente: sin aviso');

  // 3. medidor
  await llenar(3, Math.round(0.84 * 5242880), await hoyISO());   // ~84 %
  await pg.reload();
  const a85 = await txt('#alertas');
  ok(a85.includes('Memoria al') && (await pg.$('#alertas .avi.war')), 'aviso amarillo ~84 %: ' + a85);
  await llenar(3, Math.round(0.96 * 5242880), await hoyISO());   // ~96 %
  await pg.reload();
  ok((await txt('#alertas')).includes('Memoria casi llena') && (await pg.$('#alertas .avi.err')), 'aviso rojo ~96 %');
  await pg.click('[onclick="ver(\'vAjustes\')"]');
  const info = await txt('#infoDatos');
  ok(/Memoria usada: 9\d %/.test(info) && info.includes('Última copia'), 'Ajustes muestra memoria: ' + info);
  await pg.click("#vAjustes .pie button");

  // 4. llenar al tope exacto
  await pg.evaluate(k => {
    var d = JSON.parse(localStorage.getItem(k));
    var lo = 0, hi = 6000000;
    while (lo < hi){ var m = Math.ceil((lo+hi)/2); d.relleno = 'x'.repeat(m);
      try { localStorage.setItem(k, JSON.stringify(d)); lo = m; } catch(e){ hi = m - 1; } }
    d.relleno = 'x'.repeat(lo); localStorage.setItem(k, JSON.stringify(d));
  }, CLAVE);
  await pg.reload();
  const n0 = (await disco()).registros.length;
  dialogs.length = 0;
  await pg.click('[onclick="abrirLote()"]');
  ok(dialogs.length === 0, 'abrir lote con memoria llena no muestra alerta');
  await pg.type('#inCod', '77777');
  await pg.type('#inImp', '300');
  await pg.click('#btnAgregar');
  ok(dialogs.length === 1 && dialogs[0].startsWith('NO SE GUARDÓ') && dialogs[0].includes('memoria de la app está llena'),
     'alerta de memoria llena: ' + JSON.stringify(dialogs[0]));
  const av = await pg.$eval('#aviCap', e => ({ t:e.textContent, c:e.className }));
  ok(av.c.includes('err') && av.t.startsWith('NO se guardó'), 'aviso rojo en captura: ' + av.t);
  ok(await txt('#mCant') === '0', 'contador del lote no cuenta lo no guardado');
  ok((await pg.evaluate(() => document.getElementById('inCod').value)) === '77777', 'lo tecleado se conserva');
  ok((await disco()).registros.length === n0, 'en disco sigue igual');

  // 5. liberar espacio borrando el lote viejo y reintentar
  await pg.click('[onclick="ver(\'vInicio\');pintarInicio()"]');
  await pg.click('[onclick="ver(\'vAjustes\')"]');
  await pg.click('[onclick="borrarLote()"]');
  await pg.click('[onclick^="confirmarBorrarLote(\'2026-01-05\'"]');
  ok((await disco()).registros.length === 0, 'lote viejo borrado');
  await pg.click("#vAjustes .pie button");
  await pg.click('[onclick="abrirLote()"]');
  await pg.type('#inCod', '77777');
  await pg.type('#inImp', '300');
  await pg.click('#btnAgregar');
  ok((await disco()).registros.length === 1 && (await txt('#aviCap')).startsWith('Registrado'), 'tras liberar, se guarda');

  // 6. exportar: descarga + guía
  await pg.click('[onclick="exportarLoteActual()"]');
  await new Promise(r => setTimeout(r, 1500));
  const guia = await txt('#cajaModal');
  ok(guia.includes('Excel guardado') && guia.includes('WhatsApp') && guia.includes('Descargas'), 'guía de compartir visible');
  ok(fs.readdirSync(DESC).some(f => f.startsWith('TRANSFERENCIAS_') && f.endsWith('.xlsx')), 'se descargó el Excel');
  await pg.screenshot({ path: CFG.SALIDA + '/guia.png' });
  await pg.click('#cajaModal .gr');
  ok(!(await pg.$('#modal.on')), 'Entendido cierra la guía');

  ok(!errs.length, 'sin errores JS ' + errs.join('; '));
  await b.close();
})();
