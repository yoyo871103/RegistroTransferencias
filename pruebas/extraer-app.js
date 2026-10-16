// Saca el código de la app (el segundo <script> de index.html) a salida/app.js
// para las pruebas unitarias t-*.js, y comprueba que no tenga errores de sintaxis.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { RAIZ, SALIDA } = require('./config');

const lineas = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8').replace(/\r/g, '').split('\n');
let n = 0, dentro = false;
const out = [];
for (const l of lineas){
  if (l === '<script>'){ n++; if (n === 2){ dentro = true; continue; } }
  if (dentro && l === '</script>') break;
  if (dentro) out.push(l);
}
const destino = path.join(SALIDA, 'app.js');
fs.writeFileSync(destino, out.join('\n'));
execFileSync(process.execPath, ['--check', destino], { stdio: 'inherit' });
console.log('salida/app.js listo (' + out.length + ' líneas, sintaxis correcta)');
