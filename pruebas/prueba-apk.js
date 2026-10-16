// Simula el APK: inyecta un window.Capacitor falso con Filesystem, Share y Sms.
// Los SMS son INVENTADOS (aún no hay ejemplos reales del banco).
const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const url = CFG.URL;
const CLAVE = 'vt_registro_transferencias_v1';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

const mock = () => {
  const M = window.__mock = { files:[], shares:[], cola:[], quitadas:[], config:null, inbox:[],
    estado:{ sms:'prompt', notificaciones:'prompt' }, activarResult:{ sms:'granted', notificaciones:'granted' },
    listeners:{} };
  try { const g = JSON.parse(sessionStorage.getItem('__mock') || 'null'); if (g) Object.assign(M, g); } catch(e){}
  const plugins = {
    Filesystem: { writeFile: async op => { M.files.push(op); return { uri:'file:///cache/' + op.path }; } },
    Share: { share: async o => { M.shares.push(o); return {}; } },
    Sms: {
      estado: async () => M.estado,
      activar: async () => (M.estado = M.activarResult),
      configurar: async c => { M.config = c; },
      pendientes: async () => ({ sms: M.cola.slice() }),
      quitar: async ({ claves }) => { M.quitadas.push(...claves); M.cola = M.cola.filter(s => !claves.includes(s.clave)); },
      leerDesde: async ({ desde }) => {
        if (M.estado.sms !== 'granted'){ const e = new Error('Sin permiso para leer SMS'); e.code = 'SIN_PERMISO'; throw e; }
        return { sms: M.inbox.filter(s => s.fecha >= desde) };
      },
      addListener: async (ev, cb) => { M.listeners[ev] = cb; return { remove(){} }; }
    }
  };
  window.Capacitor = { isNativePlatform: () => true, registerPlugin: n => plugins[n] };
};

