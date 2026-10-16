package com.vtsoftware.transferencias;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Android lo llama con cada SMS que entra, aunque la app esté cerrada.
 * Un SMS largo llega partido en varias partes: se unen por remitente.
 */
public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] partes = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (partes == null) return;

        // hora de llegada a la tablet (la que muestra la app de mensajes); la que trae
        // el SMS la pone el centro de mensajes del operador y puede venir desfasada
        long llegada = System.currentTimeMillis();
        Map<String, StringBuilder> textos = new LinkedHashMap<>();
        for (SmsMessage p : partes) {
            if (p == null) continue;
            String remitente = p.getDisplayOriginatingAddress() != null ? p.getDisplayOriginatingAddress() : "";
            StringBuilder t = textos.get(remitente);
            if (t == null) {
                t = new StringBuilder();
                textos.put(remitente, t);
            }
            if (p.getDisplayMessageBody() != null) t.append(p.getDisplayMessageBody());
        }
        for (Map.Entry<String, StringBuilder> e : textos.entrySet()) {
            Bandeja.recibir(ctx, e.getKey(), e.getValue().toString(), llegada);
        }
    }
}
