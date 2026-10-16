# Registro de Transferencias — contexto del proyecto

App para que los cajeros de un negocio en Cuba registren las transferencias
recibidas (Transfermóvil/PAGOxMOVIL y ENZONA) y las exporten a Excel para el
**Conciliador** (otro programa del mismo desarrollador, VT Software).
Autor: Yosvel Vasallo. Todo el texto de la app, los comentarios y las
respuestas al usuario van **en español**.

Hay **dos versiones del mismo código**:

| | PWA | APK (Android) |
|---|---|---|
| Código | `index.html` (raíz) | el mismo `index.html` dentro de Capacitor 8 (`apk/`) |
| Publicación | GitHub Pages desde `main`: https://yoyo871103.github.io/RegistroTransferencias/ | archivo `.apk` que el desarrollador pasa por Zapya/WhatsApp (sin Google Play) |
| Datos | `localStorage` (~5 MB) | archivo propio `files/datos.json` (sin límite) |
| SMS del banco | no | sí (lee, notifica y propone registrar) |
| Licencia | no | sí, por tablet |

El repositorio es **público**: nunca subir secretos, claves ni datos reales de clientes.

---

## Archivos

```
index.html            toda la app (HTML + CSS + JS, SheetJS embebido en el 1er <script>)
sw.js                 service worker de la PWA (caché offline)
manifest.webmanifest  PWA
fonts/                Inter (OFL) — tipografía del estilo Tailux
icon-*.png
LEEME.md              guía para el usuario (instalar la PWA, memoria, enviar el Excel)
apk/                  proyecto Android (ver apk/LEEME.md)
  copiar-web.js       copia index.html, iconos y fuentes a apk/www e inyecta capacitor.js
  espejo-google.gradle espejo de Maven de Google (ver "Compilar")
  licencia.js         generador de licencias (consola) + crea generador-licencias.html
  generador-licencias.plantilla.html
  android/app/src/main/java/com/vtsoftware/transferencias/
    MainActivity.java   registra los plugins propios
    SmsReceiver.java    recibe cada SMS (aunque la app esté cerrada)
    Bandeja.java        decide si un SMS es un pago, lo guarda en cola y notifica
    SmsPlugin.java      puente Capacitor 'Sms' (permisos, pendientes, leerDesde…)
    AlmacenPlugin.java  window.AlmacenNativo: datos en archivo, llamadas SÍNCRONAS
    LicenciaPlugin.java window.LicenciaNativa: licencia por tablet, SÍNCRONO
    Licencia.java       cálculo de la licencia (Java puro, igual que licencia.js)
pruebas/              pruebas automáticas (ver pruebas/LEEME.md)
```

---

## index.html por dentro

- JS sin frameworks ni compilación, estilo ES5 (`var`, `function`), dentro de una
  IIFE. Las funciones que usa el HTML (`onclick`) se exponen al final con
  `window.x = x`. Seguir ese estilo.
- Estado en memoria: `d`. Se guarda entero como JSON con `guardar()`.
- **`guardar()` es síncrono y devuelve true/false.** Si falla, avisa y hace
  `cargar()` (deshace el último cambio). Quien llama debe mirar el resultado:
  así nunca se muestra "Registrado" para algo que no se guardó. Por eso el APK
  usa una interfaz JavaScript síncrona (`AlmacenNativo`) y no un plugin async.
- `NATIVO` = dentro del APK (hay `window.Capacitor`, que solo inyecta
  `copiar-web.js` en la copia del APK). Todo lo de SMS/compartir/licencia
  depende de eso; en la PWA queda apagado.
- `completar()` pone valores por defecto y migra datos viejos (se llama al
  cargar y al restaurar una copia).

Modelo `d`:

```
cajeros: [string]            ultimoCajero, ultimoPatron, ultimaCopia ('AAAA-MM-DD')
registros: [{ id, fecha (del lote), cajero, codigo, importe, hora,
              nombre, ci, telefono ('+53 5555 1803') }]
patrones: [{ id:'KW'|'BR'|'MM', pre, suf }]   formatos del No. de transacción (Ajustes)
clientes: { '+53 …': { nombre, ci, veces, ultima } }   clientes frecuentes por teléfono
porRegistrar: [{ codigo, importe, telefono, remitente, fecha, hora, texto, usado? }]  (APK)
smsDescartados: [codigo]     marcados "Ya usado"
sms: { remitentes: ['PAGOxMOVIL','ENZONA'], v: 2 }
```

