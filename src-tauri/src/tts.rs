//! Read-aloud for Linux. The WebKitGTK builds of most distributions ship without
//! the Web Speech API, so `src/js/tts-linux.js` builds `speechSynthesis` on these
//! commands, which talk to speech-dispatcher. Other platforms have a working Web
//! Speech API (Windows) or a native bridge (Android), and the commands only fail.

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// One voice, shaped like the Web Speech API's `SpeechSynthesisVoice`.
#[derive(Serialize, Debug, PartialEq)]
pub struct TtsVoice {
  #[serde(rename = "voiceURI")]
  pub voice_uri: String,
  pub name: String,
  pub lang: String,
}

/// The speech-dispatcher connection, opened on first use and reopened when it breaks.
#[derive(Default)]
pub struct TtsState {
  #[cfg(target_os = "linux")]
  connection: std::sync::Mutex<Option<speech_dispatcher::Connection>>,
}

#[tauri::command]
pub async fn tts_voices(app: AppHandle) -> Result<Vec<TtsVoice>, String> {
  blocking(app, |state| state.voices()).await
}

#[tauri::command]
pub async fn tts_speak(
  app: AppHandle,
  text: String,
  lang: String,
  voice: Option<String>,
) -> Result<(), String> {
  blocking(app, move |state| state.speak(&text, &lang, voice.as_deref())).await
}

#[tauri::command]
pub async fn tts_cancel(app: AppHandle) -> Result<(), String> {
  blocking(app, |state| state.cancel()).await
}

/// libspeechd blocks (and may spawn the daemon on first use): keep it off the async runtime.
async fn blocking<T, F>(app: AppHandle, f: F) -> Result<T, String>
where
  T: Send + 'static,
  F: FnOnce(&TtsState) -> Result<T, String> + Send + 'static,
{
  tauri::async_runtime::spawn_blocking(move || f(&app.state::<TtsState>()))
    .await
    .map_err(|e| format!("Lecture vocale interrompue : {e}"))?
}

/// speech-dispatcher's C API takes NUL-terminated strings (the crate panics on an inner NUL).
#[cfg(any(target_os = "linux", test))]
fn without_nul(text: &str) -> String {
  text.replace('\0', "")
}

#[cfg(target_os = "linux")]
impl TtsState {
  fn with_connection<T>(
    &self,
    f: impl Fn(&speech_dispatcher::Connection) -> Result<T, String>,
  ) -> Result<T, String> {
    let mut guard = self.connection.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(conn) = guard.as_ref()
      && let Ok(value) = f(conn)
    {
      return Ok(value);
    }
    // No connection yet, or the daemon went away (it exits when idle): reconnect once.
    *guard = None;
    let conn = speech_dispatcher::Connection::open(
      "ponto",
      "main",
      "ponto",
      speech_dispatcher::Mode::Threaded,
    )
    .map_err(|e| format!("Lecture vocale indisponible (speech-dispatcher) : {e}"))?;
    let value = f(&conn)?;
    *guard = Some(conn);
    Ok(value)
  }

  fn voices(&self) -> Result<Vec<TtsVoice>, String> {
    self.with_connection(|conn| {
      let voices = conn
        .list_synthesis_voices()
        .map_err(|e| format!("Liste des voix indisponible : {e}"))?;
      Ok(base_voices(voices).into_iter().map(to_voice).collect())
    })
  }

  fn speak(&self, text: &str, lang: &str, voice: Option<&str>) -> Result<(), String> {
    let text = without_nul(text);
    let lang = without_nul(lang);
    let voice = voice.filter(|v| !v.is_empty()).map(without_nul);
    self.with_connection(|conn| {
      let failed = |e: speech_dispatcher::Error| format!("Lecture vocale impossible : {e}");
      conn.cancel().map_err(failed)?;
      conn.set_language(lang.as_str()).map_err(failed)?;
      if let Some(name) = &voice {
        let voice = speech_dispatcher::Voice {
          name: name.clone(),
          language: lang.clone(),
          variant: None,
        };
        conn.set_synthesis_voice(&voice).map_err(failed)?;
      }
      conn
        .say(speech_dispatcher::Priority::Text, text.as_str())
        .map(|_| ())
        .ok_or_else(|| "Lecture vocale impossible.".to_string())
    })
  }

