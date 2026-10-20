---
name: component-gen
description: Use when generating a new UI component or UI-wiring module - detects the project's approach (vanilla JS init modules, React/Vue/Svelte/... components), follows its conventions, and creates the file with its associated unit test.
---

# UI Component / Module Generator

## Project context

Resolve the profile first (`.claude/PROJECT-CONTEXT.md`): `<src>`, `<tests>`, `stack.frameworks`,
`stack.typescript`, and read the `conventions` files and `notes`. Then **read 1-2 existing UI files** to
confirm the real pattern — never assume a `components/` folder or an alias that does not exist (check
`vite.config.*` / `tsconfig.json` / `jsconfig.json` for aliases).

| Project style | What to generate |
| --- | --- |
| Vanilla JS, markup in HTML | A module exporting `init<Name>()` that wires an existing DOM section, imported once from the entry point |
| Vanilla JS, markup built in JS | A factory `create<Name>(props)` returning an element (built with `createElement`/`textContent`) |
| React / Preact / Solid | A function component in the project's component folder, props typed (TS or JSDoc) |
| Vue | An SFC (`<script setup>` if the codebase uses it) |
| Svelte | A `.svelte` component following the codebase's Svelte version (runes or not) |
| Web components / Lit | A custom element class, registered with the project's prefix |

## Workflow

1. Ask for: name and a brief description of the UI and behavior
2. Read existing UI files to confirm naming, folder, typing, styling and i18n conventions
3. Generate the module/component in the folder the project uses
4. Generate the associated unit test (see `gen-test` for layout and runner)
5. Ask whether to wire it in (entry point import, parent component, route)

## Vanilla example

```js
// <src>/userCard.js
import { t } from './i18n.js'; // only if the project has an i18n helper

/**
 * Wires the user-card summary declared in index.html.
 * @param {{ name: string, avatarUrl: string }} user
 */
export function initUserCard(user) {
    const nameEl = document.getElementById('user-card-name');
    const avatarEl = /** @type {HTMLImageElement | null} */ (
        document.getElementById('user-card-avatar')
    );

    if (!nameEl || !avatarEl) return;

    // textContent, never innerHTML, for user-provided or dynamic data (avoids XSS)
    nameEl.textContent = user.name;
    avatarEl.src = user.avatarUrl;
    avatarEl.alt = t('userCard.avatarAlt', { name: user.name });
}
```

> Always use `textContent` (not `innerHTML`) for user-provided or dynamic data to prevent XSS.
> If the project is internationalised, use its translation helper for every user-facing string.

## Associated Test (vanilla, jsdom)

```js
import { initUserCard } from '../src/userCard.js';

describe('initUserCard', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <span id="user-card-name"></span>
            <img id="user-card-avatar" />
        `;
    });

    it('renders the user name', () => {
        initUserCard({ name: 'Alice', avatarUrl: '/avatar.png' });
        expect(document.getElementById('user-card-name')?.textContent).toBe('Alice');
    });
});
```

For framework components, test with the library the project already uses (`@testing-library/react`,
`@vue/test-utils`, `@testing-library/svelte`...): render, interact, assert on accessible output.

## Checklist Before Delivering

- [ ] Follows the naming, folder, typing (TS/JSDoc) and import style of existing UI files
- [ ] User data rendered safely (`textContent`, framework escaping — no `innerHTML`/`v-html`/`{@html}`/`dangerouslySetInnerHTML` with untrusted data)
- [ ] User-facing strings use the project's i18n helper when there is one
- [ ] Accessible by default: semantic elements, labels, keyboard support
- [ ] Test file created where the project keeps tests, and passes (`<exec> vitest run <file>` / `<exec> jest <file>`)
- [ ] Asked whether to wire it in

## Scope and Cross-References

- For full unit test suite → `gen-test`
- For E2E tests of the flow it's part of → `gen-test-e2e`
- For accessibility audit of the component → `a11y-fixer`
