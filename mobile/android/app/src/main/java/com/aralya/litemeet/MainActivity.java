package com.aralya.litemeet;

import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.util.Rational;
import android.view.KeyEvent;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "LiteMeetMain";

    // Flag dari AudioRoutePlugin: apakah sedang meeting aktif
    private volatile boolean meetingActive = false;

    /**
     * Dipanggil oleh AudioRoutePlugin untuk memberi tahu bahwa meeting
     * sedang aktif / tidak aktif, agar volume keys di-intercept.
     */
    public void setMeetingActive(boolean active) {
        this.meetingActive = active;
        Log.d(TAG, "meetingActive = " + active);
    }

    /**
     * KUNCI UTAMA: Intercept tombol volume hardware.
     *
     * Saat meeting aktif, WebRTC di WebView secara internal mengeset
     * audio mode ke MODE_IN_COMMUNICATION sehingga tombol volume
     * mengontrol STREAM_VOICE_CALL. Kita override di sini agar
     * selalu mengontrol STREAM_MUSIC (volume media/speaker biasa).
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (meetingActive && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int direction = (keyCode == KeyEvent.KEYCODE_VOLUME_UP)
                    ? AudioManager.ADJUST_RAISE
                    : AudioManager.ADJUST_LOWER;
                am.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    direction,
                    AudioManager.FLAG_SHOW_UI
                );
            }
            return true; // consume event — jangan teruskan ke sistem
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        // Consume volume key up juga supaya tidak trigger default behavior
        if (meetingActive && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Daftarkan plugin SEBELUM super.onCreate
        try {
            registerPlugin(ForegroundCallPlugin.class);
            registerPlugin(AudioRoutePlugin.class);
        } catch (Exception e) {
            Log.w(TAG, "Failed to register plugins: " + e.getMessage());
        }
        super.onCreate(savedInstanceState);
        // Cek jika app dibuka oleh "Akhiri" dari notifikasi
        handleFinishIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleFinishIntent(intent);
    }

    private void handleFinishIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("FINISH_APP", false)) {
            Log.d(TAG, "FINISH_APP received — closing app");
            finishAndRemoveTask();
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                webView.setKeepScreenOn(true);

                // Cegah Android membunuh WebView renderer di background
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    webView.setRendererPriorityPolicy(
                        WebView.RENDERER_PRIORITY_IMPORTANT, false
                    );
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "WebView settings error: " + e.getMessage());
        }
    }

    /**
     * KUNCI BACKGROUND AUDIO:
     * Saat Activity dipause (layar mati / tekan Home), Android akan mempause WebView
     * yang menyebabkan WebRTC berhenti. Kita override onStop() untuk langsung
     * resume WebView setelah system pause, sehingga audio tetap jalan.
     */
    @Override
    public void onStop() {
        super.onStop();
        // Resume WebView segera setelah system mem-pause-nya
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Exception e) {
            Log.w(TAG, "WebView resume on stop error: " + e.getMessage());
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder();
                pipBuilder.setAspectRatio(new Rational(16, 9));
                enterPictureInPictureMode(pipBuilder.build());
            }
        } catch (Exception e) {
            Log.w(TAG, "PiP enter error: " + e.getMessage());
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                final String js = "window.dispatchEvent(new CustomEvent('pipModeChanged', " +
                    "{detail: {isPip: " + isInPictureInPictureMode + "}}));";
                webView.post(() -> webView.evaluateJavascript(js, null));
            }
        } catch (Exception e) {
            Log.w(TAG, "PiP mode change notify error: " + e.getMessage());
        }
    }
}
