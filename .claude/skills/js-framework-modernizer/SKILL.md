---
name: js-framework-modernizer
description: Analysis of vanilla JavaScript and framework modernization suggestions (React, Vue, Svelte, etc.). Provides professional AND simplified explanations, comparison tables, and pros/cons summaries.
---

# JavaScript Framework Modernizer

## Mission

Analyze vanilla JavaScript code and identify modernization opportunities with modern frameworks, providing:

1. **Dual explanations**: professional version + simplified version for beginners
2. **Comparison tables** when multiple frameworks are possible
3. **Pros/cons summaries** for each suggestion

---

## Analysis methodology

### Step 1: Reading and understanding the code

- Read the provided JavaScript file
- Identify the overall structure (DOM manipulation, events, state management, etc.)
- Spot repetitive or verbose patterns

### Step 2: Detecting modernization opportunities

#### Categories to analyze:

**1. DOM Manipulation**

- Detection: `document.getElementById()`, `querySelector()`, `createElement()`, `innerHTML`
- Suggested frameworks: React, Vue, Svelte, Lit

**2. Event handling**

- Detection: `addEventListener()`, `onclick`, manual event delegation
- Suggested frameworks: React, Vue, Svelte

**3. State management**

- Detection: Global variables, manual `localStorage`, observer patterns
- Suggested frameworks: React (useState/useReducer), Vue (ref/reactive), Svelte (stores), Zustand, Redux

**4. HTTP/API requests**

- Detection: `XMLHttpRequest`, repetitive `fetch()`
- Suggested tools: Axios, TanStack Query, SWR

**5. Routing**

- Detection: `window.location`, manual hash routing, `history.pushState()`
- Suggested frameworks: React Router, Vue Router, SvelteKit

**6. Forms**

- Detection: Manual validation, `onsubmit`, value retrieval
- Suggested libraries: React Hook Form, Formik, Vee-Validate

**7. Animations**

- Detection: `setInterval`, `setTimeout`, manual CSS transitions
- Suggested libraries: Framer Motion, GSAP, Vue Transition

### Step 3: Report generation

For each detected opportunity, generate:

#### Standard output format

```markdown
## 🎯 [Feature name]

### 📊 Current code (vanilla JavaScript)

[Original code excerpt]

### 🔍 Analysis

**Professional version:**
[Detailed technical explanation]

**Simple version (beginner):**
[Explanation using simple words and analogies]

### 🛠️ Possible solutions

[If multiple frameworks/libraries are possible: comparison table]
[If one obvious solution: direct explanation]

### ✅ Advantages

- [List of benefits]

### ❌ Disadvantages

- [List of limitations/costs]

### 💡 Recommendation

[Final suggestion based on context]

### 📝 Modernized code (example)

[Code with the recommended framework]
```

---

## Presentation rules

### 1. Dual explanation (ALWAYS)

**Professional version** (use technical terms):

> "This code uses an imperative approach with direct DOM manipulation via `document.querySelector()`. Re-rendering is handled manually, which increases the risk of bugs and makes the code hard to maintain at scale."

**Simple version** (explain like to a beginner):

> "Basically, you're telling the computer exactly what to do, step by step. It's like giving very precise instructions: 'take this element, change its text, then change its color'. It works, but it's a lot of work and if you make a mistake, it's hard to find."

### 2. Comparison tables (when 2+ options exist)

Always include these columns:

- Framework/Library
- Learning difficulty
- Performance
- Bundle size
- Ecosystem
- Ideal use case

Example:

```markdown
| Framework | Difficulty | Performance | Bundle size | Ecosystem | Best for                |
| --------- | ---------- | ----------- | ----------- | --------- | ----------------------- |
| React     | Medium     | Good        | ~45KB       | ★★★★★     | Complex applications    |
| Vue       | Easy       | Very good   | ~35KB       | ★★★★☆     | Mix of simplicity/power |
| Svelte    | Easy       | Excellent   | ~10KB       | ★★★☆☆     | Performance-critical    |
```

### 3. Pros/cons summaries (ALWAYS)

Standard format:

```markdown
### ✅ Advantages

- **[Category]**: Professional explanation
    - 🔰 _Simple_: Beginner explanation

### ❌ Disadvantages

- **[Category]**: Professional explanation
    - 🔰 _Simple_: Beginner explanation
```

---

## Detection examples

### Example 1: DOM Manipulation

**Detected code:**

```javascript
document.getElementById('counter').innerHTML = count;
document.querySelector('.btn').addEventListener('click', increment);
```

**Trigger:** DOM manipulation + Event listener
**Suggested frameworks:** React, Vue, Svelte
**Action:** Generate comparison table + code examples

### Example 2: Complex state management

**Detected code:**

```javascript
let users = [];
let filteredUsers = [];
function updateUsers(newUsers) {
    users = newUsers;
    filteredUsers = users.filter((u) => u.active);
    renderUserList();
}
```

**Trigger:** Global state + filtering logic + manual re-render
**Suggested solutions:** Redux, Zustand, MobX, Jotai
**Action:** State manager comparison table

### Example 3: Repetitive fetch

**Detected code:**

```javascript
fetch('/api/users')
    .then((res) => res.json())
    .then((data) => setUsers(data))
    .catch((err) => console.error(err));
```

**Trigger:** Basic fetch without cache/retry/loading states
**Suggested solutions:** TanStack Query, SWR, Axios
**Action:** Comparison + example with error/loading handling

---

## Recommendation strategy

### Factors to consider:

1. **Project complexity**
    - Simple → Prefer optimized Vanilla JS or Alpine.js
    - Medium → Vue or Svelte
    - Complex → React or Vue

2. **Team**
    - Beginners → Vue or Svelte
    - Experienced → React or framework appropriate to the need

3. **Performance-critical**
    - Yes → Svelte, Solid.js, or Vanilla optimizations
    - No → React or Vue

4. **Ecosystem/Integrations**
    - Important → React (largest ecosystem)
    - Less important → Full flexibility

### Decision matrix

```markdown
| Criterion      | React Score | Vue Score | Svelte Score |
| -------------- | ----------- | --------- | ------------ |
| Ecosystem      | 10/10       | 8/10      | 6/10         |
| Learning curve | 6/10        | 9/10      | 9/10         |
| Performance    | 7/10        | 8/10      | 10/10        |
| Bundle size    | 5/10        | 7/10      | 10/10        |
| Jobs/Career    | 10/10       | 7/10      | 5/10         |
```

---

## Final report format

The report must include:

### 1. Executive summary

- Number of possible modernizations
- Estimated impact (low/medium/high)
- Recommended frameworks (top 3)

### 2. Detailed analysis by section

- Each opportunity with standard format
- Before/after code
- Dual explanations (professional + simple)

### 3. Migration plan (if relevant)

- Priority order of changes
- Effort estimation (hours/days)
- Identified risks

### 4. Learning resources

- Official documentation
- Recommended tutorials
- Communities

---

## Patterns to detect

### Pattern: Dynamic list

```javascript
// BEFORE (Vanilla JS)
function renderList(items) {
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    items.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item.name;
        ul.appendChild(li);
    });
}
```

**Suggested modernization:** React/Vue/Svelte (comparison table required)

### Pattern: Toggle state

```javascript
// BEFORE (Vanilla JS)
let isOpen = false;
btn.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.style.display = isOpen ? 'block' : 'none';
});
```

**Suggested modernization:** React useState, Vue ref, Svelte stores

### Pattern: Form validation

```javascript
// BEFORE (Vanilla JS)
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.querySelector('[name="email"]').value;
    if (!email.includes('@')) {
        showError('Invalid email');
        return;
    }
    // ...
});
```

**Suggested modernization:** React Hook Form, Formik, Vee-Validate

---

## Special instructions

### When NOT to suggest a framework:

1. **Very simple project** (< 100 lines, a single interaction)
    - Suggest instead: Optimized Vanilla JS refactoring

2. **Ultra-critical performance** (games, 60fps animations)
    - Suggest instead: WebGL, Canvas API, WASM

3. **Size constraints** (< 10KB total)
    - Suggest instead: Alpine.js, Petite-Vue, Preact

4. **Legacy environment** (IE11, old browsers)
    - Suggest instead: Polyfills, Babel, progressive approach