  fn cancel(&self) -> Result<(), String> {
    let guard = self.connection.lock().unwrap_or_else(|e| e.into_inner());
    // Nothing is being read without a connection.
    match guard.as_ref() {
      Some(conn) => conn.cancel().map_err(|e| format!("Arrêt de la lecture impossible : {e}")),
      None => Ok(()),
    }
  }
}

#[cfg(not(target_os = "linux"))]
impl TtsState {
  fn voices(&self) -> Result<Vec<TtsVoice>, String> {
    Err(UNSUPPORTED.to_string())
  }

  fn speak(&self, _text: &str, _lang: &str, _voice: Option<&str>) -> Result<(), String> {
    Err(UNSUPPORTED.to_string())
  }

  fn cancel(&self) -> Result<(), String> {
    Err(UNSUPPORTED.to_string())
  }
}

#[cfg(not(target_os = "linux"))]
const UNSUPPORTED: &str = "Lecture vocale native indisponible sur ce système.";

/// espeak-ng lists every voice once per timbre variant (about a hundred each, ~15 000 in
/// all): keep the base voices, unless a module only reports variants.
#[cfg(target_os = "linux")]
fn base_voices(voices: Vec<speech_dispatcher::Voice>) -> Vec<speech_dispatcher::Voice> {
  if voices.iter().any(|v| v.variant.is_none()) {
    voices.into_iter().filter(|v| v.variant.is_none()).collect()
  } else {
    voices
  }
}

#[cfg(target_os = "linux")]
fn to_voice(voice: speech_dispatcher::Voice) -> TtsVoice {
  TtsVoice {
    voice_uri: voice.name.clone(),
    name: voice.name,
    // speech-dispatcher modules disagree on the case and separator (`fr-FR`, `fr_fr`).
    lang: voice.language.replace('_', "-"),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn strips_nul_bytes() {
    assert_eq!(without_nul("Bon\0jour"), "Bonjour");
  }

  #[test]
  fn serializes_like_the_web_speech_api() {
    let voice = TtsVoice {
      voice_uri: "French (France)".into(),
      name: "French (France)".into(),
      lang: "fr-FR".into(),
    };
    assert_eq!(
      serde_json::to_value(&voice).unwrap(),
      serde_json::json!({ "voiceURI": "French (France)", "name": "French (France)", "lang": "fr-FR" })
    );
  }

  #[cfg(target_os = "linux")]
  #[test]
  fn maps_speech_dispatcher_voices() {
    let voice = speech_dispatcher::Voice {
      name: "fr+klatt".into(),
      language: "fr_FR".into(),
      variant: None,
    };
    assert_eq!(
      to_voice(voice),
      TtsVoice { voice_uri: "fr+klatt".into(), name: "fr+klatt".into(), lang: "fr-FR".into() }
    );
  }

  #[cfg(target_os = "linux")]
  #[test]
  fn keeps_base_voices_only() {
    let voice = |name: &str, variant: Option<&str>| speech_dispatcher::Voice {
      name: name.into(),
      language: "fr-FR".into(),
      variant: variant.map(str::to_string),
    };
    let names = |voices: Vec<speech_dispatcher::Voice>| voices.into_iter().map(|v| v.name).collect::<Vec<_>>();
    assert_eq!(
      names(base_voices(vec![voice("French", None), voice("French+Adam", Some("Adam"))])),
      ["French"]
    );
    assert_eq!(names(base_voices(vec![voice("French+Adam", Some("Adam"))])), ["French+Adam"]);
  }

  /// Needs a running (or spawnable) speech-dispatcher; reads a French sentence aloud.
  #[cfg(target_os = "linux")]
  #[test]
  #[ignore]
  fn speech_dispatcher_live() {
    let state = TtsState::default();
    let voices = state.voices().unwrap();
    let french: Vec<_> = voices.iter().filter(|v| v.lang.to_lowercase().starts_with("fr")).collect();
    println!("{} voix, dont {} en français : {:?}", voices.len(), french.len(), french.first());
    state.speak("Bonjour, ceci est un test de Ponto.", "fr", french.first().map(|v| v.voice_uri.as_str())).unwrap();
    std::thread::sleep(std::time::Duration::from_secs(4));
    state.cancel().unwrap();
  }
}
