# Version web de Ponto — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir Ponto comme site web public (traduction DeepL/Lara avec les clés de chaque visiteur, chiffrées dans son navigateur), installable en PWA sur iOS, iPadOS, macOS et Linux.

**Architecture:** Le front garde un seul point d'accès au backend, `tauriInvoke` (`src/tauri/core.js`) et au stockage, `storeGet`/`storeSet` (`src/tauri/store.js`). Hors Tauri, ces deux wrappers délèguent à `src/js/web/` : un backend `fetch` vers `/api/*` et un coffre de clés chiffrées (Web Crypto + IndexedDB). Un Cloudflare Worker sans état (`worker/`) reprend la logique de `translate.rs`/`lara.rs` et sert aussi le front (`dist/`) comme assets statiques.

**Tech Stack:** JS + JSDoc (front), TypeScript (Worker), Vitest, Playwright, Cloudflare Workers + static assets (`wrangler`), `vite-plugin-pwa`, `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-10-05-web-version-design.md`

## Global Constraints

- Tauri (`.exe`/`.apk`) doit fonctionner à l'identique ; son `dist/` ne contient ni `sw.js` ni manifest.
- Tout accès Tauri passe par `src/tauri/` ; tout le JS hors `main.js`, `instrument.js`, `style.scss` vit dans `src/js/` (nouveau code web : `src/js/web/`, alias `@js/web/*`).
- JSDoc obligatoire (`strict` + `checkJs`, tests inclus) ; 2 espaces, guillemets simples, LF ; `src/tauri/*.js` reste en 4 espaces.
- Textes UI : `MESSAGES` (`key: [fr, en]`), vouvoiement, `t()` / `data-i18n` ; un texte d'erreur nouveau venant du Worker exige une règle dans `src/js/errors.js`.
- HTML : pas de `<script>`/`style` inline (htmlhint).
- Couverture 80/75/80/80 (étendre `include` à `worker/src/**/*.ts`).
- Dépendances : `pnpm add` respecte `minimumReleaseAge: 10080` de `pnpm-workspace.yaml` (7 jours) ; ne pas contourner.
- Aucune clé ne figure dans une URL, un journal, une réponse du Worker ou un événement Sentry. Le Worker n'a ni `console.log` de requête/en-tête ni logs de requêtes activés.
- README bilingue : FR et EN mis à jour ensemble. Commits : sujet court, impératif, en anglais.
- Lien de téléchargement natif : `https://github.com/avuillet93TheFrenchy/Ponto/releases/latest`.

**Protocole Worker (référence pour les tâches 1, 2, 6)** — toutes les routes sont en `POST`, corps JSON, réponse JSON :

| Route | Corps | Succès (200) |
|---|---|---|
| `/api/translate/deepl` | `{ text, source: string\|null, target, formal: boolean\|null }` | `{ translation: string }` |
| `/api/translate/lara` | idem | `{ translation: string }` |
| `/api/languages/deepl` | `{}` | `{ source: string[], target: { code: string, formality: boolean }[] }` |
| `/api/languages/lara` | `{}` | `string[]` |

En-têtes : `X-Deepl-Key` (DeepL) ; `X-Lara-Id` et `X-Lara-Secret` (Lara). Erreur : statut HTTP + `{ "error": "<texte français>" }`. Textes repris de Rust (préfixes reconnus par `errors.js`) : `Clé API DeepL manquante…`, `Identifiants Lara manquants…`, `Erreur réseau DeepL|Lara : …`, `<message> (code <statut>)`, `Réponse DeepL invalide : …`, `Réponse DeepL sans traduction.`, `Identifiants Lara refusés (<statut>) : …`, `Erreur API Lara (<statut>) : …`, `Lara refuse le jeton d'authentification (401).`, `Liste des langues DeepL invalide.`. Textes nouveaux : `Requête invalide : …` (400/413/405), `Origine refusée.` (403), `Trop de requêtes, réessayez dans un instant.` (429).

## Review Focus

Entrées que le spec laisse implicites ; chacune a son test dans la tâche indiquée.

1. **Texte vide ou énorme, retours à la ligne, emoji** envoyés au Worker : refus net (400/413 « Requête invalide »), jamais de plantage ni de troncature silencieuse (tâche 1).
2. **Clé collée avec espaces ou retours à la ligne** : le client les retire avant de les placer en en-tête (sinon `fetch` lève `TypeError`) ; une clé DeepL `:fx` va sur `api-free` (tâches 1 et 6).
3. **IndexedDB indisponible** (navigation privée, stockage bloqué) : le coffre retombe sur la mémoire pour la session, sans lever d'erreur (tâche 4).
4. **Hors ligne** : `fetch` rejette → `Erreur réseau DeepL|Lara : …` (déjà traduit par `errors.js`), l'interface reste utilisable (tâches 6 et 12).
5. **Ancienne version en cache après un déploiement, et `/api/*` jamais servi depuis le cache** (tâches 9 et 12).

---

### Task 1: Worker — routeur, validation et DeepL

**Files:**
- Create: `worker/src/env.ts`, `worker/src/errors.ts`, `worker/src/validate.ts`, `worker/src/deepl.ts`, `worker/src/index.ts`
- Create: `__tests__/worker/validate.test.js`, `__tests__/worker/deepl.test.js`, `__tests__/worker/index.test.js`
- Modify: `tsconfig.json` (`include` : `"worker/src/**/*.ts"`), `vitest.config.ts` (`coverage.include` : `'worker/src/**/*.ts'`), `.gitignore` (`worker/.wrangler`, `.dev.vars`)

