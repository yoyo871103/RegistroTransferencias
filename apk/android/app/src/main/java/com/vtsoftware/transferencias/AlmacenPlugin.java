package com.vtsoftware.transferencias;

import android.content.Context;
import android.webkit.JavascriptInterface;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Dónde guarda la app sus datos dentro del APK: un archivo JSON en la carpeta
 * privada de la app (sin el límite de 5 MB de localStorage).
 *
 * Se expone a la página como window.AlmacenNativo con llamadas SÍNCRONAS
 * (addJavascriptInterface), para que guardar() en index.html siga devolviendo
 * true/false al momento y pueda deshacer el cambio si no se pudo escribir.
 * La interfaz se añade en load(), antes de que el puente cargue la página.
 */
@CapacitorPlugin(name = "Almacen")
public class AlmacenPlugin extends Plugin {

    @Override
    public void load() {
        getBridge().getWebView().addJavascriptInterface(new Archivo(getContext()), "AlmacenNativo");
    }

    static final class Archivo {
        private final File datos, temporal, carpeta;

        Archivo(Context ctx) {
            carpeta = ctx.getFilesDir();
            datos = new File(carpeta, "datos.json");
            temporal = new File(carpeta, "datos.json.tmp");
        }

        /** El JSON guardado, o "" si todavía no hay archivo. */
        @JavascriptInterface
        public synchronized String leer() {
            if (!datos.exists()) return "";
            try (InputStream in = new FileInputStream(datos)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream((int) datos.length());
                byte[] buf = new byte[64 * 1024];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return out.toString(StandardCharsets.UTF_8.name());
            } catch (IOException e) {
                return "";
            }
        }

        /**
         * Escribe primero en un temporal y luego lo cambia por el bueno de una vez:
         * si se va la corriente a mitad, queda la versión anterior entera.
         * false si no se pudo (p. ej. tablet sin espacio).
         */
        @JavascriptInterface
        public synchronized boolean escribir(String json) {
            try (FileOutputStream out = new FileOutputStream(temporal)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } catch (IOException e) {
                temporal.delete();
                return false;
            }
            return temporal.renameTo(datos);
        }

        /** Bytes que ocupan los datos. */
        @JavascriptInterface
        public long tamano() {
            return datos.length();
        }

        /** Bytes libres en la tablet. */
        @JavascriptInterface
        public long libre() {
            return carpeta.getUsableSpace();
        }
    }
}
