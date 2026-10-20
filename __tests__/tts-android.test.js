import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAndroidTts } from '@js/tts-android.js';

/**
 * @returns {{ voices: import('vitest').Mock, speak: import('vitest').Mock, cancel: import('vitest').Mock, available: import('vitest').Mock }}
 */
function fakeBridge() {
  return {
    voices: vi.fn(() => JSON.stringify([{ voiceURI: 'fr-fr-x-a', name: 'fr-fr-x-a', lang: 'fr-FR' }])),
    speak: vi.fn(),
    cancel: vi.fn(),
    available: vi.fn(() => true),
  };
}

/**
 * A stand-in for `window`, as the Android WebView exposes it.
 *
 * @param {object} [members]
 * @returns {any}
 */
const fakeWindow = (members = {}) => ({ ...members });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('installation', () => {
  it('ne fait rien sans pont natif', () => {
    const win = fakeWindow();

    installAndroidTts(win);

    expect(win).not.toHaveProperty('speechSynthesis');
    expect(win).not.toHaveProperty('SpeechSynthesisUtterance');
  });

  it('garde la synthèse vocale du navigateur quand elle existe', () => {
    const native = { speak: vi.fn() };
    const win = fakeWindow({ AndroidTts: fakeBridge(), speechSynthesis: native });

    installAndroidTts(win);

    expect(win.speechSynthesis).toBe(native);
    expect(win).not.toHaveProperty('SpeechSynthesisUtterance');
  });

  it('crée speechSynthesis et SpeechSynthesisUtterance au-dessus du pont', () => {
    const win = fakeWindow({ AndroidTts: fakeBridge() });

    installAndroidTts(win);

    expect(win.speechSynthesis).toBeDefined();
    const utterance = new win.SpeechSynthesisUtterance('Bonjour');
    expect(utterance).toMatchObject({ text: 'Bonjour', lang: '', voice: null });
  });
});

describe('speechSynthesis', () => {
  /** @returns {{ win: any, bridge: ReturnType<typeof fakeBridge> }} */
  function installed() {
    const bridge = fakeBridge();
    const win = fakeWindow({ AndroidTts: bridge });
    installAndroidTts(win);
    return { win, bridge };
  }

  it('liste les voix du moteur Android', () => {
    const { win } = installed();

    expect(win.speechSynthesis.getVoices()).toEqual([{ voiceURI: 'fr-fr-x-a', name: 'fr-fr-x-a', lang: 'fr-FR' }]);
  });

  it('lit un texte avec la voix choisie', () => {
    const { win, bridge } = installed();
    const utterance = new win.SpeechSynthesisUtterance('Bonjour');
    utterance.lang = 'fr-FR';
    utterance.voice = { voiceURI: 'fr-fr-x-a' };

    win.speechSynthesis.speak(utterance);

    expect(bridge.speak).toHaveBeenCalledWith('Bonjour', 'fr-FR', 'fr-fr-x-a');
  });

  it('lit avec la voix par défaut (URI vide) quand aucune voix n’est choisie', () => {
    const { win, bridge } = installed();
    const utterance = new win.SpeechSynthesisUtterance('Hello');
    utterance.lang = 'en-US';

    win.speechSynthesis.speak(utterance);

    expect(bridge.speak).toHaveBeenCalledWith('Hello', 'en-US', '');
  });

  it('interrompt la lecture', () => {
    const { win, bridge } = installed();

    win.speechSynthesis.cancel();

    expect(bridge.cancel).toHaveBeenCalledOnce();
  });
});

describe('événement voiceschanged', () => {
  /**
   * @param {ReturnType<typeof fakeBridge>} bridge
   * @returns {{ win: any, fired: import('vitest').Mock }}
   */
  function installedWithListener(bridge) {
    const win = fakeWindow({ AndroidTts: bridge });
    installAndroidTts(win);
    const fired = vi.fn();
    win.speechSynthesis.addEventListener('voiceschanged', fired);
    return { win, fired };
  }

  it('est émis dès que le moteur a chargé ses voix', () => {
    const bridge = fakeBridge();
    bridge.available.mockReturnValueOnce(false).mockReturnValue(true);
    const { fired } = installedWithListener(bridge);

    vi.advanceTimersByTime(250);
    expect(fired).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(fired).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(5000);
    expect(fired).toHaveBeenCalledOnce();
  });

  it('est émis malgré tout après vingt tentatives si le moteur ne répond pas', () => {
    const bridge = fakeBridge();
    bridge.available.mockReturnValue(false);
    const { fired } = installedWithListener(bridge);

    vi.advanceTimersByTime(250 * 20);
    expect(fired).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(fired).toHaveBeenCalledOnce();
  });
});
