---
name: a11y-fixer
description: Use when auditing or fixing accessibility issues at the code level (HTML, vanilla JS, framework components) - missing ARIA attributes, keyboard navigation, focus management, or color contrast.
---

# Accessibility Fixer (a11y)

Audits and fixes code-level accessibility issues in the project's UI.

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`) and read its `conventions` files and `notes`. Use `<src>` and `stack.frameworks` to know which files to scan, and reuse the project's theming variables and i18n helper in fixes.

> This skill operates on source code. For runtime inspection via DevTools, use `chrome-devtools:a11y-debugging` instead.

## Workflow

1. Ask for the scope: a specific file, component, or `all` visible pages
2. Scan for issues by category (see below)
3. Report issues with severity and the exact fix
4. Apply fixes after confirmation

## 1. ARIA Attributes

```html
<!-- ❌ Icon button with no label -->
<button onclick="closeModal()">✕</button>

<!-- ✅ Screen-reader label -->
<button onclick="closeModal()" aria-label="Close dialog">✕</button>

<!-- ❌ Dynamic content not announced -->
<div id="status">Loading...</div>

<!-- ✅ Live region for dynamic updates -->
<div id="status" aria-live="polite" aria-atomic="true">Loading...</div>

<!-- ❌ Custom toggle with no state -->
<div class="toggle" onclick="toggle()">Dark mode</div>

<!-- ✅ Role and checked state -->
<div
    class="toggle"
    role="switch"
    aria-checked="false"
    tabindex="0"
    onclick="toggle()"
    onkeydown="handleKey(event)"
>
    Dark mode
</div>
```

## 2. Keyboard Navigation

```js
// ❌ Click-only interaction (mouse users only)
element.addEventListener('click', activate);

// ✅ Also handles Enter and Space for keyboard users
element.addEventListener('click', activate);
element.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
    }
});

// ❌ Non-focusable interactive element
const card = document.createElement('div');
card.onclick = openDetail;

// ✅ Focusable with tabindex
const card = document.createElement('div');
card.setAttribute('tabindex', '0');
card.setAttribute('role', 'button');
card.onclick = openDetail;
card.onkeydown = (e) => {
    if (e.key === 'Enter') openDetail();
};
```

## 3. Focus Management

```js
// ❌ Modal opens but focus stays behind it
function openModal() {
    modal.style.display = 'block';
}

// ✅ Focus moved to modal, returned on close
function openModal() {
    const trigger = document.activeElement;
    modal.style.display = 'block';
    modal.setAttribute('aria-modal', 'true');
    modal.querySelector('[autofocus], button, [tabindex]').focus();

    modal.dataset.returnFocus = 'true';
    modal._trigger = trigger;
}

function closeModal() {
    modal.style.display = 'none';
    modal._trigger?.focus();
}
```

## 4. Semantic HTML

| Pattern                        | Fix                                              |
| ------------------------------ | ------------------------------------------------ |
| `<div onclick>` for navigation | Use `<a href>`                                   |
| `<div onclick>` for actions    | Use `<button>`                                   |
| `<span>` as heading            | Use `<h1>`–`<h6>`                                |
| `<img>` without `alt`          | Add `alt=""` for decorative, or descriptive text |
| Form `<input>` without label   | Add `<label for>` or `aria-label`                |

## 5. Color Contrast

Minimum contrast ratios (WCAG AA):

| Text size                          | Required ratio |
| ---------------------------------- | -------------- |
| Normal text (< 18px)               | 4.5:1          |
| Large text (≥ 18px or bold ≥ 14px) | 3:1            |
| UI components, focus rings         | 3:1            |

```css
/* ❌ Low contrast */
.hint {
    color: #aaaaaa;
    background: #ffffff;
} /* 2.3:1 */

/* ✅ Passes AA */
.hint {
    color: #767676;
    background: #ffffff;
} /* 4.5:1 */
```

## Report Format

```
[CRITICAL/HIGH/MEDIUM/LOW] Issue title
  File    : index.html:58 (or <src>/components/menu.js:34)
  WCAG    : 2.1 criterion (e.g. 2.1.1 Keyboard, 1.4.3 Contrast)
  Detail  : description
  Fix     : corrected code
```

## Scope and Cross-References

- For runtime DevTools audit → `chrome-devtools:a11y-debugging`
- For component generation with a11y built in → `component-gen`
