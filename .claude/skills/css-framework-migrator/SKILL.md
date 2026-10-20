---
name: css-framework-migrator
description: Migration from vanilla CSS to a modern CSS framework (Tailwind CSS, Bootstrap, Bulma, UnoCSS, etc.). Use this skill when the user wants to replace their hand-coded CSS with utility classes or components from a framework. Triggered by requests such as "convert to Tailwind," "use Bootstrap," "migrate to a CSS framework," "replace my vanilla CSS," "modernize my interface with a framework," "add Tailwind to my project," or any need to switch from custom CSS to a recognized framework. Also use this if the user mentions wanting to work faster on their styles or avoid writing CSS manually.
---

# CSS Vanilla → CSS Framework Migrator

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`): `<commands.add>` installs packages,
`stack.vite`/`stack.frameworks`/`stack.tailwind` tell what is already there, `<styles>` where the stylesheets live.

## When to use this skill

- Explicit migration: "convert my CSS to Tailwind/Bootstrap/Bulma/UnoCSS/etc."
- Project modernization: "integrate a CSS framework into my project"
- UI refactor: "replace my custom CSS classes with framework components"
- Team standardization: "standardize styles with a popular framework"

---

## Phase 1: Choose the right framework

Before migrating, help the user choose a framework. See `references/frameworks-comparison.md` for the detailed comparison table.

### Quick selection guide

| Primary need                         | Recommended framework |
| ------------------------------------ | --------------------- |
| Full design control, utility-first   | **Tailwind CSS**      |
| Ready-made components, fast setup    | **Bootstrap 5**       |
| Lightweight + simple syntax          | **Bulma**             |
| Maximum performance (Vite/Vue/React) | **UnoCSS**            |
| Google Material design system        | **Material UI (MUI)** |

**Questions to ask if the user is unsure:**

1. Do you want to design your own look or use pre-styled components?
2. Are you working with React, Vue, or plain HTML?
3. Is loading performance critical?
4. Are you a beginner or experienced?

---

## Phase 2: Analyze existing CSS

Perform a static analysis of the source CSS to categorize declarations: layout (flexbox/grid), typography, colors, spacing, UI components, animations, and media queries. Identify patterns to replace with framework equivalents.

### Categories to analyze

- **Colors** (backgrounds, text, borders)
- **Layout** (flexbox, grid, positioning)
- **Spacing** (margin, padding, gap)
- **Typography** (sizes, weights, alignment)
- **Components** (buttons, cards, forms, navigation)
- **Responsive** (media queries)
- **Animations & Transitions**

---

## Phase 3: Framework-specific migration

Read the reference file for the chosen framework:

- `references/tailwind.md` — Tailwind CSS (utility-first)
- `references/bootstrap.md` — Bootstrap 5 (component-based)
- `references/unocss.md` — UnoCSS (Vite, ultra-fast)
- `references/bulma.md` — Bulma (lightweight, no JS)

---

## Phase 4: Migration workflow

### Step 1 — Install the framework

Follow the instructions in the chosen framework's reference file.

### Step 2 — Incremental migration (recommended)

Do not migrate everything at once. Recommended order:

1. **Global layout** (page structure, grids)
2. **Typography** (headings, body text, lists)
3. **UI components** (buttons, cards, forms)
4. **Responsive** (media queries → responsive classes)
5. **Animations** (transitions, hover states)

### Step 3 — Remove orphaned CSS

After migration, identify and delete CSS that is no longer used.

### Step 4 — Visual verification

Test each migrated component visually before moving to the next.

---

## Migration checklist

- [ ] Framework chosen and installed
- [ ] Layout structure migrated
- [ ] Typography migrated
- [ ] Buttons and forms migrated
- [ ] Colors aligned with the framework's design system
- [ ] Responsive tested (mobile, tablet, desktop)
- [ ] Old CSS removed or cleaned up
- [ ] Visual output identical (or improved)
- [ ] Production build tested without errors

---

## Common pitfalls

1. **Conflicts between old CSS and framework** — Remove or isolate old CSS before or during migration
2. **CSS specificity too high** — Old CSS may override framework classes
3. **Bundle size** — Configure purge/treeshaking (especially for Tailwind and Bootstrap)
4. **Class name collisions** — Avoid reusing framework class names for your own custom classes
