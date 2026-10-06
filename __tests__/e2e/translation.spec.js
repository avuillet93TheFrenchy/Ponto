import { expect, test } from './fixtures.js';

test.describe('démarrage', () => {
  test('affiche l’interface en français avec une ligne DeepL, de l’anglais vers le français', async ({ app, page }) => {
    await app.open({ settings: { uiLang: 'fr' } });

    await expect(page.locator('#panes .row')).toHaveCount(1);
    await expect(app.row('deepl').locator('.engine-tag')).toHaveText('DeepL');
    await expect(page.locator('#src-lang')).toHaveText('Anglais');
    await expect(page.locator('#dst-lang')).toHaveText('Français');
    await expect(page.locator('#translate-all-label')).toHaveText('Traduire');
    await expect(app.row('deepl').locator('.count')).toHaveText(/^0 \/ 10\s000$/);
  });

  test('suit la langue de l’interface enregistrée', async ({ app, page }) => {
    await app.open({ settings: { uiLang: 'en' } });

    await expect(page.locator('#translate-all-label')).toHaveText('Translate');
    await expect(page.locator('#src-lang')).toHaveText('English');
    await expect(page.locator('#dst-lang')).toHaveText('French');
  });
});

test.describe('traduction', () => {
  test('traduit avec le bouton « Traduire » et envoie le texte nettoyé avec les bons codes', async ({
    app,
    page,
    isMobile,
  }) => {
    await app.open();

    await page.locator('#source-deepl').fill('  Hello  ');
    // Desktop shows the global button; the phone layout hides it and gives each row its own.
    await (isMobile ? app.row('deepl').locator('.translate-one') : page.locator('#translate-all')).click();

    await expect(app.row('deepl').locator('.target')).toHaveText('DeepL : Hello');
    expect(await app.calls('translate_deepl')).toEqual([
      { command: 'translate_deepl', args: { text: 'Hello', source: 'EN', target: 'FR', formal: true } },
    ]);
  });

  test('traduit avec Ctrl + Entrée', async ({ app, page }) => {
    await app.open();

    await page.locator('#source-deepl').fill('Good morning');
    await page.locator('#source-deepl').press('Control+Enter');

    await expect(app.row('deepl').locator('.target')).toHaveText('DeepL : Good morning');
  });

  test('en mode « Les deux », chaque moteur traduit avec ses propres codes', async ({ app, page }) => {
    await app.open({ settings: { provider: 'both' } });

    await expect(page.locator('#panes .row')).toHaveCount(2);
    await page.locator('#source-deepl').fill('Hello');
    await page.locator('#source-lara').fill('Hello');
    await app.translateAll();

    await expect(app.row('deepl').locator('.target')).toHaveText('DeepL : Hello');
    await expect(app.row('lara').locator('.target')).toHaveText('Lara : Hello');
    const [lara] = await app.calls('translate_lara');
    expect(lara.args).toMatchObject({ text: 'Hello', source: 'en-US', target: 'fr-FR', formal: true });
  });

  test('envoie le registre familier à DeepL et à Lara quand « Tu » est choisi', async ({ app, page }) => {
    await app.open({ settings: { provider: 'both' } });

    await page.getByRole('button', { name: 'Tu', exact: true }).click();
    await page.locator('#source-deepl').fill('Hello');
    await page.locator('#source-lara').fill('Hello');
    await app.translateAll();
    await expect(app.row('lara').locator('.target')).toHaveText('Lara : Hello');

    const [deepl] = await app.calls('translate_deepl');
    const [lara] = await app.calls('translate_lara');
    expect(deepl.args.formal).toBe(false);
    expect(lara.args.formal).toBe(false);
    expect(await app.stored('formal')).toBe(false);
  });

  test('refuse un texte trop long sans appeler le moteur', async ({ app, page }) => {
    await app.open();

    await page.locator('#source-deepl').fill('a'.repeat(10001));
    await app.translateAll();

    await expect(app.row('deepl').locator('.target')).toHaveText(/Texte trop long : 10\s000 caractères maximum\./);
    expect(await app.calls('translate_deepl')).toHaveLength(0);
  });
});

