package com.vtsoftware.transferencias;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // los plugins propios se registran antes de crear el puente
        registerPlugin(AlmacenPlugin.class);
        registerPlugin(SmsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
