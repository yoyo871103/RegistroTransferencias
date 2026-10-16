package com.vtsoftware.transferencias;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Licencia por tablet. Se expone a la página como window.LicenciaNativa con
 * llamadas síncronas (como AlmacenNativo), para que la app decida al arrancar
 * qué pantalla mostrar sin parpadeos.
 *
 * El secreto llega en BuildConfig desde apk/licencia.secreto al compilar.
 * La licencia guardada se vuelve a comprobar cada vez: copiar los datos de la
 * app a otra tablet no la activa allí.
 */
@CapacitorPlugin(name = "Licencia")
public class LicenciaPlugin extends Plugin {
    private static final String PREFS = "licencia";
    private static final String CLAVE = "codigo";

    @Override
    public void load() {
        getBridge().getWebView().addJavascriptInterface(new Puente(getContext()), "LicenciaNativa");
    }

    /** Código de esta tablet (10 caracteres, sin guion). */
    @SuppressLint("HardwareIds")
    static String codigoTablet(Context ctx) {
        String id = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ANDROID_ID);
        return Licencia.codigoTablet(id != null ? id : "");
    }

    /** ¿Esta tablet tiene una licencia válida guardada? (lo usan también Bandeja y SmsPlugin) */
    static boolean activa(Context ctx) {
        String guardada = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CLAVE, "");
        return !guardada.isEmpty() &&
               Licencia.valida(BuildConfig.LICENCIA_SECRETO, codigoTablet(ctx), guardada);
    }

    static final class Puente {
        private final Context ctx;

        Puente(Context ctx) { this.ctx = ctx.getApplicationContext(); }

        @JavascriptInterface
        public boolean activa() { return LicenciaPlugin.activa(ctx); }

        /** Para mostrar: "K7M2Q-9XH4T". */
        @JavascriptInterface
        public String codigo() { return Licencia.agrupar(codigoTablet(ctx), 5); }

        /** Guarda la licencia si es válida para esta tablet; false si no lo es. */
        @JavascriptInterface
        public boolean activar(String licencia) {
            if (!Licencia.valida(BuildConfig.LICENCIA_SECRETO, codigoTablet(ctx), licencia)) return false;
            SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            e.putString(CLAVE, Licencia.normalizar(licencia));
            return e.commit();
        }
    }
}
