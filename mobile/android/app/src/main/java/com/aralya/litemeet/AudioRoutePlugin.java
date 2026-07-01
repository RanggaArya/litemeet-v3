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
 * - enableCallMode: set speaker ON dan paksa tombol volume ke STREAM_MUSIC
 * - disableCallMode: reset ke default
 * - toggleSpeaker: toggle earpiece/loudspeaker
 *
 * Kunci: setVolumeControlStream(STREAM_MUSIC) agar tombol volume hardware
 * mengontrol volume media (bukan volume panggilan/VOICE_CALL).
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private static final String TAG = "AudioRoutePlugin";
    private boolean isSpeakerOn = false;

    // Simpan AudioFocusRequest untuk API 26+ agar bisa di-abandon dengan benar
    private android.media.AudioFocusRequest audioFocusRequest = null;

    /**
     * Aktifkan mode meeting:
     * - Audio lewat speaker (MODE_NORMAL + speakerphoneOn)
     * - Tombol volume hardware dikunci ke STREAM_MUSIC (bukan VOICE_CALL)
     */
    @PluginMethod
    public void enableCallMode(PluginCall call) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                // Gunakan MODE_NORMAL agar audio routing melalui media stream
                am.setMode(AudioManager.MODE_NORMAL);
                am.setSpeakerphoneOn(true);
                isSpeakerOn = true;

                // Request audio focus agar audio dari app lain di-duck/pause
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

                Log.d(TAG, "enableCallMode: MODE_NORMAL, speakerOn=true");
            }

            // *** KUNCI UTAMA: paksa tombol volume hardware ke STREAM_MUSIC ***
            // Tanpa ini, Android otomatis memilih STREAM_VOICE_CALL saat WebRTC aktif,
            // sehingga tombol volume mengontrol volume panggilan, bukan media.
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().setVolumeControlStream(AudioManager.STREAM_MUSIC);
                    Log.d(TAG, "Volume control stream -> STREAM_MUSIC");
                } catch (Exception e) {
                    Log.w(TAG, "setVolumeControlStream error: " + e.getMessage());
                }
            });

        } catch (Exception e) {
            Log.w(TAG, "enableCallMode error: " + e.getMessage());
        }

        JSObject result = new JSObject();
        result.put("speakerOn", isSpeakerOn);
        call.resolve(result);
    }

    /**
     * Nonaktifkan mode meeting — kembalikan audio dan volume control ke default.
     * Panggil saat meeting selesai / user leave.
     */
    @PluginMethod
    public void disableCallMode(PluginCall call) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setMode(AudioManager.MODE_NORMAL);
                am.setSpeakerphoneOn(false);
                isSpeakerOn = false;

                // Lepas audio focus
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (audioFocusRequest != null) {
                        am.abandonAudioFocusRequest(audioFocusRequest);
                        audioFocusRequest = null;
                    }
                } else {
                    am.abandonAudioFocus(null);
                }

                Log.d(TAG, "disableCallMode: normal mode restored");
            }

            // Reset volume control ke default sistem
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE);
                    Log.d(TAG, "Volume control stream -> USE_DEFAULT_STREAM_TYPE");
                } catch (Exception e) {
                    Log.w(TAG, "setVolumeControlStream reset error: " + e.getMessage());
                }
            });

        } catch (Exception e) {
            Log.w(TAG, "disableCallMode error: " + e.getMessage());
        }
        call.resolve();
    }

    /**
     * Toggle antara earpiece dan loudspeaker saat meeting.
     * Return { speakerOn: boolean }
     */
    @PluginMethod
    public void toggleSpeaker(PluginCall call) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                isSpeakerOn = !isSpeakerOn;
                am.setSpeakerphoneOn(isSpeakerOn);
                // Pastikan volume control tetap di STREAM_MUSIC setelah toggle
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().setVolumeControlStream(AudioManager.STREAM_MUSIC);
                    } catch (Exception e) {
                        Log.w(TAG, "toggleSpeaker setVolumeControlStream error: " + e.getMessage());
                    }
                });
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
