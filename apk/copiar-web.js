/* Copia la app web (la misma que se publica como PWA) a www/, que es lo que
   Capacitor mete dentro del APK. El index.html sigue existiendo en un solo
   sitio: la raíz del repositorio.

   En la copia se inyecta capacitor.js, que da acceso a los plugins nativos
   (SMS, compartir archivos). La PWA no lo lleva: allí la app ve que no está
   dentro del APK y sigue igual que siempre. */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const www = path.join(__dirname, 'www');
const ARCHIVOS = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-mask.png'];

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www);
for (const f of ARCHIVOS) fs.copyFileSync(path.join(raiz, f), path.join(www, f));
fs.copyFileSync(require.resolve('@capacitor/core/dist/capacitor.js'), path.join(www, 'capacitor.js'));

const destino = path.join(www, 'index.html');
let html = fs.readFileSync(destino, 'utf8');
const marca = '<meta charset="utf-8">';
if (!html.includes(marca)) throw new Error('No se encontró ' + marca + ' en index.html');
html = html.replace(marca, marca + '\n<script src="capacitor.js"></script>');
fs.writeFileSync(destino, html);

console.log('www/ listo: ' + ARCHIVOS.length + ' archivos + capacitor.js');
