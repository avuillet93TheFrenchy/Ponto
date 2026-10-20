// Shared setup, loaded before each test file (see `setupFiles` in vitest.config.ts).
// It only adds the browser APIs that jsdom does not implement; each test file still
// stubs what it needs (`vi.stubGlobal`) on top of these defaults.
//
// Plain functions, not `vi.fn()`: `mockReset` in the Vitest config would wipe their implementation.

// Node-environment tests (`// @vitest-environment node`, e.g. the Worker) have no DOM to patch.
if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    /**
     * @param {string} query
     * @returns {MediaQueryList}
     */
    window.matchMedia = (query) =>
      /** @type {MediaQueryList} */ (
        /** @type {unknown} */ ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        })
      );
  }

  const dialog = HTMLDialogElement.prototype;

  if (typeof dialog.showModal !== 'function') {
    dialog.show = function show() {
      this.setAttribute('open', '');
    };
    dialog.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    /** @param {string} [returnValue] */
    dialog.close = function close(returnValue) {
      if (returnValue !== undefined) this.returnValue = returnValue;
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
