# Version web de Ponto — design

Date : 2026-10-05 · Statut : en attente de relecture

## Objectif

Rendre Ponto accessible comme site web public, avec les mêmes moteurs (DeepL, Lara, seuls ou côte à côte) que l'application Tauri (Windows, Android).

## Décisions validées

- **Public** : n'importe qui ouvre le site.
- **Clés de chaque utilisateur** : chaque visiteur saisit ses propres clés DeepL / Lara. Elles ne sont jamais stockées en clair. Les clés de l'auteur ne sont pas utilisées.
- **Approche A** : proxy sans état sur Cloudflare Workers + adaptateur de transport côté front. Pas de serveur à maintenir.
- **Hébergement** : Cloudflare Pages sert le front (`dist/`), un Worker répond sur `/api/*` du même domaine (même origine, pas de CORS).

## Hors périmètre

- Comptes, quotas, authentification.
- Clés de l'auteur côté serveur.
- Déploiement automatisé en CI (déploiement manuel avec `wrangler`).
- Notifications push, synchronisation en arrière-plan, et mode hors ligne de la traduction elle-même (elle exige le réseau).
- Toute modification du comportement de l'application Tauri.

## Contraintes

- L'application Windows et Android continue de fonctionner à l'identique.
- La règle « tout accès Tauri passe par `src/tauri/` » est conservée.
- JSDoc obligatoire (`strict` + `checkJs`), 2 espaces, guillemets simples, i18n via `MESSAGES` (vouvoiement), seuils de couverture 80/75/80/80.
- README bilingue : FR et EN mis à jour ensemble.
- Aucune clé ne doit apparaître dans une URL, un journal ou un événement Sentry.

## Architecture

```
Navigateur (Pages)                         Cloudflare Worker (/api/*)
──────────────────                         ──────────────────────────
main.js ─ tauriInvoke(cmd, args)           POST /api/translate/deepl
   ├─ dans Tauri → invoke() (inchangé)     POST /api/translate/lara
   └─ sur le web → src/js/web/backend.js      POST /api/languages/deepl
        ├─ clés déchiffrées en mémoire     POST /api/languages/lara
        └─ fetch('/api/…', clés en en-tête)
```

Le front n'appelle le backend qu'à un endroit : `tauriInvoke(command, args)` (`src/tauri/core.js`), avec quatre commandes : `translate_deepl`, `translate_lara`, `deepl_languages`, `lara_languages`.

### Unités

1. **`src/tauri/core.js`** : hors Tauri (`isTauri()` faux), `tauriInvoke` délègue à l'adaptateur web au lieu de lever une erreur. Seul changement du chemin existant.
2. **`src/js/web/backend.js`** (nouveau) : traduit `(commande, args)` en `fetch` vers le Worker. Lit les clés dans le coffre et les place dans des en-têtes. Lève la chaîne d'erreur française renvoyée par le Worker, comme le fait `invoke()` pour une commande Rust en échec, de sorte que `errors.js` fonctionne sans changement.
3. **`src/js/web/vault.js`** (nouveau) : coffre de clés chiffrées. AES-GCM via Web Crypto ; la `CryptoKey` est non extractible et persistée en IndexedDB (seul moyen de persister une clé non extractible) ; texte chiffré + IV stockés avec elle. API : `get`, `set`, `clear`. Une clé perdue (données du site effacées, autre navigateur) rend le coffre illisible : les clés sont redemandées sans erreur cryptique.
4. **Persistance des réglages** : sur le web, un stockage `localStorage` remplace `plugin-store` pour les réglages non secrets. `settings.js` passe par le coffre pour `deeplKey`, `laraId`, `laraSecret`. `DEFAULTS` et la migration `direction` ne changent pas.
5. **`worker/`** (nouveau, TypeScript) : reprend la logique de `translate.rs` et `lara.rs` :
   - URL DeepL gratuite ou pro selon le suffixe `:fx` de la clé ;
   - formalité DeepL (`prefer_more` / `prefer_less`) et instructions Lara (`LARA_FORMAL` / `LARA_INFORMAL`) ;
   - authentification Lara : `POST /v2/auth` signé en HMAC-SHA256 (challenge `méthode\nchemin\nContent-MD5\ncontent-type\ndate`) avec `crypto.subtle`, puis `Bearer` ; un 401 déclenche une réauthentification et un seul nouvel essai ;
   - lecture de la dernière ligne JSON valide de la réponse Lara (flux NDJSON), comme `call_once`.
