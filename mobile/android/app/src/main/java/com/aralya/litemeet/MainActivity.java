package com.aralya.litemeet;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.util.Rational;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "LiteMeetMain";

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
