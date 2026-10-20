import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installLinuxTts } from '@js/tts-linux.js';

const tauri = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(),
  logWarn: vi.fn(),
  tauriInvoke: vi.fn(),
}));

vi.mock('@tauri', () => tauri);

const VOICES = [{ voiceURI: 'french', name: 'French', lang: 'fr-FR' }];

/**
 * A stand-in for `window`, as WebKitGTK exposes it (no Web Speech API).
 *
 * @param {object} [members]
 * @returns {any}
 */
const fakeWindow = (members = {}) => ({ ...members });

/**
 * Injected dependencies: inside Tauri, `tts_voices` answers with {@link VOICES}.
 *
 * @returns {{ isTauri: import('vitest').Mock, invoke: import('vitest').Mock, warn: import('vitest').Mock }}
 */
function fakeDeps() {
  return {
    isTauri: vi.fn(() => true),
    invoke: vi.fn(async (/** @type {string} */ cmd) => (cmd === 'tts_voices' ? VOICES : undefined)),
    warn: vi.fn(),
  };
}

/** Lets the queued invokes (promise chain) run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** @returns {{ promise: Promise<unknown>, resolve: (value?: unknown) => void, reject: (reason: unknown) => void }} */
function deferred() {
  /** @type {(value?: unknown) => void} */
  let resolve = () => {};
  /** @type {(reason: unknown) => void} */
  let reject = () => {};
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('installation', () => {
  it('garde la synthèse vocale du navigateur quand elle existe', async () => {
    const native = { speak: vi.fn() };
    const win = fakeWindow({ speechSynthesis: native });
    const deps = fakeDeps();

    await installLinuxTts(win, deps);

    expect(win.speechSynthesis).toBe(native);
    expect(win).not.toHaveProperty('SpeechSynthesisUtterance');
    expect(deps.invoke).not.toHaveBeenCalled();
  });

  it('ne fait rien hors Tauri', async () => {
    const win = fakeWindow();
    const deps = fakeDeps();
    deps.isTauri.mockReturnValue(false);

    await installLinuxTts(win, deps);

    expect(win).not.toHaveProperty('speechSynthesis');
    expect(win).not.toHaveProperty('SpeechSynthesisUtterance');
    expect(deps.invoke).not.toHaveBeenCalled();
  });

  it('crée speechSynthesis et SpeechSynthesisUtterance, puis charge les voix', async () => {
    const win = fakeWindow();

    await installLinuxTts(win, fakeDeps());

    expect(win.speechSynthesis.getVoices()).toEqual(VOICES);
    const utterance = new win.SpeechSynthesisUtterance('Bonjour');
    expect(utterance).toMatchObject({ text: 'Bonjour', lang: '', voice: null });
  });

  it('émet voiceschanged une fois les voix chargées', async () => {
    const win = fakeWindow();
    const voices = deferred();
    const deps = fakeDeps();
    deps.invoke.mockReturnValue(voices.promise);

    const done = installLinuxTts(win, deps);
    // speechSynthesis exists before the voices arrive, so main.js can listen right away.
    const listener = vi.fn(() => win.speechSynthesis.getVoices());
    win.speechSynthesis.addEventListener('voiceschanged', listener);
    expect(win.speechSynthesis.getVoices()).toEqual([]);

    voices.resolve(VOICES);
    await done;

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveReturnedWith(VOICES);
  });

  it('sans speech-dispatcher, retire tout, journalise et émet voiceschanged', async () => {
    const win = fakeWindow();
    const deps = fakeDeps();
    deps.invoke.mockRejectedValue('speech-dispatcher introuvable');

    const done = installLinuxTts(win, deps);
    const listener = vi.fn();
    win.speechSynthesis.addEventListener('voiceschanged', listener);
    await done;

    expect(win).not.toHaveProperty('speechSynthesis');
    expect(win).not.toHaveProperty('SpeechSynthesisUtterance');
    expect(deps.warn).toHaveBeenCalledWith('Lecture vocale Linux : speech-dispatcher introuvable');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('utilise les fonctions Tauri par défaut', async () => {
    tauri.isTauriRuntime.mockReturnValue(true);
    tauri.tauriInvoke.mockResolvedValue(VOICES);
    const win = fakeWindow();

    await installLinuxTts(win);

    expect(tauri.tauriInvoke).toHaveBeenCalledWith('tts_voices');
    expect(win.speechSynthesis.getVoices()).toEqual(VOICES);
  });
});

describe('lecture', () => {
  /** @param {ReturnType<typeof fakeDeps>} deps */
  async function install(deps) {
    const win = fakeWindow();
    await installLinuxTts(win, deps);
    deps.invoke.mockClear();
    return win;
  }

  it('speak envoie le texte, la langue et la voix choisie', async () => {
    const deps = fakeDeps();
    const win = await install(deps);
    const utterance = new win.SpeechSynthesisUtterance('Bonjour');
    utterance.lang = 'fr-FR';
    utterance.voice = VOICES[0];

    win.speechSynthesis.speak(utterance);
    await flush();

    expect(deps.invoke).toHaveBeenCalledWith('tts_speak', { text: 'Bonjour', lang: 'fr-FR', voice: 'french' });
  });

  it('speak sans voix choisie envoie voice: null', async () => {
    const deps = fakeDeps();
    const win = await install(deps);

    win.speechSynthesis.speak(new win.SpeechSynthesisUtterance('Salut'));
    await flush();

    expect(deps.invoke).toHaveBeenCalledWith('tts_speak', { text: 'Salut', lang: '', voice: null });
  });

  it('cancel puis speak : speak attend la fin de cancel', async () => {
    const deps = fakeDeps();
    const win = await install(deps);
    const cancel = deferred();
    deps.invoke.mockReturnValueOnce(cancel.promise);

    win.speechSynthesis.cancel();
    win.speechSynthesis.speak(new win.SpeechSynthesisUtterance('Bonjour'));
    await flush();
    expect(deps.invoke.mock.calls.map(([cmd]) => cmd)).toEqual(['tts_cancel']);

    cancel.resolve();
    await flush();
    expect(deps.invoke.mock.calls.map(([cmd]) => cmd)).toEqual(['tts_cancel', 'tts_speak']);
  });

  it("l'échec d'une commande est journalisé et n'arrête pas les suivantes", async () => {
    const deps = fakeDeps();
    const win = await install(deps);
    deps.invoke.mockRejectedValueOnce('annulation impossible');

    win.speechSynthesis.cancel();
    win.speechSynthesis.speak(new win.SpeechSynthesisUtterance('Bonjour'));
    await flush();

    expect(deps.warn).toHaveBeenCalledWith('Lecture vocale Linux : annulation impossible');
    expect(deps.invoke).toHaveBeenLastCalledWith('tts_speak', { text: 'Bonjour', lang: '', voice: null });
  });

  it('un journal en échec ne casse pas la file', async () => {
    const deps = fakeDeps();
    const win = await install(deps);
    deps.warn.mockRejectedValue(new Error('log indisponible'));
    deps.invoke.mockRejectedValueOnce('erreur');

    win.speechSynthesis.cancel();
    win.speechSynthesis.speak(new win.SpeechSynthesisUtterance('Bonjour'));
    await flush();

    expect(deps.invoke).toHaveBeenLastCalledWith('tts_speak', expect.objectContaining({ text: 'Bonjour' }));
  });
});
