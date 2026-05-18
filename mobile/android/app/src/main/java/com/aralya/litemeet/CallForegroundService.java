package com.aralya.litemeet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * LiteMeet Call Foreground Service
 * Menjaga proses tetap berjalan saat layar mati (background call seperti WhatsApp)
 * Hanya pakai MICROPHONE type agar kompatibel semua versi Android
 */
public class CallForegroundService extends Service {

    private static final String TAG = "LiteMeetFGService";
    public static final String ACTION_START = "START_CALL";
    public static final String ACTION_STOP  = "STOP_CALL";
    private static final String CHANNEL_ID  = "litemeet_call_channel";
    private static final int    NOTIF_ID    = 2001;

    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        // Acquire partial wake lock agar CPU tidak tidur saat layar mati
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LiteMeet::CallWakeLock");
                wakeLock.acquire(3 * 60 * 60 * 1000L); // max 3 jam
            }
        } catch (Exception e) {
            Log.w(TAG, "WakeLock gagal: " + e.getMessage());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String roomName = (intent != null) ? intent.getStringExtra("roomName") : "Panggilan";
        if (roomName == null || roomName.isEmpty()) roomName = "Panggilan Aktif";

        // Intent untuk membuka kembali app saat notifikasi ditekan
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingOpen = PendingIntent.getActivity(
            this, 0, openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Intent untuk mengakhiri panggilan dari notifikasi
        Intent stopIntent = new Intent(this, CallForegroundService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent pendingStop = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("LiteMeet — Panggilan Aktif")
            .setContentText("Room: " + roomName)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingOpen)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Akhiri", pendingStop)
            .build();

        // Mulai sebagai foreground service — HANYA microphone type
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIF_ID, notification);
            }
        } catch (Exception e) {
            // Fallback: coba tanpa service type
            Log.w(TAG, "startForeground dengan type gagal, coba tanpa type: " + e.getMessage());
            try {
                startForeground(NOTIF_ID, notification);
            } catch (Exception e2) {
                Log.e(TAG, "startForeground gagal total: " + e2.getMessage());
                stopSelf();
            }
        }

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception e) {
            Log.w(TAG, "WakeLock release gagal: " + e.getMessage());
        }
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Panggilan LiteMeet",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notifikasi panggilan aktif LiteMeet");
            channel.setSound(null, null);
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}