(async () => {
  const b = await puppeteer.launch({ executablePath: CFG.CHROME,
    headless: true, args: ['--allow-file-access-from-files'] });
  const pg = await b.newPage();
  await pg.setViewport({ width: 400, height: 900 });
  const dialogs = [];
  pg.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.evaluateOnNewDocument(mock);
  const txt = s => pg.$eval(s, e => e.textContent);
  const val = s => pg.$eval(s, e => e.value);
  const disco = () => pg.evaluate(k => JSON.parse(localStorage.getItem(k)), CLAVE);
  const M = () => pg.evaluate(() => window.__mock);
  const espera = (ms = 300) => new Promise(r => setTimeout(r, ms));
  const ahora = Date.now();
  const sms = (clave, remitente, cuerpo, fecha = ahora) => ({ clave, remitente, cuerpo, fecha });

  // arranque con 2 SMS en cola: una transferencia y uno que no lo es
  await pg.goto(url);
  await pg.evaluate(() => localStorage.clear());
  await pg.evaluate((a, b) => sessionStorage.setItem('__mock', JSON.stringify({ cola: [a, b] })),
    sms('c1', 'PAGOxMOVIL', 'Usted ha recibido una transferencia de 1,250.00 CUP. Nro. Transaccion: KW60112345999'),
    sms('c2', 'CUBACEL', 'Su saldo es 25.00 CUP. Vence el 01/12/2026'));
  await pg.reload(); await espera();
  await pg.evaluate(() => sessionStorage.removeItem('__mock'));

  let m = await M();
  ok(m.config && JSON.stringify(m.config.remitentes) === '["PAGOxMOVIL","ENZONA"]' && m.config.codigo.includes('KW601[A-Z0-9]{5}999'),
     'configura Android con los formatos: ' + (m.config && m.config.codigo));
  ok(m.quitadas.sort().join() === 'c1,c2', 'recoge y quita de la cola los 2 SMS');
  let dd = await disco();
  ok(dd.porRegistrar.length === 1 && dd.porRegistrar[0].codigo === 'KW60112345999' && dd.porRegistrar[0].importe === 1250,
     'solo la transferencia queda por registrar: ' + JSON.stringify(dd.porRegistrar));
  const al = await txt('#alertas');
  ok(al.includes('Hay 1 transferencia de SMS por registrar'), 'aviso en inicio de pendientes');
  ok(al.includes('La lectura de SMS está desactivada'), 'aviso en inicio de permiso desactivado');

  // captura: usar el SMS
  await pg.click('[onclick="abrirLote()"]'); await espera();
  ok((await txt('#bandeja')).includes('KW60112345999') && (await txt('#bandeja')).includes('1,250.00'), 'bandeja muestra el SMS');
  await pg.click('[onclick="usarSms(\'KW60112345999\')"]');
  ok(await txt('#pre') === 'KW601' && await val('#inCod') === '12345' && await val('#inImp') === '1250.00',
     'Usar: formato KW, código e importe cargados');
  await pg.type('#inNom', 'Cliente Prueba');
  await pg.click('#btnAgregar'); await espera();
  dd = await disco();
  ok(dd.registros.length === 1 && dd.registros[0].codigo === 'KW60112345999' && dd.registros[0].importe === 1250 &&
     dd.registros[0].nombre === 'Cliente Prueba', 'registrado desde el SMS');
  ok(dd.porRegistrar.length === 0 && !(await txt('#bandeja')).includes('Por registrar'), 'sale de pendientes');

  // llega otro SMS con la app abierta (evento) — formato BR, importe "CUP 300.00"
  await pg.evaluate(c => { window.__mock.cola.push(c); window.__mock.listeners.sms(); },
    sms('c3', 'PAGOxMOVIL', 'El titular del telefono 5351112233 le ha realizado una transferencia a la cuenta 9999000011112222 de 300.00 CUP. Nro. Transaccion BR601CTOF2997. Fecha: 15/10/2026.'));
  await espera();
  ok((await txt('#bandeja')).includes('BR601CTOF2997') && (await txt('#bandeja')).includes('300.00'), 'evento: aparece el nuevo');
  await pg.click('[onclick="usarSms(\'BR601CTOF2997\')"]');
  ok(await txt('#pre') === 'BR60' && await val('#inCod') === '1CTOF2' && await val('#inTel') === '5111 2233', 'Registrar: formato BR y teléfono del SMS');

  // repetido (ya registrado) y descartado no se ofrecen
  await pg.evaluate(c => { window.__mock.cola.push(c); window.__mock.listeners.sms(); },
    sms('c4', 'PAGOxMOVIL', 'Usted ha recibido una transferencia de 1,250.00 CUP. Nro. Transaccion: KW60112345999'));
  await espera();
  ok((await disco()).porRegistrar.length === 1, 'SMS de un código ya registrado no se ofrece');
  dialogs.length = 0;
  await pg.click('[onclick="descartarSms(\'BR601CTOF2997\')"]'); await espera();
  ok(dialogs.length === 0, 'Ya usado: sin ventana de confirmación');
  ok(!(await txt('#bandeja')).includes('Registrar') && (await txt('#bandeja')).includes('BR601CTOF2997 marcado como ya usado'),
     'Ya usado: sale de la lista y aparece el aviso con Deshacer');
  await pg.click('#bandeja .deshacer button'); await espera();
  ok((await txt('#bandeja')).includes('Registrar') && !(await txt('#bandeja')).includes('marcado como ya usado') &&
     !(await disco()).smsDescartados.includes('BR601CTOF2997'), 'Deshacer: vuelve a Por registrar');
  await pg.click('[onclick="descartarSms(\'BR601CTOF2997\')"]'); await espera();
  await pg.evaluate(() => { const e = document.querySelector('#bandeja .deshacer'); if (e) e.remove(); });
  ok((await txt('#bandeja')).includes('Usados hoy (1)'), 'aparece "Usados hoy (1)"');
  await pg.click('[onclick="alternarUsados()"]');
  ok((await txt('#bandeja')).includes('Recuperar') && (await txt('#bandeja')).includes('Ocultar usados'), 'Usados hoy desplegado');
  await pg.click('[onclick="recuperarSms(\'BR601CTOF2997\')"]'); await espera();
  ok((await txt('#bandeja')).includes('Registrar') && !(await txt('#bandeja')).includes('Usados hoy'), 'Recuperar: vuelve a Por registrar');
  await pg.click('[onclick="descartarSms(\'BR601CTOF2997\')"]'); await espera();
  ok((await disco()).porRegistrar.filter(p => !p.usado).length === 0, 'descartado');
  await pg.evaluate(c => { window.__mock.cola.push(c); window.__mock.listeners.sms(); },
    sms('c5', 'PAGOxMOVIL', 'El titular del telefono 5351112233 le ha realizado una transferencia a la cuenta 9999000011112222 de 300.00 CUP. Nro. Transaccion BR601CTOF2997. Fecha: 15/10/2026.'));
  await espera();
  ok((await disco()).porRegistrar.filter(p => !p.usado).length === 0 &&
     (await disco()).porRegistrar.length === 1, 'un descartado no vuelve (ni se duplica)');

  // revisar hoy sin permiso
  dialogs.length = 0;
  await pg.evaluate(c => { window.__mock.inbox = c; }, [
    sms('', 'PAGOxMOVIL', 'Recibio 1.250,00 CUP de la cuenta 9205XXXX. Transaccion MM60412345987'),
    sms('', 'PAGOxMOVIL', 'Transaccion KW60199999999 por 50.00 CUP'),
    sms('', 'PAGOxMOVIL', 'Transferencia MM60455555987 recibida'),
    sms('', 'PAGOxMOVIL', 'Ayer: KW60100001999 por 10.00 CUP', ahora - 2 * 864e5)
  ]);
  await pg.click('[onclick="revisarHoy()"]'); await espera();
  ok(dialogs[0] && dialogs[0].includes('La lectura de SMS está desactivada'), 'sin permiso: avisa');

  // Ajustes: activar
  await pg.click('#vCaptura .pie .fila button'); await espera();
  await pg.click('[onclick="ver(\'vAjustes\')"]'); await espera();
  ok(await pg.$eval('#ajSms', e => e.style.display === ''), 'sección SMS visible en el APK');
  ok((await txt('#smsEstado')).includes('Lectura de SMS: desactivada'), 'estado: desactivada');
  await pg.click('#btnActivarSms'); await espera(500);
  ok((await txt('#smsEstado')).includes('Lectura de SMS: activa'), 'estado: activa tras activar');
  ok(await pg.$eval('#btnActivarSms', e => e.style.display === 'none'), 'botón activar se oculta');
  dd = await disco();
  const cods = dd.porRegistrar.filter(p => !p.usado).map(p => p.codigo + ':' + p.importe).sort().join(' ');
  ok(cods === 'KW60199999999:50 MM60412345987:1250 MM60455555987:null',
     'revisar hoy (ayer excluido; 1.250,00 bien leído): ' + cods);

  // remitentes
  await pg.click('#smsRem', { clickCount: 3 }); await pg.type('#smsRem', 'pagoxmovil , ');
  await pg.click('[onclick="guardarRemitentes()"]'); await espera();
  m = await M();
  ok(JSON.stringify(m.config.remitentes) === '["pagoxmovil"]', 'remitentes enviados a Android');
  await pg.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.porRegistrar = []; localStorage.setItem(k, JSON.stringify(d));
    sessionStorage.setItem('__mock', JSON.stringify({ inbox: __mock.inbox, estado: __mock.estado })); }, CLAVE);
  await pg.reload(); await espera();
  await pg.evaluate(() => sessionStorage.removeItem('__mock'));
  ok(JSON.stringify((await M()).config.remitentes) === '["pagoxmovil"]', 'al abrir, reenvía los remitentes a Android');
  await pg.click('[onclick="ver(\'vAjustes\')"]'); await espera();
  await pg.click('[onclick="verSmsHoy()"]'); await espera();
  const diag = await txt('#cajaModal');
  ok(diag.includes('3 mensajes') && diag.includes('✓ KW60199999999') && diag.includes('✓ MM60412345987 · 1,250.00 CUP') &&
      diag.includes('✓ MM60455555987 · sin importe'),
     'diagnóstico de SMS de hoy');
  await pg.click('#cajaModal .ln');
  await pg.evaluate(() => revisarHoy()); await espera();
  dd = await disco();
  ok(dd.porRegistrar.map(p => p.codigo).sort().join() === 'KW60199999999,MM60412345987,MM60455555987', 'filtro de remitente (sin distinguir mayúsculas)');

  // sin importe: Usar avisa y enfoca el importe
  await pg.click('#vAjustes .pie button');
  await pg.click('[onclick="abrirLote()"]'); await espera();
  await pg.click('[onclick="usarSms(\'MM60455555987\')"]');
  ok(await val('#inImp') === '' && (await pg.evaluate(() => document.activeElement.id)) === 'inImp' &&
     (await txt('#aviCap')).includes('no trae un importe'), 'SMS sin importe: pide escribirlo');

  // exportar y respaldo: se comparten directamente
  await pg.evaluate(() => { window.__mock.files = []; window.__mock.shares = []; });
  await pg.click('[onclick="exportarLoteActual()"]'); await espera();
  m = await M();
  ok(m.files.length === 1 && /^TRANSFERENCIAS_.*\.xlsx$/.test(m.files[0].path) && m.files[0].data.length > 1000 &&
     m.files[0].directory === 'CACHE' && !m.files[0].encoding, 'Excel escrito en base64');
  ok(m.shares.length === 1 && m.shares[0].files[0] === 'file:///cache/' + m.files[0].path, 'Excel compartido');
  ok(!(await pg.$('#modal.on')), 'sin guía de Descargas en el APK');
  await pg.evaluate(() => respaldar()); await espera();
  m = await M();
  ok(m.files[1] && m.files[1].path.endsWith('.json') && m.files[1].encoding === 'utf8' &&
     JSON.parse(m.files[1].data).registros.length === 1 && m.shares.length === 2, 'respaldo compartido');

  await pg.screenshot({ path: CFG.SALIDA + '/apk-captura.png' });
  ok(!errs.length, 'sin errores JS ' + errs.join('; '));
  await b.close();
})();
