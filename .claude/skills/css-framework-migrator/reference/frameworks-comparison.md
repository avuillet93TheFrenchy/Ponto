# CSS Frameworks Comparison

## 🏆 General Comparison Table

| Criteria                | Tailwind CSS         | Bootstrap 5   | Bulma       | UnoCSS         | Material UI          |
| ----------------------- | -------------------- | ------------- | ----------- | -------------- | -------------------- |
| **Approach**            | Utility-first        | Components    | Components  | Utility-first  | Components           |
| **Bundle size**         | ~10KB (purged)       | ~22KB (min)   | ~186KB      | ~1KB (runtime) | Variable             |
| **Learning curve**      | Medium               | Low           | Low         | Medium         | High                 |
| **Design flexibility**  | ⭐⭐⭐⭐⭐           | ⭐⭐⭐        | ⭐⭐⭐      | ⭐⭐⭐⭐⭐     | ⭐⭐                 |
| **Included components** | ❌ (via Headless UI) | ✅ Complete   | ✅ Basic    | ❌             | ✅ Complete          |
| **Includes JavaScript** | ❌                   | ✅ (optional) | ❌          | ❌             | ✅                   |
| **React compatibility** | ⭐⭐⭐⭐⭐           | ⭐⭐⭐        | ⭐⭐⭐      | ⭐⭐⭐⭐⭐     | ⭐⭐⭐⭐⭐           |
| **Vue compatibility**   | ⭐⭐⭐⭐⭐           | ⭐⭐⭐        | ⭐⭐⭐⭐    | ⭐⭐⭐⭐⭐     | ⭐⭐                 |
| **Popularity (2025)**   | 🥇 #1                | 🥈 #2         | 🥉 #5       | #4             | #3                   |
| **Dark mode**           | ✅ Native            | ✅            | ✅          | ✅             | ✅                   |
| **Custom themes**       | ✅ Easy              | ✅ Via SCSS   | ✅ Via SCSS | ✅ Easy        | ✅ Via ThemeProvider |

---

## 📊 When to Choose Which Framework?

### ✅ Choose **Tailwind CSS** if:

- You want a unique, fully custom design
- You work with React, Vue, or any modern JS framework
- You are comfortable with many utility classes in HTML
- You want pixel-level control

> **Simple analogy:** Tailwind is like a toolbox where each tool does one thing. You combine tools to build exactly what you want.

### ✅ Choose **Bootstrap 5** if:

- You want to move fast with ready-made components
- You are building plain HTML or a "classic" project (no JS framework)
- You are a beginner who wants quick results
- You already know Bootstrap

> **Simple analogy:** Bootstrap is like an IKEA furniture kit. You pick from a catalogue and assemble. It's fast, but everyone ends up with the same furniture.

### ✅ Choose **Bulma** if:

- You want something lightweight with no JavaScript
- You appreciate a simple, readable class syntax
- You are building a medium-sized project without heavy interactivity

> **Simple analogy:** Bulma is like Bootstrap but lighter and easier to read. Perfect for straightforward projects.

### ✅ Choose **UnoCSS** if:

- Your project uses Vite
- Build performance is a priority
- You like the Tailwind approach but want even more flexibility

> **Simple analogy:** UnoCSS is Tailwind on steroids for modern Vite projects. Ultra-fast.

### ✅ Choose **Material UI (MUI)** if:

- You are using React
- You want the "Google Material Design" look
- You need a very complete component library

> **Simple analogy:** MUI is like Bootstrap for React, with Google's design language.

---

## ⚖️ Detailed Pros & Cons

### Tailwind CSS

**✅ Pros**

- Fully custom design
- Excellent dark mode support
- Built-in PurgeCSS → very small production bundle
- Very popular → large community, many resources
- Works everywhere (HTML, React, Vue, Svelte...)

**❌ Cons**

- HTML can become cluttered with many classes: `<div class="flex items-center justify-between px-4 py-2 bg-blue-500 rounded-lg text-white hover:bg-blue-600...">`
- No ready-made components (you build everything from scratch)
- Requires initial configuration
- Learning curve to memorize class names

---

### Bootstrap 5

**✅ Pros**

- Complete components out of the box (navbar, modal, carousel...)
- Very easy to learn
- Excellent documentation with examples
- Works with plain HTML (no JS framework needed)
- Powerful and well-known grid system

**❌ Cons**

- Heavier bundle (~22KB min CSS + optional JS)
- Recognizable design → "looks like Bootstrap"
- More complex customization (requires SCSS)
- Less suited for modern React/Vue projects

---

### Bulma

**✅ Pros**

- No JavaScript included → lighter and more flexible
- Very readable syntax: `<button class="button is-primary is-large">`
- Easy to learn
- Good documentation

**❌ Cons**

- Less popular → fewer online resources
- Less complete components than Bootstrap
- Customization via SCSS only
- No official utility-first support

---

### UnoCSS

**✅ Pros**

- Extremely fast builds (designed for Vite)
- Compatible with Tailwind, Windi CSS, and more syntaxes
- Near-zero bundle (generates only what is used)
- Highly configurable

**❌ Cons**

- Less well-known → fewer beginner tutorials
- More advanced configuration
- Not recommended for plain HTML (optimized for JS frameworks)
