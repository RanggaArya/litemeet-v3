package com.aralya.litemeet;

import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

/**
 * Capacitor Plugin untuk mengontrol audio routing di Android.
 *
 * MASALAH: WebRTC di WebView secara internal terus mengeset
 * AudioManager.MODE_IN_COMMUNICATION, yang menyebabkan:
 *   - Audio keluar via earpiece (bukan loudspeaker)
 *   - Tombol volume mengontrol STREAM_VOICE_CALL (bukan STREAM_MUSIC)
 *
 * SOLUSI: Gunakan Handler periodik (setiap 500ms) yang terus memaksa
 * MODE_NORMAL + speakerphoneOn(true) selama meeting aktif.
 * Juga override volume key di MainActivity agar selalu kontrol STREAM_MUSIC.
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private static final String TAG = "AudioRoutePlugin";
    private boolean isSpeakerOn = false;
    private boolean isMeetingActive = false;

    // Handler untuk secara periodik enforce audio mode
    private Handler audioEnforcer = null;
    private Runnable audioEnforcerRunnable = null;
    private static final int ENFORCE_INTERVAL_MS = 500; // setiap 500ms

    // Simpan AudioFocusRequest untuk API 26+ agar bisa di-abandon dengan benar
    private android.media.AudioFocusRequest audioFocusRequest = null;

    /**
     * Aktifkan mode meeting:
     * - Audio lewat speaker media (MODE_NORMAL + speakerphoneOn)
     * - Tombol volume hardware dikunci ke STREAM_MUSIC
     * - Handler periodik enforce setting agar WebRTC tidak bisa override
     */
    @PluginMethod
    public void enableCallMode(PluginCall call) {
        isMeetingActive = true;
        isSpeakerOn = true;

        try {
            // Set audio mode sekali dulu
            enforceAudioMode();

            // Request audio focus
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    audioFocusRequest = new android.media.AudioFocusRequest.Builder(
                        AudioManager.AUDIOFOCUS_GAIN
                    )
                    .setAudioAttributes(
                        new android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setOnAudioFocusChangeListener(focusChange -> {
                        Log.d(TAG, "Audio focus changed: " + focusChange);
                    })
                    .build();
                    am.requestAudioFocus(audioFocusRequest);
                } else {
                    am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
                }
            }

            // Paksa volume control stream ke STREAM_MUSIC
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().setVolumeControlStream(AudioManager.STREAM_MUSIC);
                } catch (Exception e) {
                    Log.w(TAG, "setVolumeControlStream error: " + e.getMessage());
                }
            });

            // Signal ke MainActivity bahwa meeting aktif (untuk intercept volume keys)
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).setMeetingActive(true);
            }

            // Start periodic enforcer — ini yang memaksa MODE_NORMAL terus-menerus
            // karena WebRTC di WebView terus menimpa ke MODE_IN_COMMUNICATION
            startAudioEnforcer();

            Log.d(TAG, "enableCallMode: meeting active, audio enforcer started");
        } catch (Exception e) {
            Log.w(TAG, "enableCallMode error: " + e.getMessage());
        }

        JSObject result = new JSObject();
        result.put("speakerOn", isSpeakerOn);
        call.resolve(result);
    }

    /**
     * Nonaktifkan mode meeting — hentikan enforcer dan kembalikan ke default.
     */
    @PluginMethod
    public void disableCallMode(PluginCall call) {
        isMeetingActive = false;
        isSpeakerOn = false;

        // Stop periodic enforcer
        stopAudioEnforcer();

        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setMode(AudioManager.MODE_NORMAL);
                am.setSpeakerphoneOn(false);

                // Lepas audio focus
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (audioFocusRequest != null) {
                        am.abandonAudioFocusRequest(audioFocusRequest);
                        audioFocusRequest = null;
                    }
                } else {
                    am.abandonAudioFocus(null);
                }
            }

            // Reset volume control ke default
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE);
                } catch (Exception e) {
                    Log.w(TAG, "setVolumeControlStream reset error: " + e.getMessage());
                }
            });

            // Signal ke MainActivity
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).setMeetingActive(false);
            }

            Log.d(TAG, "disableCallMode: meeting ended, enforcer stopped");
        } catch (Exception e) {
            Log.w(TAG, "disableCallMode error: " + e.getMessage());
        }
        call.resolve();
    }

    /**
     * Toggle antara earpiece dan loudspeaker saat meeting.
     */
    @PluginMethod
    public void toggleSpeaker(PluginCall call) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                isSpeakerOn = !isSpeakerOn;
                am.setSpeakerphoneOn(isSpeakerOn);
                Log.d(TAG, "Speaker toggled: " + (isSpeakerOn ? "ON (loudspeaker)" : "OFF (earpiece)"));
            }
        } catch (Exception e) {
            Log.w(TAG, "toggleSpeaker error: " + e.getMessage());
        }

        JSObject result = new JSObject();
        result.put("speakerOn", isSpeakerOn);
        call.resolve(result);
    }

    /**
     * Cek status speaker saat ini
     */
    @PluginMethod
    public void getSpeakerStatus(PluginCall call) {
        JSObject result = new JSObject();
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                isSpeakerOn = am.isSpeakerphoneOn();
            }
        } catch (Exception e) {
            Log.w(TAG, "getSpeakerStatus error: " + e.getMessage());
        }
        result.put("speakerOn", isSpeakerOn);
        call.resolve(result);
    }

    // ================================================================
    //  AUDIO ENFORCER — paksa MODE_NORMAL + speaker secara periodik
    // ================================================================

    /**
     * Paksa audio mode ke MODE_NORMAL dan speaker ON.
     * Dipanggil setiap 500ms oleh Handler selama meeting aktif.
     */
    private void enforceAudioMode() {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int currentMode = am.getMode();

                // Jika WebRTC sudah menimpa ke MODE_IN_COMMUNICATION, paksa balik
                if (currentMode != AudioManager.MODE_NORMAL) {
                    am.setMode(AudioManager.MODE_NORMAL);
                    Log.d(TAG, "enforceAudioMode: overrode mode " + currentMode + " -> MODE_NORMAL");
                }

                // Paksa speaker sesuai state terakhir
                if (isSpeakerOn && !am.isSpeakerphoneOn()) {
                    am.setSpeakerphoneOn(true);
                    Log.d(TAG, "enforceAudioMode: re-enabled speakerphone");
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "enforceAudioMode error: " + e.getMessage());
        }
    }

    /**
     * Start periodic Handler yang enforce audio mode setiap 500ms.
     */
    private void startAudioEnforcer() {
        stopAudioEnforcer(); // hentikan jika sudah berjalan

        audioEnforcer = new Handler(Looper.getMainLooper());
        audioEnforcerRunnable = new Runnable() {
            @Override
            public void run() {
                if (isMeetingActive) {
                    enforceAudioMode();
                    if (audioEnforcer != null) {
                        audioEnforcer.postDelayed(this, ENFORCE_INTERVAL_MS);
                    }
                }
            }
        };
        audioEnforcer.postDelayed(audioEnforcerRunnable, ENFORCE_INTERVAL_MS);
    }

    /**
     * Stop periodic enforcer.
     */
    private void stopAudioEnforcer() {
        if (audioEnforcer != null && audioEnforcerRunnable != null) {
            audioEnforcer.removeCallbacks(audioEnforcerRunnable);
        }
        audioEnforcer = null;
        audioEnforcerRunnable = null;
    }
}
