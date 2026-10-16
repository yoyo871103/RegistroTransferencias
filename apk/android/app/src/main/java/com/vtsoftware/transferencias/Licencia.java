package com.vtsoftware.transferencias;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Cálculo de la licencia, sin nada de Android para poder probarlo en el PC.
 * Tiene que dar exactamente lo mismo que apk/licencia.js (el generador).
 *
 *   código de la tablet = 10 caracteres base32 de SHA-256("RT|" + ANDROID_ID)
 *   licencia            = 12 caracteres base32 de HMAC-SHA256(secreto, "RT-LIC|" + código)
 */
final class Licencia {
    // base32 de Crockford: sin I, L, O, U para que no se confundan al teclear
    private static final String ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    private Licencia() {}

    static String codigoTablet(String androidId) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256")
                .digest(("RT|" + androidId).getBytes(StandardCharsets.UTF_8));
            return base32(h, 10);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String licenciaPara(String secretoHex, String codigoTablet) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hex(secretoHex), "HmacSHA256"));
            byte[] firma = mac.doFinal(("RT-LIC|" + normalizar(codigoTablet)).getBytes(StandardCharsets.UTF_8));
            return base32(firma, 12);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** true si 'licencia' (como la teclee la persona) corresponde a ese código de tablet. */
    static boolean valida(String secretoHex, String codigoTablet, String licencia) {
        String esperada = licenciaPara(secretoHex, codigoTablet);
        return MessageDigest.isEqual(esperada.getBytes(StandardCharsets.US_ASCII),
                                     normalizar(licencia).getBytes(StandardCharsets.US_ASCII));
    }

    /** Mayúsculas, sin guiones ni espacios; O se lee como 0 e I/L como 1. */
    static String normalizar(String t) {
        if (t == null) return "";
        return t.toUpperCase(Locale.ROOT).replace('O', '0').replace('I', '1').replace('L', '1')
            .replaceAll("[^0-9A-Z]", "");
    }

    /** "K7M2Q9XH4T" → "K7M2Q-9XH4T" */
    static String agrupar(String t, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < t.length(); i += n) {
            if (i > 0) sb.append('-');
            sb.append(t, i, Math.min(t.length(), i + n));
        }
        return sb.toString();
    }

    static String base32(byte[] bytes, int largo) {
        StringBuilder out = new StringBuilder();
        int bits = 0, valor = 0;
        for (byte b : bytes) {
            valor = (valor << 8) | (b & 0xFF);
            bits += 8;
            while (bits >= 5 && out.length() < largo) {
                out.append(ALFABETO.charAt((valor >>> (bits - 5)) & 31));
                bits -= 5;
            }
            valor &= (1 << bits) - 1;
            if (out.length() >= largo) break;
        }
        return out.toString();
    }

    private static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }
}
