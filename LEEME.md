# Registro de Transferencias — versión PWA

Los seis archivos de esta carpeta van **juntos**. Si falta uno, la app no se
instala como aplicación.

```
index.html               la app (incluye SheetJS dentro)
manifest.webmanifest     nombre, icono, color, pantalla completa
sw.js                    hace que funcione sin internet
icon-192.png  icon-512.png  icon-mask.png
```

---

## Lo primero que hay que entender

Una PWA necesita un **service worker**, y los navegadores solo lo permiten
si la página viene por `https://` o por `localhost`.

**Desde `file://` no funciona.** Si copias estos archivos a la tablet y abres
`index.html` desde el gestor de archivos, la app funciona igual de bien, pero
Chrome no la instala como aplicación: se ve la barra de direcciones y no hay
icono propio.

Por eso hay que elegir de dónde se sirve. Tres caminos, con lo bueno y lo malo
de cada uno.

---

## Camino A — Publicarla en internet (el más simple)

Subes la carpeta a un hosting gratuito con HTTPS: **GitHub Pages**, Netlify o
Cloudflare Pages. Con GitHub Pages: creas un repositorio, subes los seis
archivos, y en *Settings → Pages* eliges la rama. Te queda una dirección tipo
`https://tuusuario.github.io/transferencias/`.

En la tablet abres esa dirección **una sola vez con internet**. Chrome muestra
"Instalar aplicación". A partir de ahí funciona sin conexión para siempre,
porque el service worker guardó todo en el dispositivo.

**A favor:** cero complicación técnica; actualizar es subir el archivo nuevo y
la tablet se actualiza sola la próxima vez que tenga internet.

**En contra, y esto importa para tu negocio:** la app queda **pública en
internet**. Cualquiera con la dirección la usa gratis. Si vas a cobrar por
ella, estás regalando la parte de captura. Los datos del cliente no corren
riesgo — todo se guarda en la tablet y nada se transmite — pero el programa sí
queda expuesto.

---

## Camino B — Servidor local en la propia tablet

Instalas en la tablet una app de servidor HTTP (por ejemplo *Simple HTTP
Server* de la Play Store, o Termux), apuntas la carpeta y abres
`http://localhost:8080`.

`localhost` **sí** cuenta como contexto seguro, así que el service worker
funciona y la PWA se instala.

**A favor:** nada sale de la tablet, no hace falta internet nunca, y la app no
queda publicada.

**En contra:** hay que dejar el servidor corriendo, y si Android lo cierra por
ahorrar batería la app deja de abrir. Para una tablet dedicada es manejable,
pero es una pieza más que se puede romper y que el cajero no sabrá arreglar.

---

## Camino C — APK con Capacitor

Está en la carpeta **`apk/`**, con su propio [LEEME](apk/LEEME.md). Es esta
misma app dentro de un APK, más la **lectura de los SMS del banco** y el envío
directo del Excel por WhatsApp o Zapya.

**A favor:** pantalla completa de verdad, icono en el menú de aplicaciones,
nada publicado en internet, sin servidor, y almacenamiento nativo que no se
borra al limpiar la caché de Chrome.

**En contra:** hay que instalar Android Studio, entre 2 y 4 GB de descarga, y
firmar cada versión con la misma clave.

---

## Aviso importante sobre los datos

Los registros se guardan por **origen**: `file://` y
`https://tuusuario.github.io/...` son orígenes distintos para el navegador.

Si el cajero estuvo usando la versión de archivo suelto y luego instalas la
PWA, **los registros anteriores no aparecerán**. No se han perdido, pero están
en el otro origen.

Antes de cambiar de camino: en la versión vieja, **Ajustes → Guardar copia**, y
en la nueva, **Ajustes → Restaurar**.

Lo mismo vale al pasar de la PWA al APK.

---

## Al publicar una versión nueva

Abre `sw.js` y sube el número:

```js
const VERSION = 'v2';
```

Si no lo cambias, la tablet seguirá usando la copia guardada y **no verá los
cambios**, aunque hayas subido el archivo nuevo. Es el error más común
trabajando con service workers.

Cuando la tablet detecta una versión nueva, le pregunta al cajero si quiere
actualizar. Los registros guardados no se tocan.

---

## Cambiar los formatos del No. de transacción

Los botones **KW**, **BR** y **MM** de la captura ponen solos el inicio y el
final del código (por ejemplo `KW601` … `999`). El banco va aumentando esos
números con el tiempo. Cuando cambien, ve a **Ajustes → Formatos de No. de
transacción**, corrige el inicio o el final y toca **Guardar formatos**.

- La cantidad de caracteres que escribe el cajero se calcula sola: el código
  siempre mide 13.
- Los registros ya guardados no se modifican.
- Los formatos se guardan en la tablet y entran en la copia de seguridad.
- **Valores de fábrica** vuelve a `KW601…999`, `BR60…997` y `MM604…987`.

---

## Memoria de la app

Chrome deja unos 5 MB por app: caben **~25 000 registros** con todos los datos
del cliente (~32 000 sin ellos). Para que no sea un problema:

- **Ajustes** muestra la memoria usada, si los datos están protegidos contra el
  borrado automático y la fecha de la última copia de seguridad.
- La pantalla de inicio avisa en **amarillo al 80 %** y en **rojo al 95 %**.
  Entonces hay que exportar a Excel los lotes viejos y borrarlos en Ajustes.
- Si la memoria se llena, el registro **no se guarda** y la app lo dice en
  rojo; lo tecleado se conserva para reintentar después de liberar espacio.
- Si pasan 7 días sin **Guardar copia**, la pantalla de inicio lo recuerda.
- Al abrir, la app pide a Chrome que no borre sus datos aunque la tablet se
  quede sin espacio. Chrome suele concederlo solo si la app está **instalada**.

## Enviar el Excel por WhatsApp, Zapya, etc.

Chrome no permite compartir archivos `.xlsx` directamente desde una página web
(solo PDF, CSV, imágenes y similares). Por eso, al exportar, el Excel se guarda
en **Descargas** y la app muestra los pasos: abrir **Archivos** → **Descargas**
→ mantener pulsado el archivo → **Compartir** → WhatsApp, Zapya u otra app.
