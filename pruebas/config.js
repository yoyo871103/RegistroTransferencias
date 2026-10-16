// Rutas de las pruebas. Se pueden cambiar con variables de entorno en otro PC.
const path = require('path');
const fs = require('fs');

const RAIZ = path.resolve(__dirname, '..');
const SALIDA = path.join(__dirname, 'salida');   // capturas, descargas, app.js extraído
fs.mkdirSync(SALIDA, { recursive: true });

module.exports = {
  RAIZ,
  APK: path.join(RAIZ, 'apk'),
  SALIDA,
  URL: 'file:///' + path.join(RAIZ, 'index.html').replace(/\\/g, '/'),
  CHROME: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ADB: process.env.ADB || 'C:/Program Files (x86)/Android/android-sdk/platform-tools/adb.exe',
};
