---
name: css-to-scss-modernizer
description: Analysis of vanilla CSS and modernization to SCSS. Use this skill when the user wants to simplify, organize, or modernize their CSS stylesheets using SCSS features (variables, nesting, mixins, etc.). Triggered by requests like "convert to SCSS", "modernize my CSS", "simplify my styles", or "organize my CSS".
---

# CSS to SCSS Modernizer

> **Check the project first** (`.claude/PROJECT-CONTEXT.md`): if `stack.sass` is true and `<styles>` already
> holds `.scss` files, there is no repo-wide migration to do — this skill then only converts new plain-CSS
> snippets (third-party library, design handoff) to match the existing SCSS conventions (variables, mixins,
> stylelint config, any PostCSS pipeline documented in the `conventions` files).

## 🎯 When to use this skill

- Explicit conversion requests: "convert this CSS to SCSS", "transform to SCSS"
- Organization requests: "simplify my CSS", "structure my styles", "reduce duplication"
- Codebase modernization: "modernize the styles", "improve CSS architecture"
- Maintainability issues: "my CSS is hard to maintain", "too much repetition"

## 📋 Conversion methodology

### Phase 1: Analysis of existing CSS

Perform a static analysis of the CSS to identify repetitive patterns, magic values, potential nested selectors, and refactoring opportunities. Look for:

- Colors that appear multiple times (e.g. `#3498db` used 15 times)
- Sizes that repeat (e.g. `16px`, `24px` used everywhere)
- Similar style blocks that could be grouped or abstracted

### Phase 2: Progressive conversion

**Recommended conversion order:**

1. **Variables** (high priority)
2. **Nesting** (medium priority)
3. **Mixins** (medium priority)
4. **Functions** (low priority)
5. **Partials & Organization** (low priority)

---

## 🔄 Available SCSS conversions

### 1. SCSS Variables

SCSS variables centralize reusable values in a design token system, ensuring visual consistency and making global changes effortless — update one line, change everything.

**Before (CSS):**

```css
.header {
    background-color: #3498db;
    color: #2c3e50;
    padding: 20px;
}

.button {
    background-color: #3498db;
    padding: 20px;
    border-radius: 8px;
}

.footer {
    background-color: #2c3e50;
    padding: 20px;
}
```

**After (SCSS):**

```scss
// Variables
$primary-color: #3498db;
$dark-color: #2c3e50;
$spacing-md: 20px;
$border-radius-sm: 8px;

.header {
    background-color: $primary-color;
    color: $dark-color;
    padding: $spacing-md;
}

.button {
    background-color: $primary-color;
    padding: $spacing-md;
    border-radius: $border-radius-sm;
}

.footer {
    background-color: $dark-color;
    padding: $spacing-md;
}
```

**Variable categories to create:**

- `$color-*` — colors (primary, secondary, error, success)
- `$spacing-*` — spacings (xs, sm, md, lg, xl)
- `$font-*` — typography (size, family, weight)
- `$border-*` — borders (radius, width, style)
- `$breakpoint-*` — responsive (mobile, tablet, desktop)
- `$z-index-*` — layering (modal, dropdown, tooltip)

---

### 2. Nesting

SCSS nesting allows structuring selectors hierarchically, reflecting the DOM and eliminating parent selector repetitions. Think of it as Russian dolls — children live inside parents.

**Before (CSS):**

```css
.card {
    background: white;
    border-radius: 8px;
    padding: 20px;
}

.card .card-header {
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 16px;
}

.card .card-header .card-title {
    color: #2c3e50;
}

.card .card-body {
    color: #7f8c8d;
    line-height: 1.6;
}

.card .card-body p {
    margin-bottom: 12px;
}

.card:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
```

**After (SCSS):**

```scss
.card {
    background: white;
    border-radius: $border-radius-md;
    padding: $spacing-md;

    &:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .card-header {
        font-size: 24px;
        font-weight: bold;
        margin-bottom: $spacing-sm;

        .card-title {
            color: $dark-color;
        }
    }

    .card-body {
        color: $gray-color;
        line-height: 1.6;

        p {
            margin-bottom: 12px;
        }
    }
}
```

> ⚠️ Do not nest more than 3-4 levels deep — this generates overly specific selectors that are hard to override.

---

### 3. Mixins (Reusable styles)

Mixins encapsulate reusable sets of CSS declarations with optional parameters. They are style "recipes" you can use anywhere and customize by passing different arguments.

**Before (CSS):**

```css
.button-primary {
    display: inline-block;
    padding: 12px 24px;
    border-radius: 8px;
    background-color: #3498db;
    color: white;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
}

.button-primary:hover {
    background-color: #2980b9;
    transform: translateY(-2px);
}

.button-danger {
    display: inline-block;
    padding: 12px 24px;
    border-radius: 8px;
    background-color: #e74c3c;
    color: white;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
}

.button-danger:hover {
    background-color: #c0392b;
    transform: translateY(-2px);
}
```

**After (SCSS):**