### Tone and style

- **Benevolent**: Never criticize existing code
- **Educational**: Always explain the "why"
- **Pragmatic**: Recommendations based on real context
- **Balanced**: Honestly present advantages AND disadvantages

---

## Quality checklist

Before delivering the report, verify:

- [ ] Each section has a PRO + SIMPLE explanation
- [ ] Comparison tables present when 2+ options exist
- [ ] Pros/cons for each suggestion
- [ ] Before/after code readable and functional
- [ ] Recommendations justified by context
- [ ] No unexplained jargon in the simple version
- [ ] Code examples testable and correct
- [ ] Migration plan if relevant
- [ ] Learning resources included

---

## Expected output examples

### Minimal complete example:

```markdown
# 📊 Modernization analysis: todo-list.js

## 🎯 Summary

- 3 modernization opportunities detected
- Estimated impact: **Medium-High**
- Recommended framework: **React** (or Vue for beginners)

---

## 1. 🎯 DOM manipulation for list display

### 📊 Current code

function displayTodos(todos) {
const container = document.getElementById('todos');
container.innerHTML = '';
todos.forEach(todo => {
const div = document.createElement('div');
div.innerHTML = `<span>${todo.text}</span>`;
container.appendChild(div);
});
}

### 🔍 Analysis

**Professional version:**
This code uses an imperative approach with direct DOM manipulation. Each call to displayTodos() completely rebuilds the DOM via innerHTML = '' then appendChild(). This strategy benefits from no optimization like the Virtual DOM and can cause performance issues with large lists.

**Simple version (beginner):**
Imagine you have a whiteboard. Every time you want to change something, you erase EVERYTHING on the board and rewrite EVERYTHING from scratch. It's slow and tiring! Modern frameworks are smarter: they compare what has changed and only redraw the differences.

### 🛠️ Possible solutions

| Framework  | Difficulty | Performance | Bundle | Ecosystem | Best for                   |
| ---------- | ---------- | ----------- | ------ | --------- | -------------------------- |
| **React**  | Medium     | Good        | ~45KB  | ★★★★★     | Complex apps, teams        |
| **Vue**    | Easy       | Very good   | ~35KB  | ★★★★☆     | Beginners, medium projects |
| **Svelte** | Easy       | Excellent   | ~10KB  | ★★★☆☆     | Performance, small bundles |

### ✅ Advantages (modernization)

- **Performance**: The Virtual DOM (React/Vue) or compilation (Svelte) optimizes updates
    - 🔰 _Simple_: Only the elements that truly change are modified, not the whole whiteboard!

- **Maintainability**: More readable declarative code
    - 🔰 _Simple_: You describe WHAT you want to display, not HOW to do it step by step

- **Reactivity**: Automatic updates when data changes
    - 🔰 _Simple_: Change a piece of data, and boom! The display updates itself

### ❌ Disadvantages

- **Learning curve**: Requires learning a new framework
    - 🔰 _Simple_: You need to learn new ways of doing things, it takes time

- **Size**: Adds kilobytes to the bundle
    - 🔰 _Simple_: Your site will be a bit heavier to download

- **Migration**: Requires rewriting part of the code
    - 🔰 _Simple_: You'll need to transform your existing code, it's work

### 💡 Recommendation

For this use case: **React** if working in a team or planning a complex application, **Vue** if you're a beginner, **Svelte** if bundle size is critical.

### 📝 Modernized code (React)

function TodoList({ todos }) {
return (
<div id="todos">
{todos.map(todo => (
<div key={todo.id}>
<span>{todo.text}</span>
</div>
))}
</div>
);
}

**Simple explanation:** Instead of saying "erase everything, create a div, add text, repeat", you just say "here are my todos, display them like this". The framework handles the rest!

[... similar sections ...]
```

---

## Scope and referrals

This skill covers **migration to JavaScript frameworks** (React, Vue, Svelte...).

- To modernize **CSS** to SCSS → use the skill `css-to-scss-modernizer`
- For quality review after migration → use the agent `code-reviewer`

## Conclusion

This skill transforms JavaScript code analysis into a pedagogical and actionable process, suitable for beginners as well as experienced developers.
