// Licencia temporal en el emulador: vencida, de otra tablet, activación con fecha,
// cambio por otra temporal y por la permanente, vencida con la app ya activada y
// reloj atrasado. No cambia la hora del emulador: las situaciones se fabrican con
// licencias de otras fechas y escribiendo los datos de la licencia a mano.
// Necesita el APK de PRUEBAS instalado y un emulador abierto. Borra los datos de la app.
const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const APK = CFG.APK;
const { licenciaPara, licenciaTemporal } = require(APK + '/licencia.js');
const SECRETO = fs.readFileSync(APK + '/licencia.secreto', 'utf8').trim();
const ADB = CFG.ADB;
const PKG = 'com.vtsoftware.transferencias';
const DIR = CFG.SALIDA;
const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c || d === undefined ? '' : '  → ' + JSON.stringify(d))); if (!c) process.exitCode = 1; };
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' });
const pidof = () => { try { return adb('shell', 'pidof', PKG).trim(); } catch(e){ return ''; } };
const espera = ms => new Promise(r => setTimeout(r, ms));
const foto = n => fs.writeFileSync(`${DIR}/${n}.png`, execFileSync(ADB, ['exec-out', 'screencap', '-p']));
// días desde el 2026-01-01 ↔ fechas
const iso = dia => new Date(Date.UTC(2026, 0, 1 + dia)).toISOString().slice(0, 10);
const visible = dia => iso(dia).split('-').reverse().join('/');

let browser, pg;
// justo después de arrancar, a veces la conexión toma la página antes de que cargue:
// si no aparece la app en 10 s, se vuelve a conectar
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
async function reabrir(){
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar();
}
const vista = () => pg.evaluate(() => document.querySelector('.vista.on').id);
const txt = s => pg.$eval(s, e => e.textContent);
const estado = () => pg.evaluate(() => JSON.parse(LicenciaNativa.estado()));
async function escribir(lic){
  // el tecleo (guiones, minúsculas) ya lo prueba prueba-licencia.js
  await pg.$eval('#inLic', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, lic);
  await pg.evaluate(() => activarLicencia());
  await espera(400);
}
// datos de la licencia escritos a mano (como haría alguien con acceso a la tablet)
function prefs(codigo, visto){
  adb('shell', 'am', 'force-stop', PKG);
  const xml = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map><string name=\"codigo\">" + codigo.replace(/-/g, '') +
              '</string>' + (visto != null ? '<int name="visto" value="' + visto + '" />' : '') + '</map>';
  const b64 = Buffer.from(xml).toString('base64');
  adb('shell', `run-as ${PKG} sh -c 'echo ${b64} | base64 -d > /data/data/${PKG}/shared_prefs/licencia.xml'`);
}
const sms = ref => adb('emu', 'sms', 'send', 'PAGOxMOVIL', 'El titular del telefono 5351112233 le ha realizado una transferencia ' +
  'a la cuenta 9999000011112222 de 100.00 CUP. Nro. Transaccion ' + ref + '. Fecha: 16/10/2026.');
const notifApp = () => adb('shell', 'dumpsys', 'notification', '--noredact')
  .split('NotificationRecord(').filter(b => b.includes('pkg=' + PKG)).join(' | ');

