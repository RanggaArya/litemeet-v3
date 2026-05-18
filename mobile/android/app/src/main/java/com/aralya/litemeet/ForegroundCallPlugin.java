package com.aralya.litemeet;

import android.content.Intent;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor Plugin untuk mengontrol CallForegroundService dari JavaScript.
 * Semua method dilindungi try-catch agar tidak crash.
 */
@CapacitorPlugin(name = "ForegroundCall")
public class ForegroundCallPlugin extends Plugin {

    private static final String TAG = "ForegroundCallPlugin";

    @PluginMethod
    public void startCall(PluginCall call) {
        try {
            String roomName = call.getString("roomName", "Panggilan Aktif");

            Intent serviceIntent = new Intent(getContext(), CallForegroundService.class);
            serviceIntent.setAction(CallForegroundService.ACTION_START);
            serviceIntent.putExtra("roomName", roomName);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.w(TAG, "startCall gagal: " + e.getMessage());
        }
        call.resolve();
    }

    @PluginMethod
    public void stopCall(PluginCall call) {
        try {
            Intent serviceIntent = new Intent(getContext(), CallForegroundService.class);
            getContext().stopService(serviceIntent);
        } catch (Exception e) {
            Log.w(TAG, "stopCall gagal: " + e.getMessage());
        }
        call.resolve();
    }
}
