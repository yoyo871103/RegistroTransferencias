// Prueba de punta a punta en el emulador con el formato REAL de PAGOxMOVIL
// (teléfonos y cuenta cambiados). Permisos reales, SMS reales (adb emu sms send),
// notificaciones, registro, "ya usado" y número tecleado antes de que llegue el SMS.
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

const SMS = (tel, imp, cod) => (tel ? `El titular del telefono ${tel} le ha realizado` : 'Se ha realizado') +
  ` una transferencia a la cuenta 9999000011112222 de ${imp} CUP. Nro. Transaccion ${cod}. Fecha: 15/10/2026.`;
const sms = (texto, de = 'PAGOxMOVIL') => adb('emu', 'sms', 'send', de, texto);
// solo las de esta app (la de Mensajes también muestra el texto del SMS)
const notificaciones = () => adb('shell', 'dumpsys', 'notification', '--noredact')
  .split('NotificationRecord(').filter(b => b.includes('pkg=' + PKG)).join(' | ');

async function tocar(textos, intentos = 10){
  for (let i = 0; i < intentos; i++){
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
    const xml = adb('shell', 'cat', '/sdcard/ui.xml');
    for (const t of textos){
      const m = new RegExp('text="' + t + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"', 'i').exec(xml);
      if (m){ adb('shell', 'input', 'tap', String((+m[1] + +m[3]) >> 1), String((+m[2] + +m[4]) >> 1)); return t; }
    }
    await espera(700);
  }
  return null;
}

let browser, pg;
async function conectar(){
  if (browser) try { browser.disconnect(); } catch(e){}
  let sock = '';
  for (let i = 0; i < 20 && !sock; i++){
    const pid = pidof();
    if (pid && adb('shell', 'cat', '/proc/net/unix').includes('webview_devtools_remote_' + pid)) sock = 'webview_devtools_remote_' + pid;
    else await espera(500);
  }
  adb('forward', 'tcp:9333', 'localabstract:' + sock);
  browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
  pg = (await browser.pages()).find(p => p.url().startsWith('https://localhost'));
  pg.on('dialog', d => d.accept());
  await pg.waitForFunction(() => typeof window.usarSms === 'function');
}
// en el APK los datos están en el archivo de la app (AlmacenNativo), no en localStorage
const datos = () => pg.evaluate(() => JSON.parse(AlmacenNativo.leer()));
const archivo = () => { try { return adb('shell', 'run-as', PKG, 'ls', '-la', 'files/datos.json'); } catch(e){ return ''; } };
const txt = s => pg.$eval(s, e => e.textContent);
const val = s => pg.$eval(s, e => e.value);

(async () => {
  adb('shell', 'pm', 'clear', PKG);
  for (const p of ['RECEIVE_SMS', 'READ_SMS', 'POST_NOTIFICATIONS'])
    try { adb('shell', 'pm', 'revoke', PKG, 'android.permission.' + p); } catch(e){}
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar();
  // tras borrar los datos la app pide licencia: se activa con el generador
  const { licenciaPara } = require(CFG.APK + '/licencia.js');
  const secreto = fs.readFileSync(CFG.APK + '/licencia.secreto', 'utf8').trim();
  const lic = licenciaPara(secreto, await pg.evaluate(() => LicenciaNativa.codigo()));
  await pg.$eval('#inLic', (e, v) => e.value = v, lic);
  await pg.evaluate(() => activarLicencia());
  ok(await pg.evaluate(() => document.querySelector('.vista.on').id) === 'vInicio', 'licencia activada');

  // 1. permisos
  await pg.evaluate(() => document.querySelectorAll('#vInicio .pie button')[1].click());
  await espera(500);
  ok((await val('#smsRem')) === 'PAGOxMOVIL', 'remitente por defecto: PAGOxMOVIL');
  await pg.click('#btnActivarSms');
  const p1 = await tocar(['Allow', 'Permitir']); await espera(800);
  const p2 = await tocar(['Allow', 'Permitir'], 5); await espera(1000);
  ok(p1 && p2 && (await txt('#smsEstado')).includes('Lectura de SMS: activa'), 'permisos concedidos');

  // 2. app abierta: llega, se registra con teléfono
  await pg.evaluate(() => { ver('vInicio'); pintarInicio(); abrirLote(); });
  sms(SMS('5351112233', '10000.00', 'KW601YFBRP999'));
  await espera(4000);
  ok((await txt('#bandeja')).includes('KW601YFBRP999') && (await txt('#bandeja')).includes('10,000.00'), 'app abierta: aparece');
  foto('r1-bandeja');
  await pg.evaluate(() => usarSms('KW601YFBRP999'));
  ok(await txt('#pre') === 'KW601' && await val('#inCod') === 'YFBRP' && await val('#inImp') === '10000.00' &&
     await val('#inTel') === '5111 2233', 'Registrar: código, importe y teléfono cargados');
  foto('r2-cargado');
  await pg.type('#inNom', 'Cliente Uno');
  await pg.type('#inCI', '88110305549');
  await pg.evaluate(() => agregar()); await espera(500);
  let d = await datos();
  ok(d.registros[0] && d.registros[0].codigo === 'KW601YFBRP999' && d.registros[0].telefono === '+53 5111 2233',
     'registrado con teléfono: ' + JSON.stringify(d.registros[0]));
  ok(/datos\.json/.test(archivo()) && (await pg.evaluate(() => localStorage.getItem('vt_registro_transferencias_v1'))) === null,
     'guardado en el archivo de la app, no en localStorage');

  // 2b. el mismo cliente vuelve a pagar: se propone su nombre y CI
  sms(SMS('5351112233', '500.00', 'KW601ZZZZZ999'));
  await espera(4000);
  ok((await txt('#bandeja')).includes('Cliente Uno'), 'Por registrar muestra el nombre del cliente conocido');
  await pg.evaluate(() => usarSms('KW601ZZZZZ999'));
  const sug = await txt('#sugCli');
  ok(sug.includes('Cliente Uno') && sug.includes('CI 88110305549') && sug.includes('1 vez'), 'sugerencia del cliente: ' + sug);
  foto('r2b-sugerencia');
  await pg.evaluate(() => usarCliente());
  ok(await val('#inNom') === 'Cliente Uno' && await val('#inCI') === '88110305549', 'Usar datos rellena nombre y CI');
  await pg.evaluate(() => agregar()); await espera(500);
  d = await datos();
  ok(d.clientes['+53 5111 2233'].veces === 2, 'cliente: 2 veces');

  // 3. el cajero teclea el número antes de que llegue el SMS
  await pg.evaluate(() => { ponerPatron('BR'); });
  await pg.type('#inCod', '1CTOF2');
  await pg.type('#inImp', '3460');
  await pg.evaluate(() => agregar()); await espera(800);
  d = await datos();
  ok(d.registros.some(r => r.codigo === 'BR601CTOF2997'), 'tecleado a mano: BR601CTOF2997');
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await espera(1000);
  sms(SMS('5353334455', '3460.00', 'BR601CTOF2997'));      // llega tarde
  sms(SMS('5352223344', '6350.00', 'KW601YF8TT999'));      // nuevo, en segundo plano
  sms(SMS('5355556677', '8500.00', 'KW601YED68999'), '5359998877');   // otro remitente
  await espera(5000);
  const n1 = notificaciones();
  ok(!n1.includes('BR601CTOF2997'), 'SMS tardío de un número ya tecleado: SIN notificación');
  ok(n1.includes('KW601YF8TT999'), 'segundo plano: notificación del nuevo');
  ok(!/Transferencia recibida[^\n]*KW601YED68999|KW601YED68999 ·/.test(n1), 'otro remitente: sin notificación de la app');

  // 4. app cerrada
  adb('shell', 'am', 'kill', PKG); await espera(1500);
  ok(!pidof(), 'proceso detenido');
  sms(SMS(null, '9400.00', 'KW601YFLS2999'));
  await espera(5000);
  ok(notificaciones().includes('KW601YFLS2999 · 9,400.00 CUP') || notificaciones().includes('KW601YFLS2999 · 9400.00 CUP'),
     'app cerrada: notificación (variante sin teléfono)');
  adb('shell', 'cmd', 'statusbar', 'expand-notifications'); await espera(1500);
  foto('r3-notificaciones');
  adb('shell', 'cmd', 'statusbar', 'collapse');

  // 5. al abrir: solo los 2 nuevos
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar(); await espera(1500);
  await pg.evaluate(() => abrirLote()); await espera(500);
  const band = await txt('#bandeja');
  ok(band.includes('KW601YF8TT999') && band.includes('KW601YFLS2999') && !band.includes('BR601CTOF2997') &&
     !band.includes('KW601YED68999'), 'al abrir: los nuevos sí; el tecleado a mano y el de otro remitente no');

  // 6. ya usado
  await pg.evaluate(() => descartarSms('KW601YFLS2999')); await espera(500);
  ok((await txt('#bandeja')).includes('KW601YFLS2999 marcado como ya usado') &&
     !(await pg.$('[onclick="usarSms(\'KW601YFLS2999\')"]')), 'Ya usado: sale de la lista, aviso con Deshacer');
  foto('r6-deshacer');
  await pg.evaluate(() => document.querySelector('#bandeja .deshacer button').click()); await espera(500);
  ok(!!(await pg.$('[onclick="usarSms(\'KW601YFLS2999\')"]')), 'Deshacer: vuelve a la lista');
  await pg.evaluate(() => descartarSms('KW601YFLS2999')); await espera(500);
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await espera(800);
  sms(SMS(null, '9400.00', 'KW601YFLS2999'));   // llega otra vez
  await espera(4000);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar(); await espera(1000);
  await pg.evaluate(() => abrirLote()); await espera(500);
  ok(!(await pg.$('[onclick="usarSms(\'KW601YFLS2999\')"]')) && (await txt('#bandeja')).includes('Usados hoy (1)'),
     'Ya usado: no vuelve a ofrecerse aunque llegue de nuevo (queda en "Usados hoy")');
  d = await datos();
  ok(d.porRegistrar.filter(p => p.codigo === 'KW601YFLS2999').length === 1 &&
     d.porRegistrar.find(p => p.codigo === 'KW601YFLS2999').usado, 'ni se duplica ni vuelve a pendiente');

  // 7. revisar hoy y diagnóstico
  await pg.evaluate(() => revisarHoy()); await espera(1500);
  ok((await txt('#aviCap')).includes('No hay transferencias nuevas'), 'revisar hoy: nada nuevo (ni el de otro remitente)');
  foto('r4-captura');
  await pg.evaluate(() => { ver('vInicio'); document.querySelectorAll('#vInicio .pie button')[1].click(); verSmsHoy(); });
  await espera(1500);
  const diag = await txt('#cajaModal');
  ok(diag.includes('✓ KW601YF8TT999 · 6,350.00 CUP · +53 5222 3344') && diag.includes('remitente no está en la lista'),
     'Ver SMS de hoy: lectura con teléfono y filtro de remitente');
  foto('r5-diagnostico');
  await pg.evaluate(() => cerrarModal());
  browser.disconnect();
})().catch(e => { console.error('ERROR', e); process.exit(1); });
