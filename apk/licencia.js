/* Licencias del APK: un código por tablet.

   Uso:
     node licencia.js                     prepara el secreto y el generador (la primera vez)
     node licencia.js K7M2Q-9XH4T         da la licencia para ese código de tablet

   Cómo funciona:
   - La app muestra el "código de esta tablet", sacado del identificador que
     Android le da a la app en esa tablet (ANDROID_ID).
   - La licencia es una firma corta de ese código hecha con un SECRETO que solo
     tienen este generador y el APK que tú compilas. Sin el secreto no se puede
     fabricar una licencia, y una licencia no sirve en otra tablet.

   El secreto está en licencia.secreto (NO va a GitHub: el repositorio es
   público). Guárdalo con copia, como la clave de firma: si se pierde, las
   tablets ya activadas siguen funcionando, pero las licencias nuevas tendrían
   que hacerse con un secreto nuevo y un APK nuevo.

   El cálculo tiene que ser idéntico al de Licencia.java. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARCHIVO_SECRETO = path.join(__dirname, 'licencia.secreto');
const ARCHIVO_GENERADOR = path.join(__dirname, 'generador-licencias.html');
// base32 de Crockford: sin I, L, O, U para que no se confundan al teclear
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32(bytes, largo){
  let bits = 0, valor = 0, out = '';
  for (const b of bytes){
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5 && out.length < largo){ out += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
    valor &= (1 << bits) - 1;
    if (out.length >= largo) break;
  }
  return out;
}
// lo que teclea la persona: mayúsculas, sin guiones; O→0, I/L→1
function normalizar(t){
  return String(t || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
}
function agrupar(t, n){ return t.match(new RegExp('.{1,' + n + '}', 'g')).join('-'); }

function licenciaPara(secretoHex, codigoTablet){
  const c = normalizar(codigoTablet);
  if (c.length !== 10) throw new Error('El código de la tablet tiene 10 caracteres (p. ej. K7M2Q-9XH4T).');
  const firma = crypto.createHmac('sha256', Buffer.from(secretoHex, 'hex')).update('RT-LIC|' + c).digest();
  return agrupar(base32(firma, 12), 4);
}

function leerSecreto(){
  if (!fs.existsSync(ARCHIVO_SECRETO)) return null;
  const s = fs.readFileSync(ARCHIVO_SECRETO, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error('licencia.secreto no es válido.');
  return s;
}

function escribirGenerador(secreto){
  const html = fs.readFileSync(path.join(__dirname, 'generador-licencias.plantilla.html'), 'utf8')
    .replace('__SECRETO__', secreto);
  fs.writeFileSync(ARCHIVO_GENERADOR, html);
}

module.exports = { licenciaPara, normalizar, base32, ALFABETO };

if (require.main === module){
  let secreto = leerSecreto();
  if (!secreto){
    secreto = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(ARCHIVO_SECRETO, secreto + '\n');
    console.log('Secreto nuevo creado en licencia.secreto. GUÁRDALO CON COPIA (no va a GitHub).');
  }
  escribirGenerador(secreto);
  const codigo = process.argv[2];
  if (codigo) console.log('Licencia para ' + agrupar(normalizar(codigo), 5) + ':  ' + licenciaPara(secreto, codigo));
  else console.log('Generador listo: abre generador-licencias.html (no lo compartas: lleva el secreto).');
}
