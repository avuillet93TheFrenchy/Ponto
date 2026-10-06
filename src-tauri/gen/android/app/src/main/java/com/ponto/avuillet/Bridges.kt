package com.ponto.avuillet

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Text-to-speech for the WebView, which has no Web Speech API.
 * Exposed to the page as `window.AndroidTts`; `src/js/tts-android.js` builds `speechSynthesis` on top of it.
 */
class AndroidTts(context: Context) {
  @Volatile private var ready = false

  private val engine = TextToSpeech(context.applicationContext) { status ->
    ready = status == TextToSpeech.SUCCESS
  }

  /** True once the engine has finished loading its voices. */
  @JavascriptInterface
  fun available(): Boolean = ready

  /** JSON array of `{ voiceURI, name, lang }`, like the browser's `SpeechSynthesisVoice`. */
  @JavascriptInterface
  fun voices(): String {
    val list = JSONArray()
    if (ready) {
      for (voice in engine.voices.orEmpty().sortedBy { it.name }) {
        list.put(
          JSONObject()
            .put("voiceURI", voice.name)
            .put("name", voice.name)
            .put("lang", voice.locale.toLanguageTag())
        )
      }
    }
    return list.toString()
  }

  /** Reads [text] with the voice [voiceUri] when it exists, else with the default voice for [lang]. */
  @JavascriptInterface
  fun speak(text: String, lang: String, voiceUri: String) {
    if (!ready) return
    val chosen = if (voiceUri.isEmpty()) null else engine.voices.orEmpty().firstOrNull { it.name == voiceUri }
    if (chosen != null) {
      engine.voice = chosen
    } else {
      engine.language = Locale.forLanguageTag(lang.replace('_', '-'))
    }
    engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ponto-tts")
  }

  @JavascriptInterface
  fun cancel() {
    engine.stop()
  }

  fun shutdown() {
    engine.stop()
    engine.shutdown()
  }
}

/**
 * Locks the screen orientation from the page (`window.TraducteurOrientation.set`):
 * « Les deux » needs landscape, the single-engine mode stays in portrait.
 */
class Orientation(private val activity: Activity) {
  @JavascriptInterface
  fun set(mode: String) {
    activity.runOnUiThread {
      activity.requestedOrientation =
        if (mode == "landscape") ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        else ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
    }
  }
}