Clave de localStorage: `vt_registro_transferencias_v1`.

## Reglas de negocio

- **No. de transacción** de PAGOxMOVIL: 13 caracteres = inicio fijo + parte que
  teclea el cajero + final fijo. Formatos de fábrica `KW601…999`, `BR60…997`,
  `MM604…987` (editables en Ajustes porque el banco los va subiendo). "Otro" =
  código completo. Se teclea en mayúsculas.
- **ENZONA**: número de 12 caracteres con mayúsculas y minúsculas
  (`Xn24kbc2NDFV`). Desde un SMS se guarda tal cual (`codigoSms`, clase
  `exacto`); los números se comparan sin distinguir mayúsculas (`mismoCodigo`).
- **Carnet de identidad (CI)**: 11 dígitos AAMMDD + 5. Siglo: 20AA si la fecha ya
  pasó, si no 19AA (el 7.º dígito NO sirve para esto; carnets reales de los 80
  lo tienen entre 6 y 8).
- **Teléfono**: `+53` fijo + 8 dígitos, guardado como `+53 5555 1803`.
- **Excel** (`construirLibro`, hoja TRANSFERENCIAS): columnas
  `FECHA, IMPORTE, NO TRANSACCION, HORA, CAJERO, CLIENTE, CI, TELEFONO`.
  El Conciliador acepta CLIENTE y CI añadidas al final; **columnas nuevas,
  siempre al final**, sin reordenar las existentes. TELEFONO no está confirmado.
- **Clientes frecuentes**: al reconocer un teléfono se propone su nombre y CI.
- **Memoria (PWA)**: avisos al 80 % y 95 % de ~5 MB; recordatorio de copia de
  seguridad a los 7 días. En el APK, aviso si a la tablet le quedan < 50 MB.
- Chrome no deja compartir `.xlsx` desde una web: la PWA lo descarga y muestra
  una guía; el APK lo comparte directo (Filesystem + Share).

## SMS (APK)

Formatos reales (octubre de 2026):

```
PAGOxMOVIL: El titular del telefono 53XXXXXXXX le ha realizado una transferencia a la
            cuenta XXXXXXXXXXXXXXXX de 10000.00 CUP. Nro. Transaccion KW601YFBRP999. Fecha: 15/10/2026.
            (variante sin teléfono: "Se ha realizado una transferencia a la cuenta …")
ENZONA:     ENZONA pago recibido, Importe: 10.00 CUP No.: Xn24kbc2NDFV
            (el mismo remitente manda "CODIGO DE ACCESO ENZONA: 398213": se ignora)
```

- El análisis está en `analizarSms` (index.html). Android (Bandeja.java) solo
  decide si notificar, con las expresiones que le manda `configurarSms()` al
  abrir y en cada `guardar()` (incluye la lista `excluir`: números ya
  registrados o usados, para no avisar de un SMS tardío).
- Solo se ofrecen los SMS **llegados hoy**. No se ofrece uno ya registrado
  (aunque se tecleara a mano antes), ni uno marcado "Ya usado". "Ya usado" tiene
  "Deshacer" (10 s) y "Usados hoy → Recuperar".
- Sin licencia, Android no lee los SMS.
- Android 13+ puede bloquear el permiso de SMS en apps instaladas fuera de
  Play: la app muestra la guía ("Permitir ajustes restringidos").

## Licencia (APK)

- Código de la tablet = 10 caracteres base32 (Crockford) de
  `SHA-256("RT|" + ANDROID_ID)`. Licencia = 12 caracteres de
  `HMAC-SHA256(secreto, "RT-LIC|" + código)`. `Licencia.java`, `licencia.js` y la
  plantilla HTML deben calcular **exactamente lo mismo**.
- El secreto está en `apk/licencia.secreto` (no versionado); Gradle lo mete en
  `BuildConfig.LICENCIA_SECRETO` y falla si falta.
- ANDROID_ID cambia con un restablecimiento de fábrica o si cambia la firma del
  APK (las licencias del APK de pruebas no valen en el de entrega).

## Secretos (fuera del repositorio, el usuario tiene copia)

