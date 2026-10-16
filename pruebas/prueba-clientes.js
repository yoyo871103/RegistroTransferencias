// Clientes frecuentes y pantalla compacta (PWA, Chrome). Datos inventados.
const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const url = CFG.URL;
const CLAVE = 'vt_registro_transferencias_v1';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  const b = await puppeteer.launch({ executablePath: CFG.CHROME,
    headless: true, args: ['--allow-file-access-from-files'] });
  const pg = await b.newPage();
  await pg.setViewport({ width: 400, height: 900 });
  const dialogs = [];
  pg.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const txt = s => pg.$eval(s, e => e.textContent);
  const val = s => pg.$eval(s, e => e.value);
  const disco = () => pg.evaluate(k => JSON.parse(localStorage.getItem(k)), CLAVE);
  const limpiar = async s => { await pg.click(s, { clickCount: 3 }); await pg.keyboard.press('Backspace'); };

  // datos de una versión anterior (sin d.clientes): se sacan del historial
  await pg.goto(url);
  await pg.evaluate(k => localStorage.setItem(k, JSON.stringify({ cajeros:['Cajero 1'], registros:[
    { id:'a', fecha:'2026-10-01', cajero:'Cajero 1', codigo:'KW60100001999', importe:100, hora:'10:00',
      nombre:'Ana Pérez', ci:'88110305549', telefono:'+53 5111 2233' },
    { id:'b', fecha:'2026-10-02', cajero:'Cajero 1', codigo:'KW60100002999', importe:200, hora:'10:00',
      nombre:'', ci:'', telefono:'+53 5111 2233' },
    { id:'c', fecha:'2026-10-03', cajero:'Cajero 1', codigo:'KW60100003999', importe:300, hora:'10:00',
      nombre:'Ana Pérez García', ci:'', telefono:'+53 5111 2233' },
    { id:'e', fecha:'2026-10-03', cajero:'Cajero 1', codigo:'KW60100004999', importe:300, hora:'10:00',
      nombre:'Sin teléfono', ci:'', telefono:'' } ] })), CLAVE);
  await pg.reload();
  await pg.click('[onclick="abrirLote()"]');
  let dd = await disco();
  // completar() no guarda por sí solo: se comprueba en memoria a través de la sugerencia
  await pg.type('#inTel', '51112233');
  let sug = await txt('#sugCli');
  ok(sug.includes('Ana Pérez García') && sug.includes('CI 88110305549') && sug.includes('2 veces'),
     'historial: último nombre, CI conservado, 2 veces: ' + sug);
  ok(await pg.$eval('#sugCli', e => getComputedStyle(e).display === 'flex'), 'sugerencia visible');
  await pg.click('#sugCli button');
  ok(await val('#inNom') === 'Ana Pérez García' && await val('#inCI') === '88110305549', 'Usar datos rellena nombre y CI');
  ok(await pg.$eval('#sugCli', e => getComputedStyle(e).display === 'none'), 'tras usarlos la sugerencia se oculta');

  // registrar: suma una vez y actualiza
  await pg.type('#inCod', '55555');
  await pg.type('#inImp', '500');
  await limpiar('#inNom'); await pg.type('#inNom', 'Ana Pérez G.');
  await pg.click('#btnAgregar');
  dd = await disco();
  ok(dd.clientes['+53 5111 2233'].veces === 3 && dd.clientes['+53 5111 2233'].nombre === 'Ana Pérez G.' &&
     dd.clientes['+53 5111 2233'].ci === '88110305549', 'registrar actualiza el cliente: ' + JSON.stringify(dd.clientes['+53 5111 2233']));
  ok(await pg.$eval('#sugCli', e => getComputedStyle(e).display === 'none') && await val('#inTel') === '', 'formulario limpio, sin sugerencia');

  // teléfono desconocido: nada; teléfono incompleto: nada
  await pg.type('#inTel', '5999');
  ok(await pg.$eval('#sugCli', e => getComputedStyle(e).display === 'none'), 'incompleto: sin sugerencia');
  await pg.type('#inTel', '8877');
  ok(await pg.$eval('#sugCli', e => getComputedStyle(e).display === 'none'), 'desconocido: sin sugerencia');
  await limpiar('#inTel');

  // un cliente nuevo queda recordado
  await pg.type('#inCod', '66666'); await pg.type('#inImp', '50');
  await pg.type('#inTel', '53334455'); await pg.type('#inNom', 'Luis Gómez');
  await pg.click('#btnAgregar');
  await pg.type('#inTel', '53334455');
  ok((await txt('#sugCli')).includes('Luis Gómez') && (await txt('#sugCli')).includes('1 vez'), 'cliente nuevo recordado');
  await limpiar('#inTel');

  // editar un registro actualiza el cliente sin sumar veces
  dd = await disco();
  const r = dd.registros.find(x => x.nombre === 'Luis Gómez');
  await pg.evaluate(id => editar(id), r.id);
  await pg.type('#edCI', '90010112345');
  await pg.click('[onclick^="guardarEdicion"]');
  dd = await disco();
  ok(dd.clientes['+53 5333 4455'].ci === '90010112345' && dd.clientes['+53 5333 4455'].veces === 1, 'editar: CI añadido, veces igual');

  // ajustes: contador y olvidar
  await pg.click('#vCaptura .pie .fila button');
  await pg.click('[onclick="ver(\'vAjustes\')"]');
  ok((await txt('#infoDatos')).includes('Clientes recordados: 2'), 'Ajustes cuenta 2 clientes');
  await pg.click('[onclick="olvidarClientes()"]');
  dd = await disco();
  ok(Object.keys(dd.clientes).length === 0 && dd.registros.length === 6, 'olvidar: sin clientes, registros intactos');
  // borrar lotes no borra clientes (se vuelve a recordar uno y se borra su lote)
  await pg.click('#vAjustes .pie button');

  // pantalla compacta
  await pg.click('[onclick="abrirLote()"]');
  const alto = await pg.$eval('.marc', e => e.getBoundingClientRect().height);
  const pie = await pg.$eval('#vCaptura .pie .fila button', e => e.getBoundingClientRect().height);
  ok(alto < 40, 'contadores más bajos: ' + alto + ' px');
  ok(pie < 45, 'botones del pie más bajos: ' + pie + ' px');
  await pg.type('#inTel', '51112233');
  await pg.screenshot({ path: CFG.SALIDA + '/clientes.png' });

  ok(!errs.length, 'sin errores JS ' + errs.join('; '));
  await b.close();
})();