(async () => {
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'pm', 'grant', PKG, 'android.permission.RECEIVE_SMS');
  adb('shell', 'pm', 'grant', PKG, 'android.permission.READ_SMS');
  adb('shell', 'pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS');
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar();

  const codigo = await txt('#licTablet');
  const hoy = (await estado()).hoy;
  ok(hoy > 300 && hoy < 2000, 'la app cuenta los días desde el 2026-01-01: hoy es ' + hoy + ' (' + iso(hoy) + ')');

  await escribir(licenciaTemporal(SECRETO, codigo, iso(hoy - 1)));
  ok(await vista() === 'vLicencia' && (await txt('#aviLic')).includes('ya venció'), 'temporal vencida ayer: rechazada', await txt('#aviLic'));
  await escribir(licenciaTemporal(SECRETO, 'ZZZZZ-ZZZZZ', iso(hoy + 30)));
  ok((await txt('#aviLic')).includes('no es para esta tablet'), 'temporal de otra tablet: rechazada');

  await escribir(licenciaTemporal(SECRETO, codigo, iso(hoy + 30)));
  ok(await vista() === 'vInicio' && (await txt('#aviInicio')).includes('App activada hasta el ' + visible(hoy + 30)),
     'temporal de 30 días: la app arranca y dice hasta cuándo');
  let e = await estado();
  ok(e.activa && e.temporal && e.vence === hoy + 30, 'estado: temporal, vence el día ' + e.vence);
  foto('t1-activada');

  sms('KW601TMP01999');
  await espera(4000);
  ok(notifApp().includes('KW601TMP01999') ||
     (await pg.evaluate(() => JSON.parse(AlmacenNativo.leer() || '{"porRegistrar":[]}').porRegistrar.map(p => p.codigo))).includes('KW601TMP01999'),
     'con la temporal vigente, los SMS se leen');

  await pg.evaluate(() => document.querySelectorAll('#vInicio .pie button')[1].click());
  ok((await txt('#infoDatos')).includes('Licencia: temporal, hasta el ' + visible(hoy + 30)), 'Ajustes muestra la temporal y la fecha');
  foto('t2-ajustes');

  // otra temporal más corta desde Ajustes: al reabrir avisa que vence pronto
  await pg.evaluate(() => mostrarLicencia());
  ok(await vista() === 'vLicencia' && (await txt('#licTexto')).includes('licencia temporal hasta el ' + visible(hoy + 30)) &&
     await pg.$eval('#licPie', e => e.style.display !== 'none'), 'Escribir otra licencia: abre la activación con Volver');
  await escribir(licenciaTemporal(SECRETO, codigo, iso(hoy + 2)));
  ok(await vista() === 'vInicio', 'temporal de 2 días aceptada con la app en marcha');
  await reabrir();
  ok((await txt('#aviInicio')).includes('vence el ' + visible(hoy + 2)), 'al abrir, avisa que la licencia vence pronto');
  foto('t3-vence-pronto');

  // la permanente reemplaza a la temporal; después no se puede volver a una temporal
  await pg.evaluate(() => mostrarLicencia());
  await escribir(licenciaPara(SECRETO, codigo));
  e = await estado();
  ok(await vista() === 'vInicio' && e.activa && !e.temporal, 'la permanente reemplaza a la temporal');
  await pg.evaluate(() => mostrarLicencia());
  await escribir(licenciaTemporal(SECRETO, codigo, iso(hoy + 30)));
  ok((await txt('#aviLic')).includes('ya tiene licencia permanente'), 'con la permanente, una temporal no la reemplaza');
  ok((await estado()).temporal === false, 'sigue la permanente');

  // una temporal que venció con la app ya activada
  prefs(licenciaTemporal(SECRETO, codigo, iso(hoy - 1)), hoy - 1);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar();
  ok(await vista() === 'vLicencia' && (await txt('#licTexto')).includes('venció el ' + visible(hoy - 1)), 'temporal vencida: pide licencia nueva');
  foto('t4-vencida');
  sms('KW601TMP02999');
  await espera(4000);
  ok(!notifApp().includes('KW601TMP02999'), 'con la temporal vencida, el SMS no se notifica');

  // reloj atrasado: la app ya se usó 10 días después de hoy
  prefs(licenciaTemporal(SECRETO, codigo, iso(hoy + 30)), hoy + 10);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar();
  ok(await vista() === 'vLicencia' && (await txt('#licTexto')).includes('fecha de esta tablet está atrasada'), 'reloj atrasado: no deja usar la temporal');
  ok(await pg.$eval('#licPie', e => e.style.display === 'none'), 'reloj atrasado: sin botón Volver');
  foto('t5-reloj');
  // un día de margen (cambio de huso horario)
  prefs(licenciaTemporal(SECRETO, codigo, iso(hoy + 30)), hoy + 1);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar();
  ok(await vista() === 'vInicio', 'un día de diferencia con el último uso: se acepta');

  browser.disconnect();
})().catch(e => { console.error('ERROR', e); process.exit(1); });