**Interfaces:**
- Produces (`worker/src/env.ts`) : `interface Env { ASSETS: { fetch(req: Request): Promise<Response> }; RATE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> } }` (types locaux, sans `@cloudflare/workers-types`, pour que le `tsc` racine type-check les fichiers du Worker).
- Produces (`errors.ts`) : `class ApiError extends Error { status: number; constructor(status: number, message: string) }` ; `errorResponse(status: number, message: string): Response` (`{ error }`, `Content-Type: application/json`, `Cache-Control: no-store`) ; `jsonResponse(body: unknown): Response` (200, mêmes en-têtes).
- Produces (`validate.ts`) : `const MAX_TEXT_CHARS = 10000` (même valeur que `MAX_CHARS` de `main.js`) ; `interface TranslateBody { text: string; source: string | null; target: string; formal: boolean | null }` ; `parseTranslateBody(raw: unknown): TranslateBody` (lève `ApiError` 400 : `Requête invalide : …`, 413 si le texte dépasse `MAX_TEXT_CHARS` ; texte vide ou blanc refusé ; codes de langue validés par `/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/` ; `source` absent ou `null` = détection) ; `readJsonBody(req: Request): Promise<unknown>` (refuse un corps de plus de 64 Ko ou un JSON invalide : 400/413) ; `requireHeader(req: Request, name: string, missingMessage: string): string` (valeur sans espaces aux extrémités, sinon `ApiError(401, missingMessage)`).
- Produces (`deepl.ts`) : `deeplBaseUrl(key: string): string` ; `translateDeepl(key: string, body: TranslateBody, fetchFn?: typeof fetch): Promise<string>` ; `deeplLanguages(key: string, fetchFn?: typeof fetch): Promise<{ source: string[]; target: { code: string; formality: boolean }[] }>`.
- Produces (`index.ts`) : `export default { fetch(req: Request, env: Env): Promise<Response> }`. Hors `/api/*` : `env.ASSETS.fetch(req)`. `/api/*` inconnu : 404 `{ error }`.

- [ ] **Step 1: Write failing tests** (en-tête `// @vitest-environment node` ; JSDoc sur les helpers)
  - `validate.test.js` : `'refuse un texte vide ou blanc'` (400), `'refuse un texte de 10001 caractères'` (413), `'accepte 10000 caractères, emoji et retours à la ligne'`, `'refuse un code de langue invalide'` (`'fr; DROP'` → 400), `'source absente = détection'` (`source === null`), `'requireHeader retire les espaces et signale l'absence'`.
  - `deepl.test.js` (fetch simulé) : `'clé :fx → api-free.deepl.com'`, `'clé pro → api.deepl.com'`, `'envoie DeepL-Auth-Key, text[], target_lang'`, `'formal true/false → prefer_more/prefer_less, null → pas de formality'`, `'source présente → source_lang'`, `'erreur HTTP → "<message> (code 403)"'`, `'fetch qui rejette → "Erreur réseau DeepL : …"'`, `'réponse sans translations → "Réponse DeepL sans traduction."'`, `'languages : fusionne source/target, formality false par défaut'` (mêmes cas que les tests de `parse_deepl` dans `languages.rs`), `'languages : réponse non liste → "Liste des langues DeepL invalide."'`.
  - `index.test.js` : `'POST /api/translate/deepl renvoie { translation }'`, `'clé absente → 401 "Clé API DeepL manquante…"'`, `'GET /api/translate/deepl → 405'`, `'route /api inconnue → 404'`, `'hors /api → ASSETS.fetch'`, `'la clé n'apparaît jamais dans une réponse d'erreur'` (DeepL simulé qui renvoie la clé dans son message : la réponse ne la contient pas).
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/worker` — Expected: FAIL (modules absents).
- [ ] **Step 3: Implement** les fichiers ci-dessus. `index.ts` : table de routes `{ chemin → gestionnaire }`, un seul `try/catch` qui convertit `ApiError` en `errorResponse` et toute autre exception en 500 `Erreur interne.` sans détail. Les messages upstream sont repris de `translate.rs`/`languages.rs` (voir tableau du protocole) ; un message upstream qui contiendrait la clé est expurgé (remplacer la clé par `***`).
- [ ] **Step 4: Run** les mêmes tests — Expected: PASS. Puis `pnpm typecheck` — Expected: 0 erreur.
- [ ] **Step 5: Commit** `git add worker __tests__/worker tsconfig.json vitest.config.ts .gitignore && git commit -m "Add Worker router with DeepL proxy"`

### Task 2: Worker — Lara

**Files:**
- Create: `worker/src/lara.ts`, `__tests__/worker/lara.test.js`
- Modify: `worker/src/index.ts` (routes `/api/translate/lara`, `/api/languages/lara`)

**Interfaces:**
- Consumes: `ApiError`, `TranslateBody`, `requireHeader` (tâche 1).
- Produces: `interface LaraCredentials { id: string; secret: string }` ; `contentMd5(body: string): string` ; `signLara(secret: string, method: string, path: string, md5: string, contentType: string, date: string): Promise<string>` ; `translateLara(creds: LaraCredentials, body: TranslateBody, fetchFn?: typeof fetch): Promise<string>` ; `laraLanguages(creds: LaraCredentials, fetchFn?: typeof fetch): Promise<string[]>` ; `clearLaraTokenCache(): void` (pour les tests).

- [ ] **Step 1: Write failing tests** (`node:crypto` pour les valeurs attendues)
  - `'contentMd5 = base64 du MD5 du corps'` (vecteur fixe, p. ex. `'{"id":"x"}'`).
  - `'signLara signe "méthode\nchemin\nmd5\ncontent-type\ndate" en HMAC-SHA256 base64'` : compare à `createHmac('sha256', secret).update(challenge).digest('base64')`.
  - `'authentifie via POST /v2/auth avec Authorization "Lara:<signature>", X-Lara-Date, Content-MD5'`.
  - `'traduit avec Bearer, body { q, target }, source si fournie, instructions formelle/familière'` (`Use the formal, polite register.` / `Use the informal, familiar register.`, absentes si `formal` est `null`).
  - `'lit la dernière ligne JSON valide d'une réponse NDJSON'` (plusieurs lignes, la dernière porte `status` et `data`).
  - `'401 → réauthentifie une seule fois puis réessaie'` ; `'deuxième 401 → "Lara refuse le jeton d'authentification (401)."'`.
  - `'erreur 401/403 d'auth → "Identifiants Lara refusés (401) : …"'`, `'autre erreur → "Erreur API Lara (500) : …"'`.
  - `'réutilise le jeton : deux traductions = une seule authentification'`.
  - `'même id mais autre secret → nouvelle authentification'` (le jeton d'un tiers n'est jamais réutilisé sans son secret).
  - `'languages : tableau de locales, sinon "Liste des langues Lara invalide."'`.
  - Route : `'clés Lara absentes → 401 "Identifiants Lara manquants…"'`.
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/worker/lara.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `lara.ts` en reprenant l'algorithme de `src-tauri/src/lara.rs` (`authenticate`, `call_once`, `authorized`). MD5 : `createHash('md5')` de `node:crypto` (non disponible via `crypto.subtle` sous Node ; fonctionne dans le Worker avec le drapeau `nodejs_compat`, posé à la tâche 3). Cache de jetons : `Map` du module, clé = SHA-256 hex de `id + '\n' + secret`, taille bornée à 100 entrées (la plus ancienne est évincée) ; jamais indexé par l'id seul. En-têtes SDK : `X-Lara-SDK-Name: ponto-web`, `X-Lara-SDK-Version` depuis une constante.
- [ ] **Step 4: Run** `pnpm exec vitest run __tests__/worker` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add Lara proxy to the Worker"`