test.describe('erreurs du moteur', () => {
  test('traduit l’erreur « clé manquante » et ouvre les Paramètres', async ({ app, page }) => {
    await app.open({
      errors: { translate_deepl: 'Clé API DeepL manquante. Ajoute-la dans les Paramètres.' },
    });

    await page.locator('#source-deepl').fill('Hello');
    await app.translateAll();

    await expect(app.row('deepl').locator('.target')).toHaveText(
      'Clé API DeepL manquante. Ajoutez-la dans les Paramètres.'
    );
    await expect(page.locator('#settings')).toBeVisible();
  });

  test('affiche tel quel un message d’erreur inconnu', async ({ app, page }) => {
    await app.open({ errors: { translate_deepl: 'Quelque chose d’inattendu' } });

    await page.locator('#source-deepl').fill('Hello');
    await app.translateAll();

    await expect(app.row('deepl').locator('.target')).toHaveText('Quelque chose d’inattendu');
    await expect(page.locator('#settings')).toBeHidden();
  });
});

test.describe('langues', () => {
  test('choisit une langue cible dans la liste, la retient et l’utilise', async ({ app, page }) => {
    await app.open();

    await page.locator('#dst-lang').click();
    await expect(page.locator('#lang-picker')).toBeVisible();
    await page.locator('#lang-search').fill('japonais');
    await page.locator('#lang-search').press('Enter');

    await expect(page.locator('#lang-picker')).toBeHidden();
    await expect(page.locator('#dst-lang')).toHaveText('Japonais');
    await expect.poll(() => app.stored('targetLang')).toBe('ja');

    await page.locator('#source-deepl').fill('Hello');
    await app.translateAll();
    await expect(app.row('deepl').locator('.target')).toHaveText('DeepL : Hello');
    const [call] = await app.calls('translate_deepl');
    expect(call.args).toMatchObject({ source: 'EN', target: 'JA' });
  });

  test('inverse les langues', async ({ app, page }) => {
    await app.open();

    await page.locator('#swap').click();

    await expect(page.locator('#src-lang')).toHaveText('Français');
    await expect(page.locator('#dst-lang')).toHaveText('Anglais (États-Unis)');
  });

  test('en détection automatique, laisse le moteur détecter la langue source', async ({ app, page }) => {
    await app.open();

    await page.locator('#src-lang').click();
    await page.getByRole('button', { name: 'Détecter la langue' }).click();
    await expect(page.locator('#src-lang')).toHaveText('Détecter la langue');
    await expect(page.locator('#swap')).toBeDisabled();

    await page.locator('#source-deepl').fill('Bonjour');
    await app.translateAll();
    await expect(app.row('deepl').locator('.target')).toHaveText('DeepL : Bonjour');
    const [call] = await app.calls('translate_deepl');
    expect(call.args.source).toBeNull();
  });
});

test.describe('réglages', () => {
  test('enregistre les clés API et change la langue de l’interface', async ({ app, page }) => {
    await app.open();

    await page.locator('#open-settings').click();
    await expect(page.locator('#settings')).toBeVisible();
    await page.locator('#deepl-key').fill('abc123:fx');
    await expect(page.locator('#deepl-hint')).toHaveText('Clé Free détectée (:fx)');
    await page.locator('#ui-lang').selectOption('en');
    await expect(page.locator('#translate-all-label')).toHaveText('Translate');

    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('#settings')).toBeHidden();
    await expect(page.locator('#toast')).toHaveText('Settings saved');
    await expect.poll(() => app.stored('deeplKey')).toBe('abc123:fx');
    await expect.poll(() => app.stored('uiLang')).toBe('en');
  });

  test('garde le moteur choisi après un rechargement', async ({ app, page }) => {
    await app.open();

    await page.getByRole('button', { name: 'Lara', exact: true }).click();
    await expect(page.locator('#panes .row')).toHaveCount(1);
    await expect(app.row('lara').locator('.engine-tag')).toHaveText('Lara');
    await expect.poll(() => app.stored('provider')).toBe('lara');

    await page.reload();

    await expect(app.row('lara').locator('.engine-tag')).toHaveText('Lara');
    await expect(page.getByRole('button', { name: 'Lara', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});
