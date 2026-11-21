package com.vtsoftware.transferencias;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Guarda un archivo (el Excel exportado) en la carpeta pública
 * Descargas/Registro de Transferencias de la tablet, para sacarlo luego con un
 * cable o abrirlo desde la app Archivos, sin instalar otra app.
 *
 *  - Android 10 o más: MediaStore.Downloads, sin pedir permisos. El sistema lo
 *    registra al momento, así que se ve enseguida al conectar la tablet a la PC.
 *    Si ya hay uno con ese nombre, Android le añade (1), (2)…
 *  - Android 7 a 9: escribe el archivo directamente (con el permiso de
 *    almacenamiento, que se pide la primera vez) y avisa al escáner de medios.
 */
@CapacitorPlugin(
    name = "Descargas",
    permissions = { @Permission(alias = "almacenamiento", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }) }
)
public class DescargasPlugin extends Plugin {
    static final String CARPETA = "Registro de Transferencias";

    /** guardar({ nombre, datos (base64), tipo }) → { nombre, carpeta } */
    @PluginMethod
    public void guardar(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("almacenamiento") != PermissionState.GRANTED) {
            requestPermissionForAlias("almacenamiento", call, "alResponderPermiso");
            return;
        }
        escribir(call);
    }

    @PermissionCallback
    private void alResponderPermiso(PluginCall call) {
        if (getPermissionState("almacenamiento") == PermissionState.GRANTED) escribir(call);
        else call.reject("Sin permiso para guardar archivos en la tablet.", "PERMISO");
    }

    private void escribir(PluginCall call) {
        String nombre = call.getString("nombre");
        String datos = call.getString("datos");
        String tipo = call.getString("tipo", "application/octet-stream");
        if (nombre == null || datos == null) { call.reject("Falta el nombre o el contenido del archivo."); return; }
        try {
            byte[] bytes = Base64.decode(datos, Base64.DEFAULT);
            String final_ = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? conMediaStore(nombre, tipo, bytes) : conArchivo(nombre, tipo, bytes);
            JSObject r = new JSObject();
            r.put("nombre", final_);
            r.put("carpeta", "Descargas/" + CARPETA);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudo guardar el archivo: " + e.getMessage(), e);
        }
    }

    private String conMediaStore(String nombre, String tipo, byte[] bytes) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, nombre);
        v.put(MediaStore.MediaColumns.MIME_TYPE, tipo);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + CARPETA);
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new IllegalStateException("Android no dejó crear el archivo.");
        try (OutputStream out = cr.openOutputStream(uri)) {
            if (out == null) throw new IllegalStateException("Android no dejó escribir el archivo.");
            out.write(bytes);
        } catch (Exception e) {
            cr.delete(uri, null, null);
            throw e;
        }
        ContentValues listo = new ContentValues();
        listo.put(MediaStore.MediaColumns.IS_PENDING, 0);
        cr.update(uri, listo, null, null);
        // el nombre con el que quedó (si ya existía, Android le añade un número)
        try (Cursor c = cr.query(uri, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        }
        return nombre;
    }

    private String conArchivo(String nombre, String tipo, byte[] bytes) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), CARPETA);
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("No se pudo crear la carpeta " + dir);
        File f = new File(dir, nombre);
        int punto = nombre.lastIndexOf('.');
        String base = punto > 0 ? nombre.substring(0, punto) : nombre, ext = punto > 0 ? nombre.substring(punto) : "";
        for (int i = 1; f.exists(); i++) f = new File(dir, base + " (" + i + ")" + ext);
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(bytes);
            out.getFD().sync();
        }
        // sin esto, al conectar la tablet por cable el archivo no aparece hasta reiniciar
        MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, new String[] { tipo }, null);
        return f.getName();
    }
}
