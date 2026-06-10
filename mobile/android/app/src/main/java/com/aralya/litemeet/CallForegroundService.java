package com.aralya.litemeet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * LiteMeet Call Foreground Service
 * Menjaga proses tetap berjalan saat layar mati (background call seperti WhatsApp)
 * 
 * Perbaikan dari versi sebelumnya:
 * - Notifikasi lebih smooth dengan update berkala (durasi panggilan)
 * - Channel priority disesuaikan agar tidak mengganggu tapi tetap sticky
 * - Chronometer bawaan Android untuk tampilan durasi real-time
 * - Warna dan icon yang lebih profesional
 * - Silent notification (tanpa suara/getaran)
 */
public class CallForegroundService extends Service {

    private static final String TAG = "LiteMeetFGService";
    public static final String ACTION_START = "START_CALL";
    public static final String ACTION_STOP  = "STOP_CALL";
    private static final String CHANNEL_ID  = "litemeet_call_channel";
    private static final int    NOTIF_ID    = 2001;

    private PowerManager.WakeLock wakeLock;
    private long callStartTime = 0;

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
            // Tutup Activity (app) juga saat user tekan "Akhiri" di notifikasi
            try {
                Intent closeApp = new Intent(this, MainActivity.class);
                closeApp.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                closeApp.putExtra("FINISH_APP", true);
                closeApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(closeApp);
            } catch (Exception e) {
                Log.w(TAG, "Gagal menutup app: " + e.getMessage());
            }
            stopSelf();
            return START_NOT_STICKY;
        }

        String roomName = (intent != null) ? intent.getStringExtra("roomName") : "Panggilan";
        if (roomName == null || roomName.isEmpty()) roomName = "Panggilan Aktif";

        callStartTime = android.os.SystemClock.elapsedRealtime();

        Notification notification = buildNotification(roomName);

        // Mulai sebagai foreground service — microphone dan camera type
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                if (Build.VERSION.SDK_INT >= 34) {
                    // Android 14+ needs explicit CAMERA type if accessing camera in bg
                    type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE | ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
                }
                startForeground(NOTIF_ID, notification, type);
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

    private Notification buildNotification(String roomName) {
        // Intent untuk membuka kembali app saat notifikasi ditekan
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
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

        // Intent untuk kembali ke app (tombol "Kembali")
        Intent returnIntent = new Intent(this, MainActivity.class);
        returnIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent pendingReturn = PendingIntent.getActivity(
            this, 2, returnIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Panggilan Aktif")
            .setContentText(roomName)
            .setSubText("LiteMeet")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setOngoing(true)           // Tidak bisa digeser/dismiss
            .setAutoCancel(false)       // Tidak hilang saat diklik
            .setOnlyAlertOnce(true)     // KUNCI: hanya alert sekali, update selanjutnya silent
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW) // LOW agar tidak mengganggu tapi tetap sticky
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setColor(0xFF6366F1)       // Indigo/ungu LiteMeet branding
            .setColorized(true)
            .setContentIntent(pendingOpen)
            // Chronometer: tampilkan durasi panggilan real-time seperti WhatsApp
            .setUsesChronometer(true)
            .setWhen(System.currentTimeMillis())
            // Tombol aksi
            .addAction(android.R.drawable.ic_menu_view, "Kembali", pendingReturn)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Akhiri", pendingStop)
            // Silent — tidak ada suara/getaran saat notif muncul
            .setSilent(true);

        // Full-screen intent agar tampil di lock screen seperti panggilan masuk (opsional)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        }

        Notification notification = builder.build();
        // Flag agar benar-benar tidak bisa di-dismiss
        notification.flags |= Notification.FLAG_NO_CLEAR | Notification.FLAG_ONGOING_EVENT;

        return notification;
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
                NotificationManager.IMPORTANCE_LOW  // LOW = no sound, no heads-up, tapi tetap visible
            );
            channel.setDescription("Notifikasi panggilan aktif LiteMeet");
            channel.setSound(null, null);       // Silent
            channel.enableVibration(false);      // Tidak getar
            channel.enableLights(false);         // Tidak kedip LED
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}
