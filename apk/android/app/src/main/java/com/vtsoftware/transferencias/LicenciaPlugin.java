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
 *
 * Licencia temporal: vale hasta el final del día que lleva dentro. Para que no
 * se alargue atrasando el reloj, se guarda el último día en que se usó la app;
 * si la fecha de la tablet queda más de un día por detrás de ese día o de cuándo
 * se instaló o actualizó la app, la temporal deja de valer.
 */
@CapacitorPlugin(name = "Licencia")
public class LicenciaPlugin extends Plugin {
    private static final String PREFS = "licencia";
    private static final String CLAVE = "codigo";
    private static final String VISTO = "visto";   // último día de uso (protección del reloj)

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

    /** Estado de la licencia guardada. Los días se cuentan desde el 2026-01-01. */
    static final class Estado {
        boolean activa, temporal;
        int vence = -1, hoy, ancla = -1;
        String motivo = "";   // "", "vencida" o "reloj"

        String json() {
            return "{\"activa\":" + activa + ",\"temporal\":" + temporal + ",\"vence\":" + vence +
                   ",\"hoy\":" + hoy + ",\"ancla\":" + ancla + ",\"motivo\":\"" + motivo + "\"}";
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Día más reciente en que se sabe que la tablet tenía bien la fecha. */
    private static int ancla(Context ctx) {
        int instalada = -1;
        try {
            instalada = Licencia.dia(ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).lastUpdateTime);
        } catch (Exception e) { /* sin ese dato queda el último uso */ }
        return Math.max(prefs(ctx).getInt(VISTO, -1), instalada);
    }

    /** Vencida, reloj atrasado o vale: lo mismo al arrancar y al activar. */
    private static void comprobarFechas(Context ctx, Estado e) {
        e.ancla = ancla(ctx);
        if (e.hoy < e.ancla - 1) e.motivo = "reloj";
        else if (e.hoy > e.vence) e.motivo = "vencida";
        else e.activa = true;
    }

    static Estado estado(Context ctx) {
        Estado e = new Estado();
        e.hoy = Licencia.dia(System.currentTimeMillis());
        String guardada = prefs(ctx).getString(CLAVE, "");
        if (guardada.isEmpty()) return e;
        String codigo = codigoTablet(ctx);
        if (Licencia.valida(BuildConfig.LICENCIA_SECRETO, codigo, guardada)) {
            e.activa = true;
            return e;
        }
        int vence = Licencia.diaTemporal(BuildConfig.LICENCIA_SECRETO, codigo, guardada);
        if (vence < 0) return e;
        e.temporal = true;
        e.vence = vence;
        comprobarFechas(ctx, e);
        if (e.activa && e.hoy > prefs(ctx).getInt(VISTO, -1)) prefs(ctx).edit().putInt(VISTO, e.hoy).apply();
        return e;
    }

    /** ¿Esta tablet tiene una licencia válida guardada? (lo usan también Bandeja y SmsPlugin) */
    static boolean activa(Context ctx) {
        return estado(ctx).activa;
    }

    static final class Puente {
        private final Context ctx;

        Puente(Context ctx) { this.ctx = ctx.getApplicationContext(); }

        @JavascriptInterface
        public boolean activa() { return LicenciaPlugin.activa(ctx); }

        /** JSON: {activa, temporal, vence, hoy, ancla, motivo}; los días, desde el 2026-01-01. */
        @JavascriptInterface
        public String estado() { return LicenciaPlugin.estado(ctx).json(); }

        /** Para mostrar: "K7M2Q-9XH4T". */
        @JavascriptInterface
        public String codigo() { return Licencia.agrupar(codigoTablet(ctx), 5); }

        /**
         * Guarda la licencia si vale para esta tablet. Devuelve "ok", "otra" (no es de
         * esta tablet), "vencida", "reloj" (fecha atrasada), "permanente" (ya tiene una
         * permanente y lo que se escribió es una temporal: no se cambia) o "error".
         */
        @JavascriptInterface
        public String activar(String licencia) {
            String codigo = codigoTablet(ctx);
            String l = Licencia.normalizar(licencia);
            if (!Licencia.valida(BuildConfig.LICENCIA_SECRETO, codigo, l)) {
                int vence = Licencia.diaTemporal(BuildConfig.LICENCIA_SECRETO, codigo, l);
                if (vence < 0) return "otra";
                Estado actual = LicenciaPlugin.estado(ctx);
                if (actual.activa && !actual.temporal) return "permanente";
                Estado nueva = new Estado();
                nueva.hoy = Licencia.dia(System.currentTimeMillis());
                nueva.vence = vence;
                comprobarFechas(ctx, nueva);
                if (!nueva.activa) return nueva.motivo;
            }
            return prefs(ctx).edit().putString(CLAVE, l).commit() ? "ok" : "error";
        }
    }
}
