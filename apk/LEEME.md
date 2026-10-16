# Registro de Transferencias — versión APK

Es la **misma app** que la PWA (el `index.html` de la raíz), metida en un APK
con Capacitor, más dos cosas que una página web no puede hacer:

- **Leer los SMS de PAGOxMOVIL y ENZONA.** Cuando llega uno con un pago,
  aunque la app esté cerrada, sale una notificación. En la pantalla de captura
  aparece la lista **Por registrar (SMS)**:
  - **Registrar** pone en el formulario el No. de transacción, el importe y el
    teléfono de quien pagó (si el SMS lo trae); el cajero revisa y toca AGREGAR.
  - **Ya usado** lo quita y no se vuelve a ofrecer.
  - **Revisar SMS de hoy** busca en la bandeja las del día por si alguna no avisó.
- **Compartir el Excel y la copia de seguridad directamente** (WhatsApp, Zapya…),
  sin pasar por Descargas.

Reglas de la lista:

- Solo se ofrecen los SMS **llegados hoy**; los de días anteriores no.
- No se ofrece (ni avisa) un SMS cuyo número **ya está registrado**: por ejemplo,
  si el cajero lo tecleó porque el SMS tardaba y el SMS llega después.
- Por defecto solo se miran los SMS del remitente **PAGOxMOVIL**
  (Ajustes → Mensajes del banco → Remitentes).

Formato que se lee (octubre de 2026); si el banco lo cambia, **Ajustes → Ver SMS
de hoy** muestra cada SMS y lo que entiende la app:

```
El titular del telefono 53XXXXXXXX le ha realizado una transferencia a la cuenta
XXXXXXXXXXXXXXXX de 10000.00 CUP. Nro. Transaccion KW601YFBRP999. Fecha: 15/10/2026.
```

También se leen los pagos de **ENZONA** (remitente `ENZONA`):

```
ENZONA pago recibido, Importe: 10.00 CUP No.: Xn24kbc2NDFV
```

Su número lleva mayúsculas y minúsculas y se guarda y exporta **tal cual**
(al comparar si ya está registrado no se distinguen). Los "códigos de acceso"
que manda ENZONA se ignoran.

La PWA no cambia: al no estar dentro del APK, todo esto queda apagado.

## Licencia por tablet

Sin licencia, el APK solo muestra la pantalla **Activar la app** y no lee los
SMS. La licencia sirve para una sola tablet.

**Para activar una tablet:**

1. El cliente abre la app y te envía el **código de esta tablet**
   (botón *Enviar*, p. ej. por WhatsApp). Ejemplo: `E4W5N-7PM6Y`.
2. Tú abres `apk/generador-licencias.html` en tu PC, pegas el código y copias la
   licencia (`XXXX-XXXX-XXXX`). También por consola: `node licencia.js E4W5N-7PM6Y`.
3. El cliente la escribe en la app y toca **Activar**.

**El secreto** (`apk/licencia.secreto`) se creó una sola vez con
`node licencia.js`; el APK lo lleva dentro al compilar y el generador también.
**No va a GitHub** (el repositorio es público) y `generador-licencias.html`
tampoco: no lo compartas, con él cualquiera fabrica licencias.
**Guarda `licencia.secreto` con copia, junto a la clave de firma.** Si se
pierde, las tablets ya activadas siguen funcionando, pero para activar otras
habría que crear un secreto nuevo y repartir un APK nuevo.

Cuándo cambia el código de una tablet (y hay que darle otra licencia):

- si se restablece de fábrica;
- si se instala un APK firmado con **otra** clave (por eso las licencias que
  des para el APK de pruebas no sirven para el APK firmado de entrega).

Desinstalar y volver a instalar el mismo APK firmado **no** cambia el código.

Es un freno para que no se pase el APK entre clientes, no una cerradura
imposible: alguien con conocimientos puede descompilar un APK.

## Dónde guarda los datos

En un archivo propio de la app (`files/datos.json` en su carpeta privada), no en
`localStorage` como la PWA: no tiene el límite de 5 MB, solo el espacio libre de
la tablet (la app avisa si quedan menos de 50 MB). Cada guardado escribe primero
un temporal y luego lo cambia por el bueno de una vez, así que un corte de
corriente a mitad no deja los datos a medias. Al actualizar desde una versión
que usaba `localStorage`, los datos se pasan solos al archivo la primera vez
que se abre. Lo hace `AlmacenPlugin.java`.

Desinstalar la app o "Borrar datos" en los ajustes de Android **borra ese
archivo**: la copia de seguridad sigue siendo necesaria.

---

## Qué hay en esta carpeta

