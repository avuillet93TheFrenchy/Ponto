# UnoCSS — Migration Guide

## ⚙️ Installation (Vite)

```bash
<commands.add> -D unocss
```

**vite.config.ts:**

```javascript
import UnoCSS from 'unocss/vite';

export default {
    plugins: [UnoCSS()],
};
```

**main.js:**

```javascript
import 'virtual:uno.css';
```

**uno.config.js:**

```javascript
import { defineConfig, presetUno, presetAttributify } from 'unocss';

export default defineConfig({
    presets: [
        presetUno(), // Tailwind-compatible syntax
        presetAttributify(), // Optional: classes as HTML attributes
    ],
});
```

---

## 🔄 UnoCSS is Tailwind-compatible

UnoCSS's greatest strength: it accepts **the same classes as Tailwind** via `presetUno()`. You can therefore use all the mappings from the `tailwind.md` file here!

```html
<!-- Works with UnoCSS exactly like Tailwind -->
<div
    class="flex items-center justify-between px-4 py-2 bg-blue-500 text-white rounded-lg"
></div>
```

---

## 🌟 UnoCSS Exclusive Features

### Attributify Mode (makes HTML more readable)

```html
<!-- Without attributify (classic Tailwind style) -->
<button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
    <!-- With attributify (more organized) -->
    <button
        px="4"
        py="2"
        bg="blue-500"
        text="white"
        rounded
        hover:bg="blue-600"
    ></button>
</button>
```

### Shortcuts (custom aliases)

```javascript
// uno.config.js
export default defineConfig({
    shortcuts: {
        btn: 'px-4 py-2 rounded cursor-pointer transition-colors',
        'btn-primary': 'btn bg-blue-500 text-white hover:bg-blue-600',
        'btn-danger': 'btn bg-red-500 text-white hover:bg-red-600',
        card: 'bg-white rounded-lg p-6 shadow-md',
    },
});
```

**Usage:**

```html
<button class="btn-primary">My button</button>
<div class="card">My card</div>
```

### Custom Rules

```javascript
export default defineConfig({
    rules: [
        // Custom rule: 'glass' for glassmorphism effect
        [
            'glass',
            {
                background: 'rgba(255, 255, 255, 0.1)',
                'backdrop-filter': 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
            },
        ],
    ],
});
```

---

## ⚡ UnoCSS vs Tailwind Performance

| Aspect              | Tailwind           | UnoCSS        |
| ------------------- | ------------------ | ------------- |
| Prod bundle size    | ~5-15KB            | ~1-3KB        |
| Vite build speed    | Fast               | Ultra-fast    |
| HMR (hot reload)    | Fast               | Instant       |
| Config file         | tailwind.config.js | uno.config.js |
| Tailwind-compatible | —                  | ✅ Yes        |

> **Recommendation**: If you are already using Vite, UnoCSS is an excellent choice to replace Tailwind with better performance.
