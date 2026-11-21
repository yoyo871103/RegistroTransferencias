// El generador HTML sin crypto.subtle (como al abrirlo desde el gestor de archivos del
// móvil) debe dar las mismas licencias que licencia.js (y por tanto que Licencia.java).
const CFG = require('./config');
const puppeteer = require('puppeteer-core');
const fs = require('fs'), crypto = require('crypto');
const { licenciaPara, base32 } = require(CFG.APK + '/licencia.js');
const SECRETO = fs.readFileSync(CFG.APK + '/licencia.secreto', 'utf8').trim();
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

(async () => {
  const b = await puppeteer.launch({ executablePath: CFG.CHROME, headless: true });
  const pg = await b.newPage();
  await pg.setViewport({ width: 380, height: 700, isMobile: true });
  await pg.evaluateOnNewDocument(() => {
    Object.defineProperty(window.crypto, 'subtle', { get: () => undefined });
    Object.defineProperty(navigator, 'clipboard', { get: () => undefined });
  });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file:///' + (CFG.APK + '/generador-licencias.html').split(String.fromCharCode(92)).join('/'));
  ok(await pg.evaluate(() => crypto.subtle === undefined), 'simulación: sin crypto.subtle ni portapapeles');
  const codigos = ['EA416-0EPQH'];
  for (let i = 0; i < 200; i++) codigos.push(base32(crypto.randomBytes(8), 10));
  let iguales = 0;
  for (const c of codigos){
    await pg.$eval('#codigo', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, c.toLowerCase());
    const v = await pg.$eval('#valor', e => e.textContent);
    if (v === licenciaPara(SECRETO, c)) iguales++; else console.log('  distinta', c, v, licenciaPara(SECRETO, c));
  }
  ok(iguales === codigos.length, 'mismas licencias que licencia.js: ' + iguales + '/' + codigos.length);
  await pg.$eval('#codigo', e => { e.value = 'EA416-0EPQH'; e.dispatchEvent(new Event('input')); });
  ok(await pg.$eval('#valor', e => e.textContent) === 'GQC2-0YND-RG81', 'tablet del cliente EA416-0EPQH → GQC2-0YND-RG81');
  await pg.click('#copiar');
  ok((await pg.$eval('#copiar', e => e.textContent)) === 'Copiada' || (await pg.$eval('#err', e => e.textContent)).includes('mantén pulsada'),
     'Copiar funciona o explica cómo copiar');
  await pg.screenshot({ path: CFG.SALIDA + '/generador-movil.png' });
  ok(!errs.length, 'sin errores JS ' + errs.join('; '));
  await b.close();
})();