### Task 3: Worker — durcissement et configuration de déploiement

**Files:**
- Create: `worker/wrangler.toml`, `__tests__/worker/hardening.test.js`
- Modify: `worker/src/validate.ts`, `worker/src/index.ts`
- Modify: `package.json` (devDependency `wrangler`)

**Interfaces:**
- Consumes: `Env`, `ApiError`, `index.ts` (tâches 1-2).
- Produces (`validate.ts`) : `checkSameOrigin(req: Request): void` — si `Origin` est présent, son hôte doit égaler celui de l'URL ; sinon `Sec-Fetch-Site` doit valoir `same-origin` ; si aucun des deux n'est présent : refus. Erreur `ApiError(403, 'Origine refusée.')`.
- Produces (`index.ts`) : pour toute route `/api/*` : méthode `POST` uniquement, puis `checkSameOrigin`, puis limitation de débit (`env.RATE_LIMITER?.limit({ key: <IP depuis CF-Connecting-IP, sinon 'anonymous'> })`, refus `ApiError(429, 'Trop de requêtes, réessayez dans un instant.')` quand `success` est faux ; sans binding, pas de limitation).

- [ ] **Step 1: Write failing tests** `hardening.test.js` : `'Origin d'un autre site → 403'`, `'sans Origin ni Sec-Fetch-Site → 403'`, `'Sec-Fetch-Site same-origin → accepté'`, `'Origin identique → accepté'`, `'rate limiter qui refuse → 429 avec le texte attendu'`, `'rate limiter appelé avec l'IP CF-Connecting-IP'`, `'méthode GET sur /api → 405'`, `'wrangler.toml : observability désactivée et nodejs_compat présent'` (lecture du fichier en texte, assertions sur `enabled = false` dans `[observability]` et sur `nodejs_compat`), `'aucun console.log dans worker/src'` (lecture des sources).
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/worker/hardening.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** les gardes. Installer `wrangler` (`pnpm add -D wrangler`). Écrire `worker/wrangler.toml` : `name = "ponto"`, `main = "src/index.ts"`, `compatibility_date` = date du jour, `compatibility_flags = ["nodejs_compat"]`, `[assets]` avec `directory = "../dist"`, `binding = "ASSETS"` et `run_worker_first = ["/api/*"]`, `[observability] enabled = false`, et le binding de limitation de débit. **Vérifier la syntaxe actuelle du binding « Workers Rate Limiting » et de `run_worker_first` dans la documentation Cloudflare avant de l'écrire** (elle a changé récemment) ; viser 30 requêtes par minute et par IP.
- [ ] **Step 4: Run** `pnpm exec vitest run __tests__/worker` — Expected: PASS. `pnpm exec wrangler deploy --dry-run -c worker/wrangler.toml` (après `pnpm build:web`) sera exécuté à la tâche 11.
- [ ] **Step 5: Commit** `git commit -m "Harden Worker: origin check, rate limit, no logs"`