6. **Jeton Lara** : non conservé entre requêtes, ou au plus en mémoire d'isolate, indexé par un hash de (id + secret). Jamais indexé par l'id seul : un cache par id permettrait à quiconque connaît l'id d'un tiers de réutiliser son jeton sans connaître le secret.
7. **Hébergement** : un seul domaine. Pages sert `dist/`, le Worker répond sur `/api/*`.

## PWA installable (iOS, iPadOS, macOS, Linux)

**Intention** : proposer l'installation aux appareils qui n'ont pas d'application native. Windows (`.exe`) et Android (`.apk`) en ont une : le site n'y affiche **aucune** invitation à installer la PWA et renvoie vers le téléchargement natif : `https://github.com/avuillet93TheFrenchy/Ponto/releases/latest` (toujours la dernière release, contrairement à un lien épinglé sur `v1.0.0`). La release v1.0.0 contient `ponto_1.0.0_x64-setup.exe` (Windows), `Ponto-release.apk` (Android) et `latest.json` (updater) ; le lien est vérifié accessible le 2026-10-05. Le navigateur peut malgré tout proposer sa propre installation : on ne peut pas l'empêcher et on ne cherche pas à le faire.

**Composants** :

1. **Manifest** (`manifest.webmanifest`) : nom, `short_name`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, couleurs de thème alignées sur `style.scss`, icônes 192 et 512 px, plus une variante `maskable`. `lang` fixé sur `fr` (le contenu suit `setUiLanguage()`).
2. **Icônes** : générées depuis `public/logo.svg` (PNG 192/512, maskable, et `apple-touch-icon` 180 px pour iOS). Le maskable reprend le principe du « P seul » de l'icône adaptative Android pour éviter le logo complet rogné.
3. **Service worker** : mise en cache de la coquille de l'application (HTML, JS, CSS, polices, icônes) pour un démarrage rapide et une ouverture hors ligne. Il ne met **jamais** `/api/*` en cache et n'intercepte pas ces requêtes : ni clés, ni texte traduit ne sont conservés. Hors ligne, l'interface s'ouvre et la traduction affiche une erreur réseau claire (nouvelle chaîne i18n, règle dans `errors.js` si besoin). Mise à jour : nouvelle version activée au rechargement suivant, sans `skipWaiting` forcé qui remplacerait l'application en cours d'usage.
4. **Outillage** : `vite-plugin-pwa` (génère le manifest et le service worker avec la liste hachée des assets). Activé **uniquement pour le build web** (mode `web`), pas pour le build Tauri : le `dist/` du `.exe` et de l'`.apk` ne contient ni service worker ni manifest. L'enregistrement du service worker est de toute façon gardé par `!isTauri()`.
5. **Invitation à installer** (`src/js/web/install.js`, nouveau) : détecte la plateforme (`navigator.userAgentData` quand il existe, sinon l'agent utilisateur) et n'agit que hors Windows, Android et Tauri, et hors mode déjà installé (`display-mode: standalone`, `navigator.standalone` sur iOS).
   - Chromium sur macOS/Linux : capte `beforeinstallprompt` et propose un bouton « Installer ».
   - Safari iOS/iPadOS et Safari macOS : pas d'événement d'installation ; affiche une courte explication (« Partager › Sur l'écran d'accueil » / « Fichier › Ajouter au Dock »).
   - Le choix « Plus tard » est mémorisé dans `localStorage` (par appareil, sans importance si la valeur est perdue).
6. **CSP / en-têtes** (`_headers`) : ajout de `manifest-src 'self'` et `worker-src 'self'`. Le fichier du service worker est servi sans cache long (`Cache-Control: no-cache`).
7. **Coffre de clés** : inchangé. Une PWA installée a son propre stockage ; sur Safari, une PWA ajoutée à l'écran d'accueil ne partage pas le coffre du navigateur : les clés y sont à ressaisir. Le texte de l'invitation à installer le mentionne.

**Point à vérifier** : sur iOS, le stockage IndexedDB (donc le coffre) peut être purgé par Safari après une période sans usage hors PWA installée. Le comportement « coffre illisible → on redemande les clés » couvre ce cas.

## Sécurité du Worker (public)

- Destinations fixes : `api.deepl.com`, `api-free.deepl.com`, `api.laratranslate.com`. Le client ne fournit jamais d'URL (pas de SSRF).
- Méthode POST uniquement, corps JSON borné, longueur de texte plafonnée, codes de langue validés par motif.
- En-têtes `Origin` / `Sec-Fetch-Site` : même origine exigée.
- Limitation de débit par IP (rate limiting Cloudflare). But : protéger le quota Workers de l'auteur.
- Clés dans des en-têtes personnalisés (`X-Deepl-Key`, `X-Lara-Id`, `X-Lara-Secret`), jamais dans l'URL ni le corps. Aucun `console.log` de requête ou d'en-tête ; logs de requêtes du Worker désactivés dans `wrangler.toml`, ce que le README consigne.
- Erreurs : `{ "error": "<texte français>" }` + statut HTTP, mêmes textes que le Rust pour que le mapping de `errors.js` continue de fonctionner. Aucun écho de clé ni d'en-tête `Authorization`. Tout texte nouveau demande une règle dans `errors.js`.

## CSP et en-têtes du site

Fichier `_headers` de Pages, aussi strict que celle de `tauri.conf.json` : pas de script inline ni tiers, `connect-src 'self'` **plus l'hôte d'ingestion Sentry** (Sentry émet depuis le navigateur sur le web), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, et pour la PWA `manifest-src 'self'` et `worker-src 'self'`.

## Sentry

`instrument.js` utilise déjà `VITE_SENTRY_DSN` hors Tauri. Ajouter un `beforeSend` / filtrage des breadcrumbs `fetch` pour qu'aucun événement ne contienne `X-Deepl-Key`, `X-Lara-Id` ni `X-Lara-Secret`.

## Limite assumée du chiffrement

Le chiffrement protège le stockage au repos (lecture du disque, de `localStorage`, export des données du site). Il ne protège pas contre un XSS sur le même domaine, qui pourrait utiliser la clé déchiffrée. Le texte des réglages et le README web le disent. Un bouton « Effacer mes clés » vide le coffre. Les nouvelles chaînes passent par `MESSAGES` (`[fr, en]`).

## Fonctions propres à Tauri — à vérifier à l'implémentation

Je n'ai pas encore lu tous les appels. À contrôler dans le code avant de conclure ; chacun doit être ignoré ou masqué hors Tauri sans erreur :

- mise à jour automatique, restauration de fenêtre, redémarrage (`updater`, `window-state`, `process`) ;
- lecture à voix haute : `speechSynthesis` du navigateur sur le web ; `tts-android.js` ne s'active que si `window.AndroidTts` existe ;
- verrou d'orientation (`window.TraducteurOrientation`) ;
- `plugin-log` : `report()` avale déjà l'échec ;
- toute importation directe de `@tauri-apps/api/core` hors `src/tauri/` (`instrument.js` l'utilise pour `isTauri`).

## Tests

- **Vitest** : `vault.js` avec `fake-indexeddb` (jsdom n'a pas IndexedDB) ; `backend.js` avec `fetch` simulé ; `core.js` pour la bascule Tauri/web. Tests typés (JSDoc).
- **Worker** : signature Lara contre des vecteurs connus, sélection d'URL DeepL, validations, format d'erreur, absence de clé dans les réponses.
- **E2E Playwright** : nouveau projet « web » sans faux `__TAURI_INTERNALS__`, `/api/*` simulé par `page.route`. Cas : saisie des clés, rechargement (les clés survivent et ne sont pas lisibles dans `localStorage`), effacement, traduction des deux moteurs.
- **PWA** : tests Vitest de `install.js` (détection de plateforme : aucune invitation sur Windows, Android et Tauri ; `beforeinstallprompt` capté ; instructions iOS/Safari ; déjà installé), et du garde `!isTauri()` de l'enregistrement du service worker. E2E : le manifest est servi et valide, le service worker s'enregistre en mode web, `/api/*` n'est jamais servi depuis le cache, et le build Tauri ne contient ni manifest ni service worker. L'installation réelle sur iOS et macOS ne s'automatise pas : vérification manuelle listée dans le plan.
- **Couverture** : seuils 80/75/80/80 sur les nouveaux fichiers.

## Livrables

- Code : `src/js/web/` (dont `install.js`), `worker/`, adaptation de `core.js`, `settings.js`, `instrument.js`, `vite.config.ts` (mode `web` + PWA), `_headers`, `wrangler.toml`, icônes PWA dans `public/`.
- Scripts : `pnpm dev:web` / `pnpm build:web` / `pnpm deploy:web` (noms à confirmer au plan).
- Dépendances : `wrangler`, `fake-indexeddb` et `vite-plugin-pwa` en devDependencies ; versions épinglées selon la politique du dépôt (releases de plus de 7 jours).
- Documentation : README FR + EN (usage web, installation PWA par plateforme, limites du chiffrement, logs désactivés), CLAUDE.md (architecture web, `worker/`, règle d'accès).
