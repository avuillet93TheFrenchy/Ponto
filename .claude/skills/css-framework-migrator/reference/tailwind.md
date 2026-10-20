# Tailwind CSS — Migration Guide

## ⚙️ Installation

### With Vite (recommended for Vite projects)

```bash
<commands.add> -D tailwindcss @tailwindcss/vite
```

**vite.config.ts:**

```javascript
import tailwindcss from '@tailwindcss/vite';

export default {
    plugins: [tailwindcss()],
};
```

**main.css:**

```css
@import 'tailwindcss';
```

### With CDN (rapid prototyping only)

```html
<script src="https://cdn.tailwindcss.com"></script>
```

---

## 🔄 CSS → Tailwind Class Mappings

### Layout & Flexbox

| Vanilla CSS                             | Tailwind          |
| --------------------------------------- | ----------------- |
| `display: flex`                         | `flex`            |
| `flex-direction: column`                | `flex-col`        |
| `justify-content: center`               | `justify-center`  |
| `justify-content: space-between`        | `justify-between` |
| `align-items: center`                   | `items-center`    |
| `flex-wrap: wrap`                       | `flex-wrap`       |
| `gap: 16px`                             | `gap-4`           |
| `display: grid`                         | `grid`            |
| `grid-template-columns: repeat(3, 1fr)` | `grid-cols-3`     |

### Spacing (base: 1 unit = 4px)

| Vanilla CSS           | Tailwind    |
| --------------------- | ----------- |
| `padding: 16px`       | `p-4`       |
| `padding: 8px 16px`   | `py-2 px-4` |
| `margin: 0 auto`      | `mx-auto`   |
| `margin-bottom: 24px` | `mb-6`      |
| `gap: 20px`           | `gap-5`     |

### Typography

| Vanilla CSS          | Tailwind         |
| -------------------- | ---------------- |
| `font-size: 14px`    | `text-sm`        |
| `font-size: 16px`    | `text-base`      |
| `font-size: 18px`    | `text-lg`        |
| `font-size: 24px`    | `text-2xl`       |
| `font-weight: bold`  | `font-bold`      |
| `font-weight: 600`   | `font-semibold`  |
| `text-align: center` | `text-center`    |
| `color: #6b7280`     | `text-gray-500`  |
| `line-height: 1.5`   | `leading-normal` |

### Colors & Backgrounds

| Vanilla CSS                 | Tailwind          |
| --------------------------- | ----------------- |
| `background-color: #3b82f6` | `bg-blue-500`     |
| `background-color: white`   | `bg-white`        |
| `color: #1f2937`            | `text-gray-800`   |
| `border-color: #e5e7eb`     | `border-gray-200` |

### Borders & Radius

| Vanilla CSS                 | Tailwind                 |
| --------------------------- | ------------------------ |
| `border: 1px solid #e5e7eb` | `border border-gray-200` |
| `border-radius: 4px`        | `rounded`                |
| `border-radius: 8px`        | `rounded-lg`             |
| `border-radius: 9999px`     | `rounded-full`           |

### Dimensions

| Vanilla CSS         | Tailwind    |
| ------------------- | ----------- |
| `width: 100%`       | `w-full`    |
| `max-width: 1200px` | `max-w-6xl` |
| `height: 100vh`     | `h-screen`  |
| `width: 64px`       | `w-16`      |

### Responsive (mobile-first)

| CSS Media Query              | Tailwind |
| ---------------------------- | -------- |
| `@media (min-width: 640px)`  | `sm:`    |
| `@media (min-width: 768px)`  | `md:`    |
| `@media (min-width: 1024px)` | `lg:`    |
| `@media (min-width: 1280px)` | `xl:`    |

**Example:**

```html
<!-- CSS: column on mobile, row on desktop -->
<div class="flex flex-col md:flex-row gap-4"></div>
```

### Interactive States

| CSS Pseudo-class               | Tailwind               |
| ------------------------------ | ---------------------- |
| `:hover { background: ... }`   | `hover:bg-blue-600`    |
| `:focus { outline: ... }`      | `focus:outline-none`   |
| `:active { ... }`              | `active:scale-95`      |
| `::placeholder { color: ... }` | `placeholder-gray-400` |

---

## 🔁 Full Conversion Examples

### Button

**Vanilla CSS:**

```css
.btn {
    display: inline-block;
    padding: 10px 20px;
    background-color: #3b82f6;
    color: white;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
}
.btn:hover {
    background-color: #2563eb;
}
```

**Tailwind:**

```html
<button
    class="inline-block px-5 py-2.5 bg-blue-500 text-white rounded-md font-semibold cursor-pointer transition-colors hover:bg-blue-600"
>
    Click here
</button>
```

---

### Card

**Vanilla CSS:**

```css
.card {
    background: white;
    border-radius: 8px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.card-title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 8px;
}
.card-text {
    color: #6b7280;
}
```

**Tailwind:**

```html
<div class="bg-white rounded-lg p-6 shadow-md">
    <h2 class="text-xl font-bold mb-2">Title</h2>
    <p class="text-gray-500">Content</p>
</div>
```

---

### Responsive Navigation

**Vanilla CSS:**

```css
.nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 32px;
    background: #1f2937;
}
.nav-links {
    display: flex;
    gap: 24px;
    list-style: none;
}
.nav-link {
    color: white;
    text-decoration: none;
}
.nav-link:hover {
    color: #93c5fd;
}
@media (max-width: 768px) {
    .nav-links {
        display: none;
    }
}
```

**Tailwind:**

```html
<nav class="flex justify-between items-center px-8 py-4 bg-gray-800">
    <span class="text-white font-bold">Logo</span>
    <ul class="hidden md:flex gap-6 list-none">
        <li><a href="#" class="text-white hover:text-blue-300">Home</a></li>
        <li><a href="#" class="text-white hover:text-blue-300">About</a></li>
    </ul>
</nav>
```

---

## 🎨 Dark Mode with Tailwind

**Configuration (tailwind.config.js):**

```javascript
module.exports = {
    darkMode: 'class', // or 'media' to follow system preferences
};
```

**Usage:**

```html
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
    Adaptive content
</div>
```

---

## 💡 Tailwind Tips

### Reuse combinations with @apply

If you use the same classes repeatedly, extract them into a CSS class:

```css
/* In your CSS file */
.btn-primary {
    @apply px-5 py-2.5 bg-blue-500 text-white rounded-md font-semibold hover:bg-blue-600 transition-colors;
}
```

> `@apply` lets you "bundle" Tailwind classes under a custom name. Very useful for reused buttons or components.

### Arbitrary values

For values not included in Tailwind by default:

```html
<!-- Arbitrary value in brackets -->
<div class="w-[350px] text-[15px] bg-[#1a2b3c]"></div>
```
