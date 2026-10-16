const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const url = CFG.URL;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const CLAVE = 'vt_registro_transferencias_v1';

(async () => {
  const b = await puppeteer.launch({ executablePath: CFG.CHROME,
    headless: true, args: ['--allow-file-access-from-files'] });
  const pg = await b.newPage();
  await pg.setViewport({ width: 400, height: 900 });
  const dialogs = [];
  pg.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url);
  await pg.evaluate(() => localStorage.clear());
  await pg.reload();
  await pg.click('[onclick="abrirLote()"]');

  const regs = () => pg.evaluate(k => JSON.parse(localStorage.getItem(k)).registros, CLAVE);
  const val = s => pg.$eval(s, e => e.value);
  const txt = s => pg.$eval(s, e => e.textContent);
  const limpiar = async s => { await pg.click(s, { clickCount: 3 }); await pg.keyboard.press('Backspace'); };

  // formato mientras se escribe
  await pg.type('#inTel', '5555');
  ok(await val('#inTel') === '5555', 'cuatro dígitos sin espacio');
  ok(await txt('#prevTel') === '4 de 8 dígitos', 'previo incompleto');
  await pg.type('#inTel', '18039');
  ok(await val('#inTel') === '5555 1803', 'agrupa 4-4 y corta en 8: ' + await val('#inTel'));
  ok(await txt('#prevTel') === '+53 5555 1803', 'previo completo');

  // pegar con +53
  await limpiar('#inTel');
  await pg.$eval('#inTel', e => { e.value = '+53 5355 1234'; e.dispatchEvent(new Event('input')); });
  ok(await val('#inTel') === '5355 1234', 'pegado con +53 quita el prefijo: ' + await val('#inTel'));
  await pg.$eval('#inTel', e => { e.value = '53551234'; e.dispatchEvent(new Event('input')); });
  ok(await val('#inTel') === '5355 1234', '8 dígitos que empiezan con 53 se respetan');

  // flujo con Enter: Tel -> Nombre -> CI -> agregar
  await limpiar('#inTel');
  await pg.type('#inCod', '11111');
  await pg.type('#inImp', '100');
  await pg.type('#inTel', '55551803');
  await pg.keyboard.press('Enter');
  ok(await pg.evaluate(() => document.activeElement.id) === 'inCI', 'Enter en teléfono salta al CI');
  await pg.type('#inCI', '00022962345');
  await pg.keyboard.press('Enter');
  ok(await pg.evaluate(() => document.activeElement.id) === 'inNom', 'Enter en CI salta al nombre');
  await pg.keyboard.press('Enter');
  let rs = await regs();
  ok(rs.length === 1 && rs[0].telefono === '+53 5555 1803', 'guardado con teléfono: ' + JSON.stringify(rs[0]));
  ok(await val('#inTel') === '' && await txt('#prevTel') === '—', 'campo limpio tras agregar');
  ok((await txt('#listaReg')).includes('+53 5555 1803'), 'teléfono visible en la lista');

  // incompleto se rechaza
  await pg.type('#inCod', '22222');
  await pg.type('#inImp', '100');
  await pg.type('#inTel', '5555');
  await pg.click('#btnAgregar');
  ok((await txt('#aviCap')).includes('8 dígitos'), 'rechaza incompleto');
  ok((await regs()).length === 1, 'no se guardó');

  // sin teléfono
  await limpiar('#inTel');
  await pg.click('#btnAgregar');
  rs = await regs();
  ok(rs.length === 2 && rs[1].telefono === '', 'sin teléfono se guarda');

  // edición
  await pg.evaluate(id => editar(id), rs[1].id);
  await pg.type('#edTel', '+53 7123 4567');
  await pg.click('[onclick^="guardarEdicion"]');
  rs = await regs();
  ok(rs[1].telefono === '+53 7123 4567', 'edición guarda teléfono');
  await pg.evaluate(id => editar(id), rs[1].id);
  await limpiar('#edTel'); await pg.type('#edTel', '712');
  await pg.click('[onclick^="guardarEdicion"]');
  ok(dialogs.pop().includes('8 dígitos'), 'edición rechaza incompleto');
  await pg.evaluate(() => cerrarModal());

  // Excel
  const fila = await pg.evaluate(() => {
    const rs = JSON.parse(localStorage.getItem('vt_registro_transferencias_v1')).registros;
    const ws = construirLibro(rs).Sheets.TRANSFERENCIAS;
    return [ws.H1.v, ws.H2.v, ws.H2.t, ws.G2.v, ws.G2.t];
  });
  ok(JSON.stringify(fila) === '["TELEFONO","+53 5555 1803","s","00022962345","s"]', 'Excel: ' + JSON.stringify(fila));

  await pg.$eval('#inTel', e => e.scrollIntoView());
  await pg.screenshot({ path: CFG.SALIDA + '/captura-tel.png' });
  ok(!errs.length, 'sin errores JS ' + errs.join('; '));
  await b.close();
})();