```scss
@mixin button($bg-color, $hover-color: darken($bg-color, 10%)) {
    display: inline-block;
    padding: $spacing-sm $spacing-md;
    border-radius: $border-radius-sm;
    background-color: $bg-color;
    color: white;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;

    &:hover {
        background-color: $hover-color;
        transform: translateY(-2px);
    }
}

.button-primary {
    @include button($primary-color);
}

.button-danger {
    @include button($danger-color);
}
```

**Common mixins to create:**

- `flexbox()` — quick flex layout
- `grid()` — configurable grid layout
- `button()` — button styles
- `card()` — content cards
- `transition()` — smooth animations
- `responsive()` — media queries

---

### 4. Functions (Dynamic calculations)

SCSS functions perform calculations and return values, enabling dynamic style generation — darkening a color, computing proportional sizes, managing z-index layers, etc.

```scss
// Function to calculate proportional spacing
@function spacing($multiplier) {
    $base: 8px;
    @return $base * $multiplier;
}

// Usage
.container {
    padding: spacing(2); // 16px
    margin-bottom: spacing(3); // 24px
}

// Function to manage z-index layers
@function z($layer) {
    $layers: (
        'ground': 0,
        'default': 1,
        'dropdown': 100,
        'modal': 200,
        'notification': 300,
    );
    @return map-get($layers, $layer);
}

// Usage
.modal {
    z-index: z('modal');
} // 200
.notification {
    z-index: z('notification');
} // 300
```

---

### 5. Partials & File organization

Modular SCSS via partials splits a large codebase into focused thematic files — like storing clothes in drawers instead of leaving everything in a pile.

**Recommended structure:**

```
styles/
├── main.scss                    # Entry point — imports everything
├── abstracts/
│   ├── _variables.scss          # All variables
│   ├── _mixins.scss             # All mixins
│   └── _functions.scss          # All functions
├── base/
│   ├── _reset.scss              # CSS reset
│   ├── _typography.scss         # Text styles
│   └── _global.scss             # Global styles
├── components/
│   ├── _buttons.scss            # Button styles
│   ├── _cards.scss              # Card styles
│   ├── _forms.scss              # Form styles
│   └── _navbar.scss             # Navigation
├── layout/
│   ├── _header.scss             # Header
│   ├── _footer.scss             # Footer
│   └── _grid.scss               # Grid system
└── pages/
    ├── _home.scss               # Home page
    └── _about.scss              # About page
```

**main.scss:**

```scss
// Abstracts (no CSS output)
@import 'abstracts/variables';
@import 'abstracts/mixins';
@import 'abstracts/functions';

// Base
@import 'base/reset';
@import 'base/typography';
@import 'base/global';

// Layout
@import 'layout/header';
@import 'layout/footer';
@import 'layout/grid';

// Components
@import 'components/buttons';
@import 'components/cards';
@import 'components/forms';
@import 'components/navbar';

// Pages
@import 'pages/home';
@import 'pages/about';
```

---

## 📊 CSS vs SCSS Comparison

| Feature           | CSS               | SCSS                    | SCSS Advantage                       |
| ----------------- | ----------------- | ----------------------- | ------------------------------------ |
| **Variables**     | Limited (`--var`) | Powerful (`$var`)       | Calculations, transformations, scope |
| **Nesting**       | ❌                | ✅                      | Clear visual hierarchy               |
| **Mixins**        | ❌                | ✅                      | Reuse with parameters                |
| **Functions**     | ❌                | ✅                      | Complex dynamic calculations         |
| **Imports**       | Limited           | Modular                 | File organization                    |
| **Operators**     | `calc()` only     | +, -, *, /, %           | Simplified calculations              |
| **Conditions**    | ❌                | ✅ @if, @else           | Conditional logic                    |
| **Loops**         | ❌                | ✅ @for, @each          | Automatic generation                 |
| **Colors**        | Manual            | `lighten()`, `darken()` | Automatic variations                 |
| **Compatibility** | Native browser    | Compilation required    | Requires build step                  |

---

## ✅ Advantages of SCSS

1. **Maintainability** — Centralized variables mean a global color change is a one-line edit
2. **Readability** — Hierarchical nesting mirrors the DOM structure
3. **Reusability** — Mixins and functions eliminate duplicated code
4. **Productivity** — Loops and conditions automate repetitive CSS generation
5. **Organization** — Partials keep files small and focused
6. **Advanced features** — Color manipulation, math calculations, conditional logic

## ⚠️ Disadvantages of SCSS

1. **Compilation required** — Needs a build process (Sass, Webpack, Vite, etc.)
2. **Learning curve** — Mixins, functions, and control directives add new concepts
3. **Over-nesting risk** — Excessive nesting generates overly specific selectors
4. **Compilation time** — Adds a step to the development build process
5. **Debugging** — Requires source maps to trace compiled CSS back to SCSS source
6. **Tooling dependency** — Build ecosystem must be maintained and updated

---

## 🔧 Vite Configuration

Vite natively supports SCSS: install the preprocessor once (`<commands.add> -D sass-embedded`, or `sass`),
then import `.scss` files directly — no plugin needed. Before adding anything, check:

- whether `sass`/`sass-embedded` is already a dependency (`stack.sass`)
- the aliases of `resolve.alias` (an `@styles`/`@scss` alias may already point to `<styles>`)
- the `css` block of `vite.config.*`: a `preprocessorOptions.scss.additionalData` auto-import may or may not
  exist — don't add one if the project imports its partials explicitly
- `postcss.config.*`: a PostCSS pipeline also processes the compiled SCSS (unit conversion, autoprefixer...)

In a Tauri app, nothing changes: Vite compiles the SCSS before Tauri bundles the frontend.

---

## 📝 Recommended conversion workflow

1. **Preparation** — Create the SCSS folder structure, install Sass, create `main.scss`
2. **Variables** — Identify all repeated values, create `_variables.scss`, replace magic values
3. **Organization** — Split CSS into thematic partials, configure imports in `main.scss`
4. **Nesting** — Nest repeated selectors progressively (max 3-4 levels), test compilation
5. **Mixins** — Identify repetitive patterns, create reusable mixins, replace duplicated blocks
6. **Optimization** — Add functions for calculations, add conditions where needed, document

---

## ⚡ SCSS Best Practices

1. **Limit nesting to 3-4 levels maximum**

    ```scss
    // ❌ Too deep
    .header .nav .menu .item .link {
    }

    // ✅ Simplified
    .nav-link {
    }
    ```

2. **Prefix variables by category**

    ```scss
    $color-primary: #3498db;
    $spacing-md: 16px;
    $font-size-lg: 24px;
    ```

3. **One partial = one responsibility**
    - `_buttons.scss` → buttons only
    - `_typography.scss` → typography only

4. **Document complex mixins**

    ```scss
    /// Generates a button with hover/active states
    /// @param {Color} $bg - Background color
    /// @param {Color} $text - Text color
    @mixin button($bg, $text) {
    }
    ```

5. **Use descriptive variable names**

    ```scss
    // ❌
    $blue: #3498db;
    $s: 16px;

    // ✅
    $color-primary-blue: #3498db;
    $spacing-medium: 16px;
    ```

6. **Avoid `!important`** — Restructure selector specificity instead of forcing overrides

7. **Organize properties by category**
    ```scss
    .element {
        // Positioning
        position: relative;
        top: 0;
        left: 0;

        // Box model
        display: flex;
        width: 100%;
        padding: $spacing-md;

        // Visual
        background: $color-white;
        border: 1px solid $color-gray;

        // Typography
        font-size: $font-size-md;
        color: $color-text;
    }
    ```

---

## 🎨 Complete conversion examples

### Example 1: Color system

**Original CSS:**

```css
.btn-primary {
    background: #3498db;
}
.btn-primary:hover {
    background: #2980b9;
}
.link {
    color: #3498db;
}
.badge {
    background: #3498db;
    color: white;
}
```

**Modernized SCSS:**

```scss
// _variables.scss
$color-primary: #3498db;
$color-primary-dark: darken($color-primary, 10%);

// _buttons.scss
.btn-primary {
    background: $color-primary;

    &:hover {
        background: $color-primary-dark;
    }
}

// _components.scss
.link {
    color: $color-primary;
}

.badge {
    background: $color-primary;
    color: white;
}
```

### Example 2: Responsive grid

**Original CSS:**

```css
.grid {
    display: grid;
    gap: 20px;
}
.grid-2 {
    grid-template-columns: repeat(2, 1fr);
}
.grid-3 {
    grid-template-columns: repeat(3, 1fr);
}
.grid-4 {
    grid-template-columns: repeat(4, 1fr);
}

@media (max-width: 768px) {
    .grid-2 {
        grid-template-columns: 1fr;
    }
    .grid-3 {
        grid-template-columns: 1fr;
    }
    .grid-4 {
        grid-template-columns: repeat(2, 1fr);
    }
}
```

**Modernized SCSS:**

```scss
// _variables.scss
$breakpoint-mobile: 768px;
$spacing-md: 20px;

// _mixins.scss
@mixin grid($columns, $mobile-columns: 1) {
    display: grid;
    grid-template-columns: repeat($columns, 1fr);
    gap: $spacing-md;

    @media (max-width: $breakpoint-mobile) {
        grid-template-columns: repeat($mobile-columns, 1fr);
    }
}

// _layout.scss
.grid-2 {
    @include grid(2, 1);
}
.grid-3 {
    @include grid(3, 1);
}
.grid-4 {
    @include grid(4, 2);
}
```

---

## 🚀 Conversion checklist

- [ ] Variables created for colors, spacings, typography
- [ ] Nesting applied (max 3-4 levels)
- [ ] Mixins created for repetitive patterns
- [ ] File structure organized (partials)
- [ ] Imports configured in main.scss
- [ ] Sass installed and configured in Vite
- [ ] Compilation tested without errors
- [ ] Visual rendering identical to the original
- [ ] Code documented and commented
- [ ] Best practices followed

> **Important:** Always test SCSS compilation after each major change and verify that the visual output remains identical to the original.
