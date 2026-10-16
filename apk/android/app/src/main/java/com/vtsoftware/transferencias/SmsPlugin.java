package com.vtsoftware.transferencias;

import android.Manifest;
import android.database.Cursor;
import android.os.Build;
import android.provider.Telephony;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.List;

/**
 * Puente entre la app web y los SMS. Desde index.html se usa como
 * Capacitor.registerPlugin('Sms'):
 *   estado()                 permisos actuales
 *   activar()                pide permiso de SMS (y de notificaciones en Android 13+)
 *   configurar({...})        remitentes y expresiones para decidir qué SMS guardar
 *   pendientes()             SMS guardados desde la última vez
 *   quitar({claves})         los que la app ya recogió
 *   leerDesde({desde})       SMS de la bandeja de entrada desde esa hora (ms)
 *   evento 'sms'             llegó uno con la app abierta
 */
@CapacitorPlugin(
    name = "Sms",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS }),
        @Permission(alias = "notificaciones", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class SmsPlugin extends Plugin {
    private static volatile SmsPlugin activo;

    @Override
    public void load() {
        activo = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (activo == this) activo = null;
    }

    /** Si la app está abierta, le avisa al momento de que llegó un SMS. */
    static void avisar(JSONObject sms) {
        SmsPlugin p = activo;
        if (p == null) return;
        try {
            p.notifyListeners("sms", JSObject.fromJSONObject(sms));
        } catch (JSONException ignorado) {
            // la app lo recogerá igual con pendientes()
        }
    }

    private JSObject estadoActual() {
        JSObject r = new JSObject();
        r.put("sms", getPermissionState("sms").toString());
        // antes de Android 13 las notificaciones no necesitan permiso
        r.put("notificaciones", Build.VERSION.SDK_INT >= 33
            ? getPermissionState("notificaciones").toString() : "granted");
        r.put("android", Build.VERSION.SDK_INT);
        return r;
    }

    @PluginMethod
    public void estado(PluginCall call) {
        call.resolve(estadoActual());
    }

    @PluginMethod
    public void activar(PluginCall call) {
        String[] alias = Build.VERSION.SDK_INT >= 33
            ? new String[] { "sms", "notificaciones" } : new String[] { "sms" };
        requestPermissionForAliases(alias, call, "trasPermisos");
    }

    @PermissionCallback
    private void trasPermisos(PluginCall call) {
        call.resolve(estadoActual());
    }

    @PluginMethod
    public void configurar(PluginCall call) {
        Bandeja.configurar(getContext(), call.getData());
        call.resolve();
    }

    @PluginMethod
    public void pendientes(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("sms", new JSArray(Bandeja.pendientes(getContext()).toString()));
            call.resolve(r);
        } catch (JSONException e) {
            call.reject("No se pudo leer la cola de SMS", e);
        }
    }

    @PluginMethod
    public void quitar(PluginCall call) {
        JSArray claves = call.getArray("claves", new JSArray());
        try {
            List<String> lista = claves.toList();
            Bandeja.quitar(getContext(), new HashSet<>(lista));
            call.resolve();
        } catch (JSONException e) {
            call.reject("Claves no válidas", e);
        }
    }

    @PluginMethod
    public void leerDesde(PluginCall call) {
        if (!LicenciaPlugin.activa(getContext())) {
            call.reject("La app no tiene licencia", "SIN_LICENCIA");
            return;
        }
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("Sin permiso para leer SMS", "SIN_PERMISO");
            return;
        }
        long desde = call.getDouble("desde", 0.0).longValue();
        String[] columnas = { Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE };
        try (Cursor c = getContext().getContentResolver().query(
                Telephony.Sms.Inbox.CONTENT_URI, columnas,
                Telephony.Sms.DATE + " >= ?", new String[] { String.valueOf(desde) },
                Telephony.Sms.DATE + " ASC")) {
            JSONArray lista = new JSONArray();
            while (c != null && c.moveToNext()) {
                JSONObject s = new JSONObject();
                s.put("remitente", c.getString(0) != null ? c.getString(0) : "");
                s.put("cuerpo", c.getString(1) != null ? c.getString(1) : "");
                s.put("fecha", c.getLong(2));
                lista.put(s);
            }
            JSObject r = new JSObject();
            r.put("sms", new JSArray(lista.toString()));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudieron leer los SMS: " + e.getMessage(), e);
        }
    }
}
