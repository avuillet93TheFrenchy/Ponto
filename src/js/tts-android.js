/**
 * @typedef {object} AndroidTtsBridge
 * @property {() => string} voices - JSON array of the available voices.
 * @property {(text: string, lang: string, voiceUri: string) => void} speak
 * @property {() => void} cancel
 * @property {() => boolean} available - Whether the native engine finished loading its voices.
 */

/**
 * @typedef {object} TtsWindow
 * @property {AndroidTtsBridge} [AndroidTts] - Injected by the Android WebView.
 * @property {unknown} [speechSynthesis]
 * @property {unknown} [SpeechSynthesisUtterance]
 */

/**
 * Installs a minimal `speechSynthesis` / `SpeechSynthesisUtterance` on top of the
 * native Android bridge, only when the WebView provides the bridge but no Web Speech API.
 *
 * @param {TtsWindow} [win]
 */
export function installAndroidTts(win = window) {
  const bridge = win.AndroidTts;
  if (!bridge || 'speechSynthesis' in win) return;

  class Utterance {
    /** @type {string} */
    text;
    /** @type {string} */
    lang = '';
    /** @type {{ voiceURI?: string } | null} */
    voice = null;

    /** @param {string} text */
    constructor(text) {
      this.text = text;
    }
  }
  win.SpeechSynthesisUtterance = Utterance;

  const target = new EventTarget();
  win.speechSynthesis = {
    getVoices: () => JSON.parse(bridge.voices()),
    /** @param {Utterance} u */
    speak: (u) => bridge.speak(u.text, u.lang, u.voice?.voiceURI ?? ''),
    cancel: () => bridge.cancel(),
    /**
     * @param {string} type
     * @param {EventListenerOrEventListenerObject | null} listener
     * @param {boolean | AddEventListenerOptions} [options]
     */
    addEventListener: (type, listener, options) => target.addEventListener(type, listener, options),
  };
  let tries = 0;
  const timer = setInterval(() => {
    if (bridge.available() || ++tries > 20) {
      clearInterval(timer);
      target.dispatchEvent(new Event('voiceschanged'));
    }
  }, 250);
}
