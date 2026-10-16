// Licencia por tablet en el emulador: pantalla de activación, SMS ignorados sin
// licencia, licencia equivocada, activación y que se mantiene al reabrir.
const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const APK = CFG.APK;
const { licenciaPara } = require(APK + '/licencia.js');
const SECRETO = fs.readFileSync(APK + '/licencia.secreto', 'utf8').trim();
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
  await pg.waitForFunction(() => typeof window.activarLicencia === 'function');
}
const visible = () => pg.evaluate(() => document.querySelector('.vista.on').id);
const txt = s => pg.$eval(s, e => e.textContent);

(async () => {
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'pm', 'grant', PKG, 'android.permission.RECEIVE_SMS');
  adb('shell', 'pm', 'grant', PKG, 'android.permission.READ_SMS');
  adb('shell', 'pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS');
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar(); await espera(800);

  ok(await visible() === 'vLicencia', 'sin licencia: solo la pantalla de activación');
  const codigo = await txt('#licTablet');
  ok(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(codigo), 'muestra el código de la tablet: ' + codigo);
  foto('l1-activacion');

  // SMS sin licencia: ni se guarda ni se avisa
  adb('emu', 'sms', 'send', 'PAGOxMOVIL', 'El titular del telefono 5351112233 le ha realizado una transferencia a la cuenta 9999000011112222 de 100.00 CUP. Nro. Transaccion KW601LIC01999. Fecha: 16/10/2026.');
  await espera(4000);
  ok(!notifApp().includes('KW601LIC01999'), 'sin licencia: el SMS no se notifica');

  // licencia equivocada (la de otra tablet)
  const otra = licenciaPara(SECRETO, 'ZZZZZ-ZZZZZ');
  await pg.type('#inLic', otra.replace(/-/g, ''));
  ok(await pg.$eval('#inLic', e => e.value) === otra, 'el campo pone los guiones solo: ' + otra);
  await pg.evaluate(() => activarLicencia()); await espera(300);
  ok(await visible() === 'vLicencia' && (await txt('#aviLic')).includes('no es para esta tablet'), 'licencia de otra tablet: rechazada');

  // la buena, tecleada en minúsculas y con O en vez de 0 si la tuviera
  const buena = licenciaPara(SECRETO, codigo);
  await pg.$eval('#inLic', e => e.value = '');
  await pg.type('#inLic', buena.toLowerCase());
  foto('l2-licencia');
  await pg.evaluate(() => activarLicencia()); await espera(500);
  ok(await visible() === 'vInicio' && (await txt('#aviInicio')).includes('App activada'), 'licencia correcta: la app arranca');

  // con licencia, el SMS sí se procesa
  adb('emu', 'sms', 'send', 'PAGOxMOVIL', 'El titular del telefono 5351112233 le ha realizado una transferencia a la cuenta 9999000011112222 de 200.00 CUP. Nro. Transaccion KW601LIC02999. Fecha: 16/10/2026.');
  await espera(4000);
  ok((await pg.evaluate(() => JSON.parse(AlmacenNativo.leer() || '{"porRegistrar":[]}').porRegistrar.map(p => p.codigo))).includes('KW601LIC02999') ||
     (await pg.$eval('#alertas', e => e.textContent)).includes('transferencia'), 'con licencia: el SMS llega a la app');

  // ajustes muestra la licencia
  await pg.evaluate(() => document.querySelectorAll('#vInicio .pie button')[1].click());
  ok((await txt('#infoDatos')).includes('Licencia: activa · tablet ' + codigo), 'Ajustes muestra la licencia');

  // se mantiene al cerrar y reabrir
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar(); await espera(800);
  ok(await visible() === 'vInicio', 'al reabrir sigue activada');

  // copiar la licencia guardada a mano no sirve si no corresponde (se valida cada vez)
  adb('shell', 'am', 'force-stop', PKG);
  const xml = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map><string name=\"codigo\">" +
              otra.replace(/-/g, '') + '</string></map>';
  const b64 = Buffer.from(xml).toString('base64');
  adb('shell', `run-as ${PKG} sh -c 'echo ${b64} | base64 -d > /data/data/${PKG}/shared_prefs/licencia.xml'`);
  ok(adb('shell', `run-as ${PKG} cat /data/data/${PKG}/shared_prefs/licencia.xml`).includes(otra.replace(/-/g, '')),
     'licencia de otra tablet escrita a mano en los datos de la app');
  adb('shell', 'am', 'start', '-W', '-n', PKG + '/.MainActivity');
  await conectar(); await espera(800);
  ok(await visible() === 'vLicencia', 'licencia de otra tablet copiada a mano: no activa');

  browser.disconnect();
})().catch(e => { console.error('ERROR', e); process.exit(1); });
