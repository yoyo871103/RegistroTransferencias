# Pruebas automáticas

```
cd pruebas
npm install                 (una vez: puppeteer-core)
npm run todo                unitarias + PWA en Chrome
npm run emulador            APK en el emulador (ver abajo)
```

Rutas en `config.js` (Chrome y adb); se pueden cambiar con las variables de
entorno `CHROME` y `ADB`. Capturas, descargas y `app.js` extraído van a
`salida/` (no se versiona).

| Archivo | Qué prueba |
|---|---|
| `t-ci.js` | validación del carnet de identidad (siglo por fecha) |
| `t-sms.js` | lector de SMS de PAGOxMOVIL; solo hoy, registrados, usados |
| `t-enzona.js` | lector de SMS de ENZONA; códigos de acceso; mayúsculas |
| `prueba.js` | formatos del No. de transacción configurables |
| `prueba-tel.js` | teléfono +53, orden con Enter, Excel |
| `prueba-memoria.js` | memoria llena, avisos, copia de seguridad, guía del Excel |
| `prueba-clientes.js` | clientes frecuentes, pantalla compacta |
| `prueba-apk.js` | la app en modo APK con plugins simulados (SMS, compartir) |
| `prueba-emulador.js` | APK real: permisos, SMS con app abierta/cerrada, notificaciones, licencia, datos en archivo |
| `prueba-enzona.js` | APK real: pagos de ENZONA (correr después de `prueba-emulador.js`) |
| `prueba-licencia.js` | APK real: activación, licencia equivocada o manipulada |

Las `t-*.js` usan `salida/app.js`, que crea `node extraer-app.js` (lo hace
`npm run unitarias`).

**Emulador**: abrir uno (p. ej. el de tablet de Visual Studio,
`tablet_420-dpi_7_6in_-_api_36_0`) e instalar el APK de **pruebas**
(`assembleDebug`): el de entrega no permite conectar la depuración del WebView.
Las pruebas borran los datos de la app (`pm clear`) y activan la licencia con
`apk/licencia.secreto`. Envían SMS con `adb emu sms send`.
