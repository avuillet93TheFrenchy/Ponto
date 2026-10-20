---
name: gen-test-e2e
description: Use when generating Playwright E2E tests for a page or user flow. Analyzes components and interactions, generates tests in the project's E2E folder following the Page Object Model.
---

# Playwright E2E Test Generator

## Project context

Resolve the profile first (`.claude/PROJECT-CONTEXT.md`): `<e2e>` (E2E folder), `<run>`/`<exec>`,
`scripts.e2e`, `scripts.dev`, `stack.typescript`, `stack.tauri`. Then read:

- `playwright.config.*` — `testDir`, `baseURL`, `webServer`, **project names** and per-project
  `testMatch`/`testIgnore`, timeouts, workers. Never recreate it if it exists.
- The existing specs, page objects and any fixtures file in `<e2e>/` — reuse them (a custom `test`
  export, network blocking, locale helpers...) instead of importing from `@playwright/test` directly.
- The `conventions` files and `notes` (file headers, typing rules, flows already covered).

If the project has no Playwright yet, say so and propose the minimal setup (`<exec> playwright init` or
`<commands.add> -D @playwright/test` + a config) before generating tests — ask first.

## Workflow

1. Ask which page or user flow to test (or use the provided argument)
2. Read the relevant source files (components, routes, handlers) to understand the interactions
3. Identify the main flows to test:
    - Navigation and page loading
    - User actions (clicks, forms, inputs)
    - Visual states (errors, success, loading)
    - Critical flows (authentication, destructive actions, etc.)
4. Create the test file in `<e2e>/` following the existing naming (`<name>.spec.js` / `.spec.ts`)
5. Apply the Page Object Model if the page has more than 3 distinct interactions; extend an existing page
   object rather than duplicating it

## Conventions

- Test file: `<e2e>/<name>.spec.<js|ts>` (TS when `stack.typescript` and the existing specs are TS)
- Page Object (if needed): `<e2e>/pages/<Name>Page.<js|ts>` (or the folder the project already uses)
- Imports: from the project's fixtures file when one exists, otherwise `import { test, expect } from '@playwright/test'`
- Make sure tests never call real third-party services (analytics, error reporting, payment) — block them
  with `page.route()` if no fixture does it already
- In JS projects that type-check (`checkJs`), give JSDoc types where inference fails
- Test names in English (clear and actionable descriptions)
- Selectors in order of priority:
    1. `getByRole()` — accessible and stable
    2. `getByLabel()` — for form fields
    3. `getByText()` — for visible content (prefer the locale file's value when testing translations)
    4. `locator('[data-testid="..."]')` — for elements without semantic role
    5. Avoid: `locator('.class')` or `locator('#id')` (fragile)
- Wait on state (`expect(...).toBeVisible()`, a page-object `waitFor...()` helper), never on fixed timeouts

### Tauri projects

E2E usually runs against the Vite dev server in a browser, outside Tauri (`isTauri()` is false): native-only
flows (`invoke()`, plugins, updater) cannot be exercised there — cover them with unit tests that mock
`@tauri-apps/*` (see `gen-test`), and say so in your summary.

## Page Object Model structure

```js
// <e2e>/pages/MyPage.js
export class MyPage {
    constructor(page) {
        this.page = page;
        this.myButton = page.getByRole('button', { name: 'My Button' });
        this.myField = page.getByLabel('My field');
    }

    async goto() {
        await this.page.goto('/my-route');
    }

    async fillForm(data) {
        await this.myField.fill(data.value);
        await this.myButton.click();
    }
}
```

## Test example

```js
import { test, expect } from '@playwright/test'; // or the project's fixtures file
import { MyPage } from './pages/MyPage.js';

test.describe('My user flow', () => {
    let myPage;

    test.beforeEach(async ({ page }) => {
        myPage = new MyPage(page);
        await myPage.goto();
    });

    test('should display the page correctly', async ({ page }) => {
        await expect(page).toHaveTitle(/Expected Title/);
        await expect(myPage.myButton).toBeVisible();
    });

    test('should handle user action successfully', async ({ page }) => {
        await myPage.fillForm({ value: 'test' });
        await expect(page.getByText('Success')).toBeVisible();
    });

    test('should show error on invalid input', async ({ page }) => {
        await myPage.fillForm({ value: '' });
        await expect(page.getByRole('alert')).toContainText('Required field');
    });
});
```

## Scope and referrals

This skill covers only **E2E tests** (complete user flows, via the browser).

- For unit tests (a single isolated function) → use the skill `gen-test`
- For integration tests, debugging, or error analysis → use the skill `testing-debugging-helper`
- For code quality review of generated tests → use the agent `code-reviewer`

## Validation

After generation:

1. Verify that the file is in `<e2e>/` with the project's naming
2. Run the tests: `<exec> playwright test <e2e>/<name>.spec.js` (or `<run> <scripts.e2e>` for the whole suite)
3. Display the report: `<exec> playwright show-report`
4. For interactive mode (debug): `<exec> playwright test --ui`
5. To target a single project: `<exec> playwright test --project=<name>` — use a name from the config
6. Verify that all selectors are stable (no dynamic CSS classes)