```
copiar-web.js        copia ../index.html e iconos a www/ e inyecta capacitor.js
capacitor.config.json
android/             proyecto Android (Android Studio)
  app/src/main/java/com/vtsoftware/transferencias/
    SmsReceiver.java   recibe cada SMS que entra (también con la app cerrada)
    Bandeja.java       guarda los que parecen transferencia y notifica
    SmsPlugin.java     puente con la app web (Capacitor.registerPlugin('Sms'))
    AlmacenPlugin.java archivo de datos de la app (window.AlmacenNativo)
    MainActivity.java
```

`www/` y la copia dentro de `android/` se generan: **no se editan a mano**.
Todo cambio de la app se hace en el `index.html` de la raíz.

---

## Preparar el PC (una sola vez)

- Node 22 o superior.
- JDK 21 y Android SDK con **Android 16 (API 36)** y **build-tools 36.0.0**.
  Los trae Android Studio, y también Visual Studio con la carga de trabajo de
  .NET para Android (`C:\Program Files\Android\openjdk\jdk-21.*` y
  `C:\Program Files (x86)\Android\android-sdk`).
- `android/local.properties` (no va al repositorio) con la ruta del SDK:
  ```
  sdk.dir=C\:/Program Files (x86)/Android/android-sdk
  ```

## Compilar

```
cd apk
npm install
npm run sync                 copia la web y actualiza el proyecto Android
cd android
set JAVA_HOME=C:\Program Files\Android\openjdk\jdk-21.0.8
gradlew -I ..\espejo-google.gradle assembleDebug
```

Sale en `android/app/build/outputs/apk/debug/app-debug.apk`.

**Si Google responde "404" al descargar** (pasa desde algunas redes, p. ej.
Starlink en la región): `-I ..\espejo-google.gradle` usa un espejo público del
repositorio de Google. Si desde tu red Google funciona, se puede quitar. Por la
misma razón el proyecto usa las build-tools 36.0.0 que ya trae el SDK
(`variables.gradle`), en vez de descargar las 35.

## Probar en el emulador

Sirven los emuladores creados en Visual Studio (Herramientas → Android →
Administrador de dispositivos Android); hay uno de tablet. Con el emulador
abierto:

```
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb emu sms send PAGOxMOVIL "El titular del telefono 5351112233 le ha realizado una transferencia a la cuenta 9999000011112222 de 1250.00 CUP. Nro. Transaccion KW601ABCDE999. Fecha: 15/10/2026."
```

El segundo comando simula que llega un SMS (el texto es inventado). También se
puede desde el emulador: **⋯ → Phone → SMS message**.

**APK de entrega** (firmado), en la misma carpeta `android`:

```
gradlew -I ..\espejo-google.gradle assembleRelease
```

Sale en `android/app/build/outputs/apk/release/app-release.apk`; cópialo a
`apk/entrega/RegistroTransferencias-<versión>.apk` para llevarlo al cliente.
Usa la clave `apk/firma/registro-transferencias.jks` y su contraseña en
`apk/keystore.properties` (ninguno de los dos va al repositorio).

La clave de firma es lo más importante del proyecto, junto con `licencia.secreto`:

- **Sin ella no se pueden publicar actualizaciones**: Android rechaza un APK
  nuevo firmado con otra clave, y el cliente tendría que desinstalar (y perder
  los datos si no hizo copia).
- Guárdala con su contraseña en dos sitios distintos. **Nunca** en el
  repositorio (el `.gitignore` ya la excluye).

Cada versión nueva: subir `versionCode` (y `versionName`) en
`android/app/build.gradle`.

---

## Instalar en la tablet

1. Pasar el APK por Zapya, WhatsApp o cable y abrirlo. Android pedirá permitir
   "instalar apps de origen desconocido" para la app con la que se abrió.
2. Abrir la app → **Ajustes → Mensajes del banco (SMS) → Activar lectura de SMS**.
3. Si Android **no muestra** la ventana del permiso (Android 13 o más nuevo,
   por estar instalada fuera de Google Play):
   Ajustes de Android → Aplicaciones → Registro de Transferencias →
   **⋮ → Permitir ajustes restringidos** → Permisos → SMS → Permitir.
   La app muestra estos pasos si hace falta.
4. Opcional: en **Remitentes del banco**, poner el nombre con el que llegan los
   SMS del banco, para no mirar los demás.

Algunas marcas cierran las apps en segundo plano para ahorrar batería; si las
notificaciones no llegan, quitar la app del ahorro de batería. Aunque no
lleguen, **Revisar SMS de hoy** recupera las transferencias del día.

## Pasar de la PWA al APK

Son apps distintas para Android: los datos no pasan solos. En la PWA,
**Ajustes → Guardar copia**; en el APK, **Ajustes → Restaurar** con ese archivo.
