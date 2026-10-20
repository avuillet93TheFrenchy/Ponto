import { isTauriRuntime, logWarn, tauriInvoke } from '@tauri';

/**
 * @typedef {object} LinuxVoice
 * @property {string} voiceURI
 * @property {string} name
 * @property {string} lang
 */

/**
 * @typedef {object} TtsWindow
 * @property {unknown} [speechSynthesis]
 * @property {unknown} [SpeechSynthesisUtterance]
 */

/**
 * @typedef {object} LinuxTtsDeps
 * @property {() => boolean} [isTauri]
 * @property {(cmd: string, args?: Record<string, unknown>) => Promise<unknown>} [invoke]
 * @property {(message: string) => unknown} [warn]
 */

/**
 * Installs a minimal `speechSynthesis` / `SpeechSynthesisUtterance` on top of the
 * speech-dispatcher commands (`src-tauri/src/tts.rs`), only inside Tauri when the
 * WebView has no Web Speech API (WebKitGTK as packaged by most Linux distributions).
 * If speech-dispatcher cannot be reached, both are removed again and `voiceschanged`
 * fires, so the listen buttons get hidden.
 *
 * @param {TtsWindow} [win]
 * @param {LinuxTtsDeps} [deps]
 * @returns {Promise<void>} Settles once the voices are loaded (or the install undone).
 */
export async function installLinuxTts(win = window, deps = {}) {
  const { isTauri = isTauriRuntime, invoke = tauriInvoke, warn = logWarn } = deps;
  if ('speechSynthesis' in win || !isTauri()) return;

  /** @param {unknown} err */
  const report = (err) => {
    void Promise.resolve(warn(`Lecture vocale Linux : ${err}`)).catch(() => {});
  };

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

  // Each Rust command runs on its own blocking thread, so two invokes may run in either order.
  // main.js calls cancel() right before speak(): queued, that cancel cannot stop the new utterance.
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();
  /** @param {() => Promise<unknown>} call */
  const enqueue = (call) => {
    queue = queue.then(call).catch(report);
  };

  /** @type {LinuxVoice[]} */
  let voices = [];
  const target = new EventTarget();
  win.speechSynthesis = {
    getVoices: () => voices,
    /** @param {Utterance} u */
    speak: (u) => {
      enqueue(() => invoke('tts_speak', { text: u.text, lang: u.lang, voice: u.voice?.voiceURI ?? null }));
    },
    cancel: () => {
      enqueue(() => invoke('tts_cancel'));
    },
    /**
     * @param {string} type
     * @param {EventListenerOrEventListenerObject | null} listener
     * @param {boolean | AddEventListenerOptions} [options]
     */
    addEventListener: (type, listener, options) => target.addEventListener(type, listener, options),
  };

  try {
    voices = /** @type {LinuxVoice[]} */ (await invoke('tts_voices'));
  } catch (err) {
    report(err);
    delete win.speechSynthesis;
    delete win.SpeechSynthesisUtterance;
  }
  target.dispatchEvent(new Event('voiceschanged'));
}
