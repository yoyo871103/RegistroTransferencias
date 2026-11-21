/* Licencias del APK: un código por tablet.

   Uso:
     node licencia.js                     prepara el secreto y el generador (la primera vez)
     node licencia.js K7M2Q-9XH4T         da la licencia para ese código de tablet
     node licencia.js K7M2Q-9XH4T 2026-12-21   licencia temporal: vale hasta ese día incluido

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

/* Licencia temporal (12 caracteres, la misma casilla que la permanente):
   3 caracteres = día de vencimiento contado desde el 2026-01-01 (15 bits, el más
   significativo primero; vale hasta el final de ese día) + 9 caracteres de
   HMAC-SHA256(secreto, "RT-TMP|" + código + "|" + esos 3). Igual que Licencia.java. */
const DIA_CERO = Date.UTC(2026, 0, 1);
function diaDe(fecha){          // 'AAAA-MM-DD' → días desde el 2026-01-01
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
  if (!m) throw new Error('La fecha de vencimiento va como AAAA-MM-DD.');
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - DIA_CERO) / 864e5);
}
function fechaDe(dia){ return new Date(DIA_CERO + dia * 864e5).toISOString().slice(0, 10); }
function diaEnBase32(dia){
  if (!(dia >= 0 && dia <= 32767)) throw new Error('La fecha de vencimiento está fuera de rango.');
  return ALFABETO[(dia >> 10) & 31] + ALFABETO[(dia >> 5) & 31] + ALFABETO[dia & 31];
}
function firmaTemporal(secretoHex, c, d){
  return base32(crypto.createHmac('sha256', Buffer.from(secretoHex, 'hex')).update('RT-TMP|' + c + '|' + d).digest(), 9);
}
// vence: 'AAAA-MM-DD', último día en que vale
function licenciaTemporal(secretoHex, codigo, vence){
  const c = normalizar(codigo);
  if (c.length !== 10) throw new Error('El código de la tablet tiene 10 caracteres (p. ej. K7M2Q-9XH4T).');
  const d = diaEnBase32(diaDe(vence));
  return agrupar(d + firmaTemporal(secretoHex, c, d), 4);
}
// 'AAAA-MM-DD' si la licencia es una temporal válida para ese código; null si no
function venceTemporal(secretoHex, codigo, licencia){
  const l = normalizar(licencia), c = normalizar(codigo), d = l.slice(0, 3);
  if (l.length !== 12 || /[^0-9A-HJKMNP-TV-Z]/.test(d) || firmaTemporal(secretoHex, c, d) !== l.slice(3)) return null;
  return fechaDe((ALFABETO.indexOf(d[0]) << 10) | (ALFABETO.indexOf(d[1]) << 5) | ALFABETO.indexOf(d[2]));
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

module.exports = { licenciaPara, licenciaTemporal, venceTemporal, diaDe, normalizar, base32, ALFABETO };

if (require.main === module){
  let secreto = leerSecreto();
  if (!secreto){
    secreto = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(ARCHIVO_SECRETO, secreto + '\n');
    console.log('Secreto nuevo creado en licencia.secreto. GUÁRDALO CON COPIA (no va a GitHub).');
  }
  escribirGenerador(secreto);
  const codigo = process.argv[2];
  const vence = process.argv[3];
  if (codigo && vence) console.log('Licencia temporal (hasta el ' + vence + ') para ' + agrupar(normalizar(codigo), 5) + ':  ' +
                                   licenciaTemporal(secreto, codigo, vence));
  else if (codigo) console.log('Licencia para ' + agrupar(normalizar(codigo), 5) + ':  ' + licenciaPara(secreto, codigo));
  else console.log('Generador listo: abre generador-licencias.html (no lo compartas: lleva el secreto).');
}
