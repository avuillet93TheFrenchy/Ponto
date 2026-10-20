# Bulma — Migration Guide

## ⚙️ Installation

### Via the package manager

```bash
<commands.add> bulma      # bun add / npm install / pnpm add / yarn add
```

**Import:**

```javascript
import 'bulma/css/bulma.min.css';
```

### Via CDN

```html
<link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/bulma@1.0.0/css/bulma.min.css"
/>
```

> ✅ Bulma includes **no JavaScript**. If you need interactivity (dropdown, burger menu), you will need to add your own JS.

---

## 🔄 CSS → Bulma Class Mappings

### Layout & Columns

| Vanilla CSS                       | Bulma                 |
| --------------------------------- | --------------------- |
| `max-width: 1200px; margin: auto` | `container`           |
| Flex row with columns             | `columns` > `column`  |
| `flex: 1` (equal column)          | `column`              |
| 1/3 column                        | `column is-one-third` |
| 50% column                        | `column is-half`      |

**Grid example:**

```html
<div class="columns">
    <div class="column">One third</div>
    <div class="column">One third</div>
    <div class="column">One third</div>
</div>
```

### Spacing

Bulma uses helpers with the syntax `m{direction}-{size}` and `p{direction}-{size}` (size from 0 to 6).

| Vanilla CSS           | Bulma     |
| --------------------- | --------- |
| `margin-bottom: 16px` | `mb-4`    |
| `padding: 24px`       | `p-5`     |
| `margin: 0 auto`      | `mx-auto` |

### Colors

| Color          | Classes      |
| -------------- | ------------ |
| Primary blue   | `is-primary` |
| Info blue      | `is-info`    |
| Success green  | `is-success` |
| Warning yellow | `is-warning` |
| Danger red     | `is-danger`  |
| Light          | `is-light`   |
| Dark           | `is-dark`    |

---

## 🧩 Bulma Components

### Buttons

```html
<button class="button is-primary">Primary</button>
<button class="button is-danger is-outlined">Danger outlined</button>
<button class="button is-success is-large">Large button</button>
<button class="button is-warning is-small">Small</button>
<button class="button is-loading">Loading...</button>
```

### Card

```html
<div class="card">
    <div class="card-image">
        <figure class="image is-4by3">
            <img src="..." alt="Image" />
        </figure>
    </div>
    <div class="card-content">
        <p class="title">Title</p>
        <p class="subtitle">Subtitle</p>
        <div class="content">Description here.</div>
    </div>
    <footer class="card-footer">
        <a href="#" class="card-footer-item">Action 1</a>
        <a href="#" class="card-footer-item">Action 2</a>
    </footer>
</div>
```

### Navigation (Navbar)

```html
<nav class="navbar is-dark" role="navigation">
    <div class="navbar-brand">
        <a class="navbar-item" href="/">Logo</a>
        <a role="button" class="navbar-burger" aria-label="menu">
            <span></span><span></span><span></span>
        </a>
    </div>
    <div class="navbar-menu">
        <div class="navbar-end">
            <a class="navbar-item">Home</a>
            <a class="navbar-item">Contact</a>
        </div>
    </div>
</nav>
```

### Form

```html
<div class="field">
    <label class="label">Email</label>
    <div class="control has-icons-left">
        <input class="input" type="email" placeholder="your@email.com" />
    </div>
</div>

<div class="field">
    <label class="label">Message</label>
    <div class="control">
        <textarea class="textarea" placeholder="Your message..."></textarea>
    </div>
</div>

<button class="button is-primary is-fullwidth">Send</button>
```

### Message / Alert

```html
<article class="message is-success">
    <div class="message-header">
        <p>Success</p>
        <button class="delete" aria-label="delete"></button>
    </div>
    <div class="message-body">Operation successful!</div>
</article>
```

---

## 🎨 Customization (SCSS)

```scss
// Override Bulma variables
$primary: #7c3aed;
$family-sans-serif: 'Inter', sans-serif;
$radius: 12px;

// Import Bulma
@import 'bulma/bulma';
```
