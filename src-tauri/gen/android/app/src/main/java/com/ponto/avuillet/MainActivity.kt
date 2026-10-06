package com.ponto.avuillet

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var tts: AndroidTts? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Called when the WebView is created, before the page loads: the bridges exist when main.js runs.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    tts = AndroidTts(this).also { webView.addJavascriptInterface(it, "AndroidTts") }
    webView.addJavascriptInterface(Orientation(this), "TraducteurOrientation")
  }

  override fun onDestroy() {
    tts?.shutdown()
    super.onDestroy()
  }
}
