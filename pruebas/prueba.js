const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const url = CFG.URL;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  const b = await puppeteer.launch({ executablePath: CFG.CHROME,
    headless: true, args: ['--allow-file-access-from-files'] });
  const pg = await b.newPage();
  await pg.setViewport({ width: 400, height: 800 });
  const dialogs = [];
  pg.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url);
  await pg.evaluate(() => localStorage.clear());
  await pg.reload();

  const pats = () => pg.$$eval('#pats button', bs => bs.map(x => x.textContent));
  ok(JSON.stringify(await pats()) === '["KW","BR","MM","Otro"]', 'botones por defecto');
  ok(await pg.$eval('#pre', e => e.textContent) === 'KW601', 'inicio KW601 por defecto');

  // Ajustes
  await pg.click('[onclick="ver(\'vAjustes\')"]');
  const vals = await pg.$$eval('#formatos input', is => is.map(i => i.value));
  ok(JSON.stringify(vals) === '["KW601","999","BR60","997","MM604","987"]', 'ajustes muestran valores de fábrica: ' + vals);
  ok((await pg.$eval('#fPrev1', e => e.textContent)).startsWith('BR60••••••997'), 'previo BR');

  // sin cambios
  await pg.click('[onclick="guardarFormatos()"]');
  ok((await pg.$eval('#aviFormatos', e => e.textContent)) === 'No hay cambios que guardar.', 'sin cambios');

  // cambiar KW inicio y MM final (minúsculas se pasan a mayúsculas)
  await pg.click('#fPre0', { clickCount: 3 }); await pg.type('#fPre0', 'kw602');
  await pg.click('#fSuf2', { clickCount: 3 }); await pg.type('#fSuf2', '988');
  ok(await pg.$eval('#fPre0', e => e.value) === 'KW602', 'mayúsculas');
  await pg.click('[onclick="guardarFormatos()"]');
  ok(dialogs.pop().includes('KW:  KW601…999  →  KW602…999'), 'confirmación lista los cambios');
  ok((await pg.$eval('#aviFormatos', e => e.textContent)) === 'Formatos guardados.', 'guardado');

  // demasiado largo
  await pg.click('#fPre1', { clickCount: 3 }); await pg.type('#fPre1', 'BR60123456');
  ok((await pg.$eval('#fPrev1', e => e.className)).includes('mal'), 'previo marca error de largo');
  await pg.click('[onclick="guardarFormatos()"]');
  ok((await pg.$eval('#aviFormatos', e => e.textContent)).includes('no pueden sumar más de 12'), 'rechaza largo');

  // duplicado
  await pg.click('#fPre1', { clickCount: 3 }); await pg.type('#fPre1', 'KW602');
  await pg.click('#fSuf1', { clickCount: 3 }); await pg.type('#fSuf1', '999');
  await pg.click('[onclick="guardarFormatos()"]');
  ok((await pg.$eval('#aviFormatos', e => e.textContent)).includes('mismo inicio y final'), 'rechaza duplicado');

  // persistencia tras recargar
  await pg.reload();
  ok(await pg.$eval('#pre', e => e.textContent) === 'KW602', 'tras recargar KW602');
  const g = await pg.evaluate(() => JSON.parse(localStorage.getItem('vt_registro_transferencias_v1')).patrones);
  ok(g[1].pre === 'BR60' && g[2].suf === '988', 'cambios no guardados se descartan, guardados persisten');

  // captura con el formato nuevo
  await pg.click('[onclick="abrirLote()"]');
  await pg.click('[onclick="ponerPatron(\'MM\')"]');
  ok(await pg.$eval('#suf', e => e.textContent) === '988', 'MM final 988 en captura');
  await pg.click('[onclick="ponerPatron(\'KW\')"]');
  await pg.type('#inCod', '12345');
  await pg.type('#inImp', '500');
  await pg.type('#inNom', 'Prueba Cliente');
  await pg.type('#inCI', '00022962345');
  await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter');
  const r = await pg.evaluate(() => JSON.parse(localStorage.getItem('vt_registro_transferencias_v1')).registros[0]);
  ok(r && r.codigo === 'KW60212345999' && r.ci === '00022962345', 'registro con formato nuevo: ' + JSON.stringify(r));

  // fábrica
  await pg.click('[onclick="ver(\'vInicio\');pintarInicio()"]');
  await pg.click('[onclick="ver(\'vAjustes\')"]');
  await pg.click('[onclick="formatosFabrica()"]');
  const v2 = await pg.$$eval('#formatos input', is => is.map(i => i.value));
  ok(JSON.stringify(v2) === '["KW601","999","BR60","997","MM604","987"]', 'valores de fábrica restaurados');
  ok(await pg.$eval('#pre', e => e.textContent) === 'KW601', 'captura vuelve a KW601');

  // respaldo antiguo sin patrones
  await pg.evaluate(() => {
    localStorage.setItem('vt_registro_transferencias_v1', JSON.stringify({ cajeros:['A'], registros:[] }));
  });
  await pg.reload();
  ok(await pg.$eval('#pre', e => e.textContent) === 'KW601', 'datos viejos sin patrones usan fábrica');

  await pg.click('[onclick="ver(\'vAjustes\')"]');
  await pg.screenshot({ path: CFG.SALIDA + '/ajustes.png', fullPage: false });
  ok(!errs.length, 'sin errores JS ' + errs.join('; '));
  await b.close();
})();
