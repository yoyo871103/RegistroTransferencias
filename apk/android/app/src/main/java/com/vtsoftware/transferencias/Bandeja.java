package com.vtsoftware.transferencias;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collection;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * SMS del banco que llegaron y la app todavía no ha recogido.
 *
 * Se guardan aquí porque cuando llega el SMS la app puede estar cerrada. La app
 * (index.html) los recoge al abrirse o al volver a primer plano, los analiza con
 * sus propias reglas y los quita de aquí. Este lado solo decide si un SMS parece
 * una transferencia (para no guardar todo) y avisa con una notificación.
 */
final class Bandeja {
    private static final String PREFS = "sms_bandeja";
    private static final String COLA = "cola";
    private static final String CONFIG = "config";
    private static final int MAXIMO = 500;
    private static final String CANAL = "transferencias";

    // Los mismos valores que SMS_NATIVO en index.html; la app los vuelve a enviar
    // al abrirse, así que estos solo cuentan antes de la primera apertura.
    // ENZONA ("pago recibido … No.: Xn24kbc2NDFV") | PAGOxMOVIL ("Nro. Transaccion KW601…") | genérico
    private static final String CODIGO_FABRICA =
        "PAGO RECIBIDO[\\s\\S]*?\\bNO\\.?\\s*:?\\s*([A-Z0-9]{6,30})\\b" +
        "|TRANSACCI[OÓ]N\\s*:?\\s*([A-Z0-9]{6,20})\\b|\\b[A-Z]{2}\\d[A-Z0-9]{10}\\b";
    private static final String IMPORTE_FABRICA = "\\b(\\d[\\d.,]*\\d|\\d)\\s*CUP\\b";

    private Bandeja() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void configurar(Context ctx, JSONObject cfg) {
        prefs(ctx).edit().putString(CONFIG, cfg.toString()).apply();
    }

    private static JSONObject config(Context ctx) {
        try {
            return new JSONObject(prefs(ctx).getString(CONFIG, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    static synchronized JSONArray pendientes(Context ctx) {
        try {
            return new JSONArray(prefs(ctx).getString(COLA, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static void guardarCola(Context ctx, JSONArray cola) {
        prefs(ctx).edit().putString(COLA, cola.toString()).apply();
    }

    /** Quita de la cola los SMS que la app ya recogió. */
    static synchronized void quitar(Context ctx, Collection<String> claves) {
        JSONArray cola = pendientes(ctx), queda = new JSONArray();
        for (int i = 0; i < cola.length(); i++) {
            JSONObject s = cola.optJSONObject(i);
            if (s != null && !claves.contains(s.optString("clave"))) queda.put(s);
        }
        guardarCola(ctx, queda);
    }

    /** Llamado por SmsReceiver con cada SMS completo (las partes ya unidas). */
    static synchronized void recibir(Context ctx, String remitente, String cuerpo, long fecha) {
        if (!LicenciaPlugin.activa(ctx)) return;   // sin licencia no se leen los SMS
        JSONObject cfg = config(ctx);
        if (!aceptaRemitente(cfg.optJSONArray("remitentes"), remitente)) return;
        // se busca en mayúsculas, pero se devuelve el número como viene (ENZONA mezcla mayúsculas)
        String codigo = buscar(cfg.optString("codigo", CODIGO_FABRICA), CODIGO_FABRICA,
                               cuerpo.toUpperCase(Locale.ROOT), cuerpo);
        if (codigo == null) return;   // no parece una transferencia
        // ya registrado (p. ej. el cajero lo tecleó antes de que llegara el SMS) o marcado como usado
        if (contiene(cfg.optJSONArray("excluir"), codigo)) return;
        String importe = buscar(cfg.optString("importe", IMPORTE_FABRICA), IMPORTE_FABRICA, cuerpo, cuerpo);

        JSONObject sms = new JSONObject();
        try {
            sms.put("clave", fecha + "|" + remitente + "|" + cuerpo.hashCode());
            sms.put("remitente", remitente);
            sms.put("cuerpo", cuerpo);
            sms.put("fecha", fecha);
        } catch (JSONException e) {
            return;
        }
        JSONArray cola = pendientes(ctx);
        cola.put(sms);
        while (cola.length() > MAXIMO) cola.remove(0);
        guardarCola(ctx, cola);

        SmsPlugin.avisar(sms);
        notificar(ctx, codigo, importe);
    }

    /** Lista vacía = cualquier remitente. Se compara sin distinguir mayúsculas. */
    private static boolean aceptaRemitente(JSONArray remitentes, String remitente) {
        if (remitentes == null || remitentes.length() == 0) return true;
        for (int i = 0; i < remitentes.length(); i++) {
            if (remitentes.optString(i).trim().equalsIgnoreCase(remitente.trim())) return true;
        }
        return false;
    }

    private static boolean contiene(JSONArray lista, String valor) {
        if (lista == null) return false;
        for (int i = 0; i < lista.length(); i++) {
            if (valor.equalsIgnoreCase(lista.optString(i))) return true;
        }
        return false;
    }

    /** Primer grupo si la expresión tiene uno; si la configurada no compila, la de fábrica. */
    /**
     * Busca en 'texto' y devuelve ese mismo trozo de 'original' (misma longitud:
     * 'texto' es 'original' en mayúsculas). Se queda con el primer grupo que
     * encontró algo (cada formato de SMS tiene el suyo); si no hay grupos, todo.
     */
    private static String buscar(String regex, String fabrica, String texto, String original) {
        Pattern p;
        try {
            p = Pattern.compile(regex);
        } catch (PatternSyntaxException e) {
            p = Pattern.compile(fabrica);
        }
        Matcher m = p.matcher(texto);
        if (!m.find()) return null;
        int g = 0;
        for (int i = 1; i <= m.groupCount(); i++) {
            if (m.group(i) != null) { g = i; break; }
        }
        String fuente = original.length() == texto.length() ? original : texto;
        return fuente.substring(m.start(g), m.end(g));
    }

    private static void notificar(Context ctx, String codigo, String importe) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;

        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel canal = new NotificationChannel(
                CANAL, "Transferencias recibidas", NotificationManager.IMPORTANCE_HIGH);
            canal.setDescription("Aviso cuando llega un SMS del banco con una transferencia");
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(canal);
        }

        Intent abrir = new Intent(ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, abrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String texto = codigo + (importe != null ? " · " + importe + " CUP" : "");
        NotificationCompat.Builder n = new NotificationCompat.Builder(ctx, CANAL)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle("Transferencia recibida")
            .setContentText(texto)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto + "\nToca para registrarla."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(pi)
            .setAutoCancel(true);
        NotificationManagerCompat.from(ctx).notify(codigo.hashCode(), n.build());
    }
}