| Archivo | Uso |
|---|---|
| `apk/firma/registro-transferencias.jks` | firma del APK de entrega |
| `apk/keystore.properties` | contraseña de esa firma |
| `apk/licencia.secreto` | secreto de las licencias |

**Nunca regenerarlos** si ya existen o si el usuario los tiene en su copia:
otra firma impide actualizar el APK instalado (hay que desinstalar y se pierden
datos); otro secreto invalida las licencias entregadas. En un PC nuevo, pedir al
usuario que los copie a esas rutas. `generador-licencias.html` se regenera con
`node licencia.js`.

## Compilar el APK

Entorno usado: Windows, Node 24, JDK 21 en `C:\Program Files\Android\openjdk\jdk-21.0.8`
y Android SDK (API 36, build-tools 36.0.0) en `C:\Program Files (x86)\Android\android-sdk`
(vienen con Visual Studio + .NET para Android; no hace falta Android Studio).
`apk/android/local.properties`: `sdk.dir=C\:/Program Files (x86)/Android/android-sdk`.

```
cd apk && npm install && npm run sync
cd android
set JAVA_HOME=C:\Program Files\Android\openjdk\jdk-21.0.8
gradlew -I ..\espejo-google.gradle assembleDebug      (pruebas)
gradlew -I ..\espejo-google.gradle assembleRelease    (entrega, firmado)
```

- La red del usuario sale por **Starlink** y Google responde **404** a
  `dl.google.com`/`maven.google.com`: por eso el espejo de Aliyun
  (`espejo-google.gradle`) y las build-tools 36 fijadas en `variables.gradle`.
  `edgedl.me.gvt1.com` sí responde (espejo oficial de descargas del SDK).
- **Cada entrega: subir `versionCode`** (y `versionName`) en
  `apk/android/app/build.gradle`, compilar release y copiar a
  `apk/entrega/RegistroTransferencias-<versión>.apk` (los `.apk` no se versionan).
  Versión entregada: 1.0 (versionCode 1), octubre de 2026.
- `minifyEnabled false` (no probado con R8).

## Publicar la PWA

Push a `main` → GitHub Pages. **Subir `VERSION` en `sw.js` cada vez que cambie
`index.html`** (o cualquier archivo cacheado); si no, las tablets siguen con la
copia vieja. Los archivos nuevos que deba cachear la PWA van en `ARCHIVOS` de
`sw.js` y de `apk/copiar-web.js`.

## Estilo visual

Tokens **Tailux** tomados de `BinaryPlate` (`design-tokens.css`): primario indigo
(`#4f46e5`/`#6366f1`/`#4338ca`), grises slate, tarjetas blancas con sombra suave
sobre `gray-50`, radio 8 px, campos y botones densos de 36 px, tipografía Inter.
Los tokens están como variables CSS en `:root` de `index.html`; usar esas
variables, no colores sueltos. El icono de la app sigue siendo el verde oscuro
original.

## Pruebas

`pruebas/` (ver `pruebas/LEEME.md`): unitarias (`t-*.js`), PWA en Chrome con
puppeteer y APK en el emulador vía adb. Antes de dar algo por terminado, correr
`npm run todo` en `pruebas/`; si se toca el APK, también `npm run emulador`
(necesita el APK de **pruebas** instalado: el de entrega no permite depurar).
Los SMS de las pruebas son inventados o con teléfonos y cuentas cambiados.

## Notas para Claude en este PC

- En el Bash de Windows (Git Bash), los heredocs con `\\` y `\'` dentro de
  scripts de Python/JS se alteran: para ediciones con barras invertidas usar la
  herramienta de edición o un script escrito a archivo.
- `adb shell` con rutas `/sdcard/...` necesita `MSYS_NO_PATHCONV=1`.
- `run-as` con redirecciones: pasar todo el comando como una sola cadena.
- Commits: solo cuando el usuario lo pida; push a `main` publica la PWA.

## Pendiente / decisiones abiertas

- ENZONA tecleado a mano se pasa a mayúsculas: falta saber si el Conciliador
  distingue mayúsculas (si sí, añadir un formato "ENZONA" que respete lo tecleado).
- Confirmar que el Conciliador acepta la columna TELEFONO.
- Probar el APK de entrega en tablets reales: permiso de SMS instalado por Zapya
  (Android 13+), notificaciones con ahorro de batería de cada marca.
- IndexedDB para la PWA: descartado por ahora (el APK ya no tiene límite).