### Task 4: Coffre de clés chiffrées

**Files:**
- Create: `src/js/web/vault.js`, `__tests__/web-vault.test.js`
- Modify: `package.json` (devDependency `fake-indexeddb`)

**Interfaces:**
- Produces:
  - `vaultGet(name: string): Promise<string | null>`
  - `vaultSet(name: string, value: string): Promise<void>`
  - `vaultDelete(name: string): Promise<void>`
  - `vaultClear(): Promise<void>` (supprime les valeurs **et** la clé de chiffrement)
  - `vaultIsPersistent(): Promise<boolean>` (faux quand le coffre est retombé sur la mémoire)
  - `resetVaultForTests(): void`
- Stockage : base IndexedDB `ponto-vault`, un object store `kv` ; clé AES-GCM 256 bits non extractible sous l'id `'__master'` (créée à la première écriture) ; chaque valeur est `{ iv: Uint8Array(12), data: ArrayBuffer }` chiffrée avec un IV aléatoire distinct.

- [ ] **Step 1: Write failing tests** (`import 'fake-indexeddb/auto'` ; Web Crypto de Node ; JSDoc ; `crypto.subtle` doit exister dans l'environnement de test — sinon l'exposer dans le test depuis `node:crypto` `webcrypto`)
  - `'aller-retour : set puis get renvoie la valeur'`.
  - `'get d'une valeur absente → null'`.
  - `'la valeur stockée ne contient pas le texte en clair'` (lit l'enregistrement brut dans IndexedDB, décode les octets, vérifie que la clé n'y figure pas).
  - `'deux écritures de la même valeur donnent des IV et des chiffrés différents'`.
  - `'la clé de chiffrement est non extractible'` (`crypto.subtle.exportKey` échoue).
  - `'coffre dont la clé a disparu → get renvoie null sans lever'` (suppression de `'__master'` à la main).
  - `'donnée altérée → null, et l'entrée est supprimée'`.
  - `'vaultDelete retire une valeur ; vaultClear retire tout'`.
  - `'IndexedDB indisponible → fonctionne en mémoire, vaultIsPersistent() est faux'` (`indexedDB.open` qui lève).
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/web-vault.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `vault.js` (promisifier IndexedDB avec un petit helper local ; pas de bibliothèque).
- [ ] **Step 4: Run** le test — Expected: PASS ; `pnpm typecheck` — Expected: 0 erreur.
- [ ] **Step 5: Commit** `git commit -m "Add encrypted key vault for the web build"`

### Task 5: Réglages sur le web (store) et bascule `isTauriRuntime`

**Files:**
- Create: `src/js/web/storage.js`, `__tests__/web-storage.test.js`
- Modify: `src/tauri/core.js` (export `isTauriRuntime`), `src/tauri/store.js` (`storeGet`, `storeSet`), `__tests__/tauri.test.js`, `__tests__/e2e/fixtures.js`

