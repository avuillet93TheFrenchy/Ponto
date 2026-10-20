# Bootstrap 5 — Migration Guide

## ⚙️ Installation

### Via the package manager

```bash
<commands.add> bootstrap      # bun add / npm install / pnpm add / yarn add
```

**In your main JS file:**

```javascript
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // optional (for modals, dropdowns, etc.)
```

### Via CDN (plain HTML)

```html
<link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
/>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
```

---

## 🔄 CSS → Bootstrap Class Mappings

### Layout & Grid (12-column system)

| Vanilla CSS                       | Bootstrap                        |
| --------------------------------- | -------------------------------- |
| `display: flex`                   | `d-flex`                         |
| `flex-direction: column`          | `flex-column`                    |
| `justify-content: center`         | `justify-content-center`         |
| `align-items: center`             | `align-items-center`             |
| `display: grid`                   | Use `.row` + `.col-*` system     |
| `max-width: 1200px; margin: auto` | `container` or `container-fluid` |

**Bootstrap Grid (12 columns):**

```html
<!-- 3 equal columns -->
<div class="row">
    <div class="col-4">Column 1</div>
    <div class="col-4">Column 2</div>
    <div class="col-4">Column 3</div>
</div>

<!-- Responsive: full width on mobile, 2 columns on tablet -->
<div class="row">
    <div class="col-12 col-md-6">Left</div>
    <div class="col-12 col-md-6">Right</div>
</div>
```

### Spacing (base: 1 = 4px, max: 5 = 48px)

| Vanilla CSS           | Bootstrap   |
| --------------------- | ----------- |
| `padding: 8px`        | `p-2`       |
| `padding: 16px`       | `p-3`       |
| `padding: 24px`       | `p-4`       |
| `padding: 8px 16px`   | `py-2 px-3` |
| `margin-bottom: 16px` | `mb-3`      |
| `margin: 0 auto`      | `mx-auto`   |

### Typography

| Vanilla CSS          | Bootstrap         |
| -------------------- | ----------------- |
| `font-size: 14px`    | `fs-6` or `small` |
| `font-size: 20px`    | `fs-5`            |
| `font-weight: bold`  | `fw-bold`         |
| `font-weight: 600`   | `fw-semibold`     |
| `text-align: center` | `text-center`     |
| `color: gray`        | `text-secondary`  |
| `color: blue`        | `text-primary`    |

### Colors & Backgrounds

| Color          | Background     | Text             | Border             |
| -------------- | -------------- | ---------------- | ------------------ |
| Primary blue   | `bg-primary`   | `text-primary`   | `border-primary`   |
| Success green  | `bg-success`   | `text-success`   | `border-success`   |
| Danger red     | `bg-danger`    | `text-danger`    | `border-danger`    |
| Warning yellow | `bg-warning`   | `text-warning`   | `border-warning`   |
| Secondary gray | `bg-secondary` | `text-secondary` | `border-secondary` |
| White          | `bg-white`     | `text-white`     | `border-white`     |
| Black          | `bg-dark`      | `text-dark`      | `border-dark`      |

### Responsive (mobile-first)

| Breakpoint   | Prefix      |
| ------------ | ----------- |
| All          | (no prefix) |
| ≥576px (sm)  | `sm:`       |
| ≥768px (md)  | `md:`       |
| ≥992px (lg)  | `lg:`       |
| ≥1200px (xl) | `xl:`       |

---

## 🧩 Ready-to-use Bootstrap Components

### Buttons

```html
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-danger">Danger</button>
<button class="btn btn-outline-primary">Outline</button>
<button class="btn btn-primary btn-lg">Large button</button>
<button class="btn btn-primary btn-sm">Small button</button>
```

**CSS → Bootstrap migration:**

```css
/* Vanilla CSS */
.btn {
    padding: 10px 20px;
    background: #0d6efd;
    color: white;
    border-radius: 6px;
    border: none;
    cursor: pointer;
}
.btn:hover {
    background: #0b5ed7;
}
```

```html
<!-- Bootstrap -->
<button class="btn btn-primary">My button</button>
```

---

### Card

```html
<div class="card" style="width: 18rem;">
    <img src="..." class="card-img-top" alt="..." />
    <div class="card-body">
        <h5 class="card-title">Card title</h5>
        <p class="card-text">Description here.</p>
        <a href="#" class="btn btn-primary">Action</a>
    </div>
</div>
```

---

### Navigation (Navbar)

```html
<nav class="navbar navbar-expand-lg bg-dark navbar-dark">
    <div class="container-fluid">
        <a class="navbar-brand" href="#">Logo</a>
        <button
            class="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navMenu"
        >
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navMenu">
            <ul class="navbar-nav ms-auto">
                <li class="nav-item">
                    <a class="nav-link active" href="#">Home</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" href="#">Contact</a>
                </li>
            </ul>
        </div>
    </div>
</nav>
```

---

### Form

```html
<form>
    <div class="mb-3">
        <label for="email" class="form-label">Email address</label>
        <input
            type="email"
            class="form-control"
            id="email"
            placeholder="example@email.com"
        />
    </div>
    <div class="mb-3">
        <label for="password" class="form-label">Password</label>
        <input type="password" class="form-control" id="password" />
    </div>
    <button type="submit" class="btn btn-primary w-100">Sign in</button>
</form>
```

---

### Alert

```html
<div class="alert alert-success alert-dismissible fade show" role="alert">
    ✅ Operation successful!
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
</div>

<div class="alert alert-danger">❌ An error occurred.</div>
```

---

### Modal (popup)

```html
<!-- Trigger button -->
<button
    class="btn btn-primary"
    data-bs-toggle="modal"
    data-bs-target="#myModal"
>
    Open popup
</button>

<!-- Modal -->
<div class="modal fade" id="myModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Title</h5>
                <button
                    type="button"
                    class="btn-close"
                    data-bs-dismiss="modal"
                ></button>
            </div>
            <div class="modal-body">Popup content.</div>
            <div class="modal-footer">
                <button
                    type="button"
                    class="btn btn-secondary"
                    data-bs-dismiss="modal"
                >
                    Close
                </button>
                <button type="button" class="btn btn-primary">Confirm</button>
            </div>
        </div>
    </div>
</div>
```

---

## 🎨 Bootstrap Customization (via SCSS)

```scss
// Override variables BEFORE importing Bootstrap
$primary: #7c3aed; // Change primary color
$border-radius: 12px; // Modify border radius
$font-family-base: 'Inter', sans-serif;

// Import Bootstrap AFTER variables
@import 'bootstrap/scss/bootstrap';
```

---

## 💡 Bootstrap Utilities

```html
<!-- Responsive visibility -->
<div class="d-none d-md-block">Visible on tablet and above only</div>

<!-- Shadow -->
<div class="shadow-sm">Light shadow</div>
<div class="shadow">Normal shadow</div>
<div class="shadow-lg">Heavy shadow</div>

<!-- Overflow -->
<div class="overflow-hidden">...</div>

<!-- Position -->
<div class="position-relative">
    <span class="position-absolute top-0 end-0 badge bg-danger">3</span>
</div>
```
