package com.aralya.litemeet;

import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

/**
 * Capacitor Plugin untuk mengontrol audio routing di Android.
 * - MODE_IN_COMMUNICATION: audio melalui earpiece (volume panggilan)
 * - setSpeakerphoneOn: toggle antara earpiece dan loudspeaker
 * 
 * Ini membuat pengalaman seperti WhatsApp/Zoom dimana:
 * - Default pakai earpiece (speaker panggilan)
 * - Tombol volume mengontrol volume panggilan, bukan media
 * - User bisa toggle ke loudspeaker jika mau
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private static final String TAG = "AudioRoutePlugin";
    private boolean isSpeakerOn = false;

    /**
     * Aktifkan mode komunikasi (sekarang diubah ke MODE_NORMAL / media volume)
     * Sesuai request: menggunakan volume media, bukan volume panggilan, dan langsung lewat speaker
     */
    @PluginMethod
    public void enableCallMode(PluginCall call) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setMode(AudioManager.MODE_NORMAL);
                am.setSpeakerphoneOn(true);
                isSpeakerOn = true;
                
                // Request audio focus agar audio dari app lain di-duck/pause
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    android.media.AudioFocusRequest focusReq = new android.media.AudioFocusRequest.Builder(
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
                    ).build();
                    am.requestAudioFocus(focusReq);
                } else {
                    am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
                }

                Log.d(TAG, "Call mode enabled — MODE_NORMAL, speaker ON");
            }
        } catch (Exception e) {
            Log.w(TAG, "enableCallMode error: " + e.getMessage());
        }

        JSObject result = new JSObject();
        result.put("speakerOn", isSpeakerOn);
        call.resolve(result);
    }

    /**
     * Kembalikan ke mode normal (media audio)
     * Panggil saat meeting selesai
     */
    @PluginMethod
    public void disableCallMode(PluginCall call) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setMode(AudioManager.MODE_NORMAL);
                am.setSpeakerphoneOn(true);
                isSpeakerOn = false;

                // Lepas audio focus
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    am.abandonAudioFocusRequest(
                        new android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).build()
                    );
                } else {
                    am.abandonAudioFocus(null);
                }

                Log.d(TAG, "Call mode disabled — normal mode restored");
            }
        } catch (Exception e) {
            Log.w(TAG, "disableCallMode error: " + e.getMessage());
        }
        call.resolve();
    }

    /**
     * Toggle antara earpiece dan loudspeaker
     * Return { speakerOn: boolean }
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
}