**Interfaces:**
- Consumes: `vaultGet`, `vaultSet`, `vaultDelete` (tâche 4).
- Produces:
  - `src/tauri/core.js` : `isTauriRuntime(): boolean` (appelle `isTauri()` de `@tauri-apps/api/core`).
  - `src/js/web/storage.js` : `SECRET_KEYS = ['deeplKey', 'laraId', 'laraSecret']` ; `webStoreGet(key: string): Promise<unknown | null>` ; `webStoreSet(key: string, value: unknown): Promise<void>`. Les clés secrètes passent par le coffre (valeur vide → `vaultDelete`) ; les autres sont un objet JSON sous la clé `localStorage` `ponto-settings` (lecture/écriture dans un `try/catch` : stockage bloqué → comportement mémoire, jamais d'exception).
  - `storeGet(storePath, key)` / `storeSet(storePath, key, value)` : si `!isTauriRuntime()`, renvoient `webStoreGet(key)` / `webStoreSet(key, value)` (`storePath` ignoré). Les autres fonctions du wrapper (`storeDelete`, `storeClear`, `storeKeys`) ne sont pas utilisées par l'application et restent réservées à Tauri (YAGNI).
- Écart assumé par rapport au spec (point 4) : la bascule est dans le wrapper `src/tauri/store.js` et non dans `settings.js`, ce qui laisse `settings.js`, `DEFAULTS` et la migration `direction` inchangés.

- [ ] **Step 1: Write failing tests**
  - `web-storage.test.js` : `'un réglage non secret survit à un rechargement du module'`, `'une clé secrète n'est jamais écrite dans localStorage'` (scan de toutes les valeurs de `localStorage`), `'une clé secrète revient déchiffrée via get'`, `'valeur vide sur une clé secrète = absente (null)'`, `'localStorage qui lève → pas d'exception'`.
  - `tauri.test.js` : ajouter `isTauri` au mock `plugin.core` (`vi.fn()`) et, dans un `beforeEach`, `plugin.core.isTauri.mockReturnValue(true)` (`mockReset: true` remet les implémentations à zéro à chaque test) ; nouveaux cas `'storeGet hors Tauri délègue au stockage web'` et `'storeSet hors Tauri délègue au stockage web'` (mock de `@js/web/storage.js`).
  - `fixtures.js` : dans `installFakeTauri`, ajouter `page.isTauri = true` (sans cela `isTauri()` renvoie faux dans les E2E existants, qui simulent seulement `__TAURI_INTERNALS__`, et l'application passerait sur le backend web).
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/web-storage.test.js __tests__/tauri.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `storage.js`, `isTauriRuntime`, la bascule dans `store.js` (4 espaces dans `src/tauri/`).
- [ ] **Step 4: Run** `pnpm test` — Expected: tout PASS ; `pnpm exec playwright test --project=windows-desktop` — Expected: PASS (les E2E existants passent toujours grâce à `isTauri = true`).
- [ ] **Step 5: Commit** `git commit -m "Route settings to a web store outside Tauri"`

### Task 6: Backend web et bascule de `tauriInvoke`

**Files:**
- Create: `src/js/web/backend.js`, `__tests__/web-backend.test.js`
- Modify: `src/tauri/core.js` (`tauriInvoke`), `src/js/errors.js`, `src/js/settings.js` (`MESSAGES`), `__tests__/tauri.test.js`, `__tests__/errors.test.js`

**Interfaces:**
- Consumes: `webStoreGet` (tâche 5), `isTauriRuntime` (tâche 5), protocole Worker (en-tête du plan).
- Produces: `webInvoke(command: string, args?: Record<string, unknown>): Promise<unknown>` — commandes `translate_deepl`, `translate_lara`, `deepl_languages`, `lara_languages` ; toute autre commande lève une chaîne `Commande inconnue : …`. Les échecs sont **levés comme chaînes** (comme le rejet de `invoke()` côté Rust) : `tauriInvoke` les enveloppe dans `CoreError` avec la chaîne en `cause`, ce que `main.js` lit déjà. Pas de clé → lève sans appel réseau `Clé API DeepL manquante. Ajoutez-la dans les Paramètres.` / `Identifiants Lara manquants. Ajoutez-les dans les Paramètres.`.
- `tauriInvoke(cmd, args, options)` : si `!isTauriRuntime()`, `return await webInvoke(cmd, args)` à l'intérieur du `try` existant.
- `errors.js` : deux règles `{ pattern: /^Requête invalide/, key: 'error.badRequest' }` et `{ pattern: /^Trop de requêtes/, key: 'error.rateLimited' }` (+ `Origine refusée` → `error.badRequest`) ; clés `error.badRequest` et `error.rateLimited` dans `MESSAGES` (FR, vouvoiement + EN).

- [ ] **Step 1: Write failing tests** (`fetch` simulé via `vi.stubGlobal`)
  - `'translate_deepl : POST /api/translate/deepl, en-tête X-Deepl-Key, corps { text, source, target, formal }'` ; `'source absente → source: null'`.
  - `'translate_lara : en-têtes X-Lara-Id et X-Lara-Secret'`.
  - `'deepl_languages / lara_languages : bonnes routes, corps {}'`.
  - `'retire espaces et retours à la ligne des clés avant de les mettre en en-tête'` (clé `'abc\n def :fx'` → `abcdef:fx`).
  - `'clé absente → lève le texte "Clé API DeepL manquante…" sans appeler fetch'` ; idem Lara.
  - `'réponse { error } → lève ce texte'`.
  - `'fetch qui rejette → lève "Erreur réseau DeepL : …"'` (et `Lara`).
  - `'réponse non JSON → lève "Réponse DeepL invalide : …"'`.
  - `'les clés ne figurent jamais dans l'URL ni le corps'`.
  - `'commande inconnue → lève'`.
  - `tauri.test.js` : `'tauriInvoke hors Tauri appelle webInvoke et enveloppe l'échec dans CoreError'`.
  - `errors.test.js` : les deux nouveaux préfixes sont traduits en FR et EN.
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/web-backend.test.js __tests__/tauri.test.js __tests__/errors.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `backend.js` (table `commande → { route, moteur, en-têtes }`), la bascule dans `core.js`, les règles et clés i18n.
- [ ] **Step 4: Run** `pnpm test` — Expected: PASS ; `pnpm typecheck` — Expected: 0 erreur.
- [ ] **Step 5: Commit** `git commit -m "Add web backend that calls the Worker"`

### Task 7: Réglages — note de chiffrement et bouton « Effacer mes clés »

**Files:**
- Modify: `index.html`, `src/main.js`, `src/js/settings.js` (`MESSAGES`), `src/style.scss` (si le bouton demande un style), `__tests__/main.test.js`
- Test: `__tests__/e2e/web.spec.js` (créé à la tâche 12 ; cette tâche couvre le niveau unitaire)

**Interfaces:**
- Consumes: `isTauriRuntime` (tâche 5), `vaultClear` (tâche 4).
- Produces: clés `settings.noteWeb`, `settings.clearKeys`, `settings.keysCleared` (FR + EN) ; élément `#clear-keys` (`hidden` par défaut) dans le dialogue `#settings`.
- Comportement : hors Tauri, `settings.note` (« en clair dans settings.json ») est remplacé par `settings.noteWeb` (« Vos clés sont chiffrées dans ce navigateur ; elles protègent le stockage, pas contre un script malveillant du site. Vos textes transitent par le serveur du site vers DeepL et Lara, sans être conservés. ») ; `#clear-keys` est affiché ; son clic appelle `vaultClear()`, vide les trois champs, met à jour `savedKeys` et affiche `settings.keysCleared`.

- [ ] **Step 1: Write failing tests** dans `main.test.js` (ajouter `isTauriRuntime` au mock de `@tauri/index.js`, valeur par défaut `true` posée dans un `beforeEach`, et mock de `@js/web/vault.js`) : `'hors Tauri, la note affichée est celle du web'`, `'dans Tauri, la note reste celle du fichier settings.json'`, `'#clear-keys est masqué dans Tauri, visible sur le web'`, `'clic sur #clear-keys vide le coffre et les trois champs'`.
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/main.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** : bouton dans `index.html` avec `data-i18n`, branchement dans `main.js` (au démarrage : `if (!isTauriRuntime())` changer `data-i18n` de la note, appeler `applyTranslations`, retirer `hidden` du bouton).
- [ ] **Step 4: Run** `pnpm test && pnpm lint` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Show encryption note and clear-keys button on the web"`

### Task 8: Sentry — aucune clé dans les événements

**Files:**
- Create: `src/js/web/scrub.js`, `__tests__/web-scrub.test.js`
- Modify: `src/instrument.js`

**Interfaces:**
- Produces: `scrubEvent(event: import('@sentry/browser').ErrorEvent): import('@sentry/browser').ErrorEvent` — retire de `event.request.headers` et de chaque `breadcrumbs[].data.headers` les en-têtes `x-deepl-key`, `x-lara-id`, `x-lara-secret` (insensible à la casse) ; `scrubBreadcrumb(breadcrumb: import('@sentry/browser').Breadcrumb): import('@sentry/browser').Breadcrumb` (même filtre).
- `instrument.js` : `beforeSend: scrubEvent` ; `beforeBreadcrumb: isTauri() ? sendBreadcrumbToRust : scrubBreadcrumb`.

- [ ] **Step 1: Write failing tests** : `'retire les trois en-têtes de event.request.headers, casse mélangée'`, `'laisse les autres en-têtes intacts'`, `'retire les en-têtes des breadcrumbs'`, `'événement sans request ni breadcrumbs → inchangé'`.
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/web-scrub.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `scrub.js` et câbler `instrument.js` (fichier en tabulations : conserver son style).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Scrub key headers from Sentry events"`

### Task 9: PWA — build, manifest, service worker

**Files:**
- Create: `public/pwa-192.png`, `public/pwa-512.png`, `public/pwa-maskable-512.png`, `public/apple-touch-icon.png`, `src/js/web/pwa.js`, `__tests__/web-pwa.test.js`
- Modify: `vite.config.ts`, `index.html` (`<link rel="manifest">` n'est pas écrit à la main : voir ci-dessous ; `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`), `src/main.js` (appel de `registerServiceWorker()`), `package.json` (devDependency `vite-plugin-pwa` ; scripts `build:web`, `dev:web`, `deploy:web` : ajoutés à la tâche 11)

**Interfaces:**
- Produces: `registerServiceWorker(): Promise<void>` — n'enregistre `/sw.js` que si `!isTauriRuntime()`, `'serviceWorker' in navigator` et `import.meta.env.MODE === 'web'` ; une erreur d'enregistrement est avalée (`report`-style : jamais d'exception).
- `vite.config.ts` : défini en fonction du mode, `VitePWA({...})` n'est ajouté que si `mode === 'web'` (passer à `defineConfig(({ mode }) => ({ ... }))` ; **ne pas** toucher à la logique Sentry/`isProductionBuild`). Options : `injectRegister: false` (enregistrement manuel gardé) ; manifest : `name: 'Ponto'`, `short_name: 'Ponto'`, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `lang: 'fr'`, `theme_color`/`background_color` repris de `style.scss`, icônes 192/512 `any` + 512 `maskable` ; `workbox` : `navigateFallback: '/index.html'`, `navigateFallbackDenylist: [/^\/api\//]`, aucun `runtimeCaching`, `skipWaiting: false`, `clientsClaim: false` (une nouvelle version s'active quand l'application est fermée puis rouverte, jamais en cours d'usage), `globPatterns` limités à `js, css, html, svg, png, woff2`.
- Icônes : PNG générés une fois depuis `public/logo.svg` avec n'importe quel rastériseur (par exemple `pnpm dlx` d'un outil CLI, sans l'ajouter aux dépendances) puis commités. `pwa-maskable-512.png` : fond dégradé du logo plein cadre et « P » seul dans la zone sûre centrale (80 %), comme le premier plan de l'icône adaptative Android ; `apple-touch-icon.png` : 180×180, plein cadre.

- [ ] **Step 1: Write failing tests** `web-pwa.test.js` : `'registerServiceWorker enregistre /sw.js en mode web hors Tauri'`, `'ne fait rien dans Tauri'`, `'ne fait rien hors mode web'`, `'une erreur d'enregistrement ne lève pas'`, `'les PNG PWA existent avec les dimensions annoncées'` (lecture de l'en-tête IHDR : 192, 512, 512, 180).
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/web-pwa.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `pwa.js`, la config Vite, les icônes, l'appel dans `main.js`.
- [ ] **Step 4: Verify the build split** — `pnpm exec vite build --mode web` puis `ls dist` — Expected: `sw.js` et `manifest.webmanifest` présents ; `grep -c "api" dist/sw.js` ne doit montrer aucune règle de cache sur `/api` (seulement la denylist). Puis `pnpm build` — Expected: `dist/sw.js` et `dist/manifest.webmanifest` **absents** (le build Tauri reste intact).
- [ ] **Step 5: Run** `pnpm test && pnpm typecheck` puis **Commit** `git commit -m "Add PWA manifest and service worker to the web build"`

### Task 10: PWA — invitation à installer et lien natif

**Files:**
- Create: `src/js/web/install.js`, `__tests__/web-install.test.js`
- Modify: `index.html` (`<aside id="install" hidden>` avec texte, boutons `#install-accept`, `#install-later`, lien `#install-native`), `src/style.scss`, `src/js/settings.js` (`MESSAGES`), `src/main.js`

**Interfaces:**
- Produces:
  - `type Platform = 'windows' | 'android' | 'ios' | 'mac' | 'linux' | 'other'`
  - `detectPlatform(nav?: Navigator): Platform` — `userAgentData.platform` si présent, sinon agent utilisateur ; iPadOS (UA « Macintosh » avec `maxTouchPoints > 1`) → `'ios'`.
  - `isStandalone(win?: Window): boolean` (`display-mode: standalone` ou `navigator.standalone`).
  - `initInstallBanner(win?: Window): void` — ne fait rien dans Tauri ni si l'application est déjà installée ni si « Plus tard » a été choisi (`localStorage` `ponto-install-dismissed`, lecture/écriture dans un `try/catch`).
- Comportement : `windows` / `android` → bannière « application native » avec le lien `https://github.com/avuillet93TheFrenchy/Ponto/releases/latest` (aucune invitation PWA) ; `ios` → instructions « Partager › Sur l'écran d'accueil » ; `mac` Safari → « Fichier › Ajouter au Dock » ; navigateur Chromium sur `mac`/`linux`/`other` → capte `beforeinstallprompt` (`preventDefault`, mémorise l'événement) et affiche « Installer » qui appelle `prompt()` ; le texte rappelle que sur iOS les clés sont à ressaisir dans l'application installée (stockage séparé de Safari). Clés `MESSAGES` : `install.native`, `install.nativeLink`, `install.button`, `install.later`, `install.ios`, `install.mac`, `install.keysNote`.

- [ ] **Step 1: Write failing tests** (UA et `navigator` simulés) : `'detectPlatform : Windows, Android, iPhone, iPad (Macintosh + tactile), Mac, Linux, ChromeOS'`, `'aucune bannière dans Tauri'`, `'aucune bannière si déjà installée (standalone)'`, `'Windows et Android : lien natif, pas de bouton Installer'`, `'iOS : instructions, pas de bouton Installer'`, `'Chromium sur Mac/Linux : bouton Installer affiché seulement après beforeinstallprompt, clic → prompt()'`, `'« Plus tard » masque et mémorise ; localStorage qui lève → pas d'exception'`.
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/web-install.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `install.js`, le balisage, le style, les chaînes i18n, l'appel depuis `main.js` après l'initialisation.
- [ ] **Step 4: Run** `pnpm test && pnpm lint && pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add install banner and native download link"`

### Task 11: Déploiement — en-têtes, scripts, assets

**Files:**
- Create: `public/_headers`, `public/.assetsignore`, `__tests__/web-deploy.test.js`
- Modify: `package.json` (scripts), `vite.config.ts` (rien si déjà fait), `worker/wrangler.toml` (si besoin)

**Interfaces:**
- Scripts : `build:web` = `vite build --mode web` ; `dev:web` = `pnpm build:web && wrangler dev -c worker/wrangler.toml` ; `deploy:web` = `cross-env NODE_ENV=production pnpm build:web && wrangler deploy -c worker/wrangler.toml`.
- `public/_headers` : pour `/*` : `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.ingest.de.sentry.io; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` ; pour `/sw.js` : `Cache-Control: no-cache` ; pour `/manifest.webmanifest` : `Cache-Control: no-cache`.
- `public/.assetsignore` : `*.map` (les sourcemaps `hidden` du build ne doivent pas être servies publiquement).

- [ ] **Step 1: Write failing tests** `web-deploy.test.js` (lecture de fichiers) : `'la CSP interdit unsafe-inline dans script-src'`, `'la CSP autorise manifest-src et worker-src sur self'`, `'connect-src liste Sentry et self seulement'`, `'frame-ancestors none'`, `'sw.js et le manifest ne sont pas mis en cache longtemps'`, `'.assetsignore exclut les .map'`, `'package.json expose build:web, dev:web, deploy:web'`.
- [ ] **Step 2: Run** `pnpm exec vitest run __tests__/web-deploy.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** les fichiers et scripts.
- [ ] **Step 4: Verify** `pnpm build:web && pnpm exec wrangler deploy --dry-run -c worker/wrangler.toml` — Expected: la validation de la configuration réussit sans erreur ; `dist/` ne contient pas de `.map` dans la liste des assets listés par le dry-run.
- [ ] **Step 5: Commit** `git commit -m "Add headers and scripts to deploy the web build"`

### Task 12: E2E web, documentation et vérifications manuelles

**Files:**
- Create: `__tests__/e2e/web.spec.js`
- Modify: `playwright.config.ts`, `README.md`, `CLAUDE.md`

**Interfaces:**
- `playwright.config.ts` : `webServer` devient un tableau avec un second serveur `pnpm build:web && pnpm exec vite preview --mode web --host 127.0.0.1` sur le port 4173 ; nouveau projet `web` (`devices['Desktop Chrome']`, `baseURL: 'http://127.0.0.1:4173'`, `testMatch: 'web.spec.js'`) ; les projets existants reçoivent `testIgnore: ['**/web.spec.js']`. `web.spec.js` utilise le `test` de base de Playwright **sans** faux `__TAURI_INTERNALS__` et simule `/api/*` avec `page.route`.

- [ ] **Step 1: Write failing tests** `web.spec.js` : 
  - `'les clés saisies survivent au rechargement et ne sont lisibles ni dans localStorage ni dans IndexedDB'` ;
  - `'« Effacer mes clés » vide les champs et le coffre'` ;
  - `'traduit avec les deux moteurs : /api reçoit les bons en-têtes, jamais de clé dans l'URL'` ;
  - `'le manifest est servi et valide ; le service worker s'enregistre'` ;
  - `'/api n'est jamais servi depuis le cache : deux traductions = deux requêtes réseau'` ;
  - `'hors ligne : l'application s'ouvre et la traduction affiche une erreur réseau'` (`context.setOffline(true)`) ;
  - `'après un déploiement simulé, l'ancienne version reste active jusqu'à fermeture'` (vérifie `registration.waiting` sans prise de contrôle immédiate) ;
  - `'UA Windows ou Android : lien natif et pas de bouton Installer'`, `'UA iPhone : instructions iOS'` (contexte Chromium avec `userAgent` surchargé).
- [ ] **Step 2: Run** `pnpm exec playwright test --project=web` — Expected: FAIL.
- [ ] **Step 3: Implement** la config Playwright ; corriger ce que les tests révèlent dans le code des tâches précédentes.
- [ ] **Step 4: Documentation** — `README.md` : section web **en FR puis en EN** (usage, déploiement `pnpm deploy:web`, installation PWA par plateforme, limite du chiffrement, logs du Worker désactivés, clés à ressaisir dans la PWA iOS). `CLAUDE.md` : commandes `build:web`/`dev:web`/`deploy:web`, `worker/` et `src/js/web/` dans *Architecture*, règle « la bascule web est dans `src/tauri/core.js` et `store.js` », mise à jour du point sur les clés en clair (chiffrées sur le web), mention de `isTauri` dans la fixture E2E.
- [ ] **Step 5: Run the whole suite** — `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm test:e2e` — Expected: tout PASS, seuils de couverture tenus. Aussi `cargo test` depuis `src-tauri/` — Expected: inchangé, PASS.
- [ ] **Step 6: Manual verification (non automatisable)** — après `pnpm deploy:web` : (a) Safari iOS : *Partager › Sur l'écran d'accueil*, l'application s'ouvre en plein écran, les clés sont à ressaisir ; (b) Safari macOS : *Fichier › Ajouter au Dock* ; (c) Chrome sur macOS ou Linux : le bouton « Installer » apparaît et installe ; (d) Chrome sur Windows/Android : aucune invitation PWA, lien vers la dernière release ; (e) une vraie traduction DeepL et Lara avec de vraies clés ; (f) en-têtes CSP présents (`curl -I`) ; (g) aucun fichier `.map` accessible.
- [ ] **Step 7: Commit** `git commit -m "Add web E2E tests and document the web build"`

---

## Auto-revue

**Couverture du spec** : architecture et unités 1-7 → tâches 1-6 ; sécurité du Worker → 1, 3 ; CSP et en-têtes → 11 ; Sentry → 8 ; limite du chiffrement et « Effacer mes clés » → 7, 12 ; PWA (manifest, icônes, service worker, outillage, invitation, CSP, coffre) → 9, 10, 11 ; fonctions propres à Tauri → voir ci-dessous ; tests → chaque tâche + 12 ; livrables et documentation → 11, 12.

**Écarts et points ouverts à connaître** :
- *Bascule du stockage* dans `src/tauri/store.js` plutôt que dans `settings.js` (tâche 5), pour laisser `settings.js` intact.
- *Hébergement* : le spec disait « Pages sert le front, le Worker répond sur `/api/*` ». Le plan utilise un seul Worker avec assets statiques (`[assets]` + `run_worker_first`), même domaine et même origine, un seul `wrangler deploy`. À confirmer avec la documentation Cloudflare actuelle à la tâche 3.
- *Activation du service worker* : sans `skipWaiting`, la nouvelle version s'active quand l'application est fermée puis rouverte (le spec disait « au rechargement suivant »).
- *Fonctions propres à Tauri* : la recherche dans `src/` montre que `updater`, `window-state` et `process` ne sont pas appelés par le code applicatif, `installAndroidTts()` ne s'active que si `window.AndroidTts` existe (le TTS web utilise `speechSynthesis`), le verrou d'orientation utilise `native.TraducteurOrientation?.set` (déjà optionnel) et `report()` avale l'échec de `plugin-log`. Aucune garde supplémentaire n'est donc nécessaire ; `instrument.js` garde son `isTauri` importé directement (exception existante).
- *E2E existants* : leur faux Tauri ne définissait pas `window.isTauri` ; la fixture est corrigée à la tâche 5.
- *Sentry* : les breadcrumbs `fetch` du SDK ne contiennent pas les en-têtes par défaut ; le filtre de la tâche 8 est une protection défensive.

**Cohérence des types** : `TranslateBody` (tâche 1) est consommé par la tâche 2 ; `isTauriRuntime` (tâche 5) par 6, 7, 9, 10 ; `webStoreGet` (tâche 5) par 6 ; `vault*` (tâche 4) par 5 et 7 ; mêmes noms d'en-têtes dans le tableau du protocole, la tâche 1 (`requireHeader`), la tâche 2 et la tâche 6.

**Proportion** : le plan reste sous forme de signatures, noms de tests et assertions ; aucun corps de fonction n'est écrit.
