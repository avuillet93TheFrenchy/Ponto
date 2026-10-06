<p align="center">
  <img src="public/logo.svg" alt="Logo Ponto / Ponto logo" width="128" height="128">
</p>

# Ponto

🇫🇷 [Français](#français) · 🇬🇧 [English](#english)

---

## Français

Application de traduction multilingue développée avec Tauri 2, utilisant les moteurs DeepL et Lara.

### Présentation

Ponto s'appuie sur deux moteurs de traduction : **DeepL** et **Lara**. Vous pouvez en utiliser un seul ou les deux en parallèle pour comparer leurs traductions.

### Clés API

Pour utiliser l'application, vous avez besoin d'un compte et d'une clé API pour chaque moteur que vous souhaitez utiliser :

- DeepL :
  - Créer un compte : <https://auth.deepl.com/signup>
  - Tarifs de l'API : <https://www.deepl.com/en/pro#api>
- Lara :
  - Créer un compte : <https://app.laratranslate.com/sign-up>
  - Tarifs : <https://app.laratranslate.com/pricing?billing=monthly>

Une fois connecté à votre compte, créez votre clé API depuis les paramètres du compte.

Les clés se saisissent dans les paramètres de l'application et sont stockées en local, en clair, dans le fichier `settings.json` de l'appareil utilisé (application Windows et Android). Sur le site web, elles sont chiffrées dans le navigateur (voir « Version web »).

### Utilisation

#### Windows

- Avec un seul moteur (DeepL ou Lara) : deux panneaux, un pour le texte source et un pour la traduction.
- Avec les deux moteurs : quatre panneaux, deux pour le texte source et deux pour les traductions, afin de les comparer.

#### Android

Le fonctionnement est identique, avec une différence :

- en mode paysage, les deux moteurs sont utilisés ;
- en mode portrait, un seul moteur est utilisé.

### Version web

Ponto est aussi disponible comme site web, installable en application (PWA) sur iOS, iPadOS, macOS et Linux. Sur Windows et Android, utilisez plutôt l'application native : <https://github.com/avuillet93TheFrenchy/Ponto/releases/latest>.

- **Utilisation** : ouvrez le site, saisissez vos clés dans les paramètres, puis traduisez comme dans l'application. Vos clés sont chiffrées (AES-GCM) dans le navigateur ; le Worker Cloudflare qui relaie les requêtes vers DeepL et Lara ne conserve rien et ses journaux de requêtes sont désactivés. Les clés voyagent dans des en-têtes, jamais dans une URL.
- **Limite du chiffrement** : il protège le stockage au repos, pas contre un script malveillant exécuté sur la même origine. Le bouton « Effacer mes clés » des paramètres supprime les clés et la clé de chiffrement.
- **Clés à ressaisir** : dans l'application installée sur iOS (stockage séparé de Safari) et après un effacement des données du site.
- **Mises à jour** : quand une nouvelle version est publiée, un bandeau « Mise à jour disponible » apparaît ; « Mettre à jour » l'active et recharge la page (pensez à copier un texte en cours avant).
- **Installation** : iOS et iPadOS, Partager › Sur l'écran d'accueil ; Safari sur macOS, Fichier › Ajouter au Dock ; Chrome, Edge ou Chromium, bouton « Installer » du site ou icône dans la barre d'adresse.
- **Déploiement** : `pnpm deploy:web` construit le site et le publie avec Wrangler (un seul Worker sert `dist/` et `/api/*`). Il faut un compte Cloudflare et `wrangler login`. Avec `NODE_ENV=production`, ce que fait `deploy:web`, la compilation envoie aussi les source maps à Sentry (jeton dans `.env.sentry-build-plugin`). En local : `pnpm dev:web`.

### Confidentialité

Les textes que vous saisissez sont envoyés à DeepL et/ou à Lara pour être traduits. Leurs conditions d'utilisation et leurs politiques de confidentialité s'appliquent. Évitez de saisir des informations sensibles si ces conditions ne vous conviennent pas.

### Gestion des bugs

L'application utilise [Sentry](https://sentry.io) pour détecter et analyser les bugs rencontrés dans l'application. Lorsqu'une erreur survient, un rapport technique peut être envoyé à Sentry afin d'aider l'auteur à la corriger. La politique de confidentialité de Sentry s'applique.

Vous pouvez aussi signaler un problème en ouvrant une [issue](https://github.com/avuillet93TheFrenchy/Ponto/issues) sur GitHub.

### Licence et contributions

© 2026 Alexandre Vuillet ([avuillet93TheFrenchy](https://github.com/avuillet93TheFrenchy)).

Ce projet est distribué sous licence [Apache 2.0](LICENSE).

Vous pouvez utiliser, modifier et redistribuer ce code, à condition de :

- conserver la licence et les mentions de copyright ;
- indiquer les fichiers que vous avez modifiés ;
- reprendre le contenu du fichier [NOTICE](NOTICE), qui désigne Ponto comme projet initial ;
- ne pas utiliser le nom « Ponto » ni le nom de l'auteur pour promouvoir un dérivé.

Ce projet est maintenu uniquement par son auteur. Les pull requests sont les bienvenues, mais seul l'auteur décide de leur intégration. Toute contribution envoyée au projet est soumise à la licence Apache 2.0.

### Avertissement

Ponto est un projet indépendant. Il n'est affilié ni à DeepL ni à Lara. Ces noms appartiennent à leurs propriétaires respectifs.

---

## English

Multilingual translation app built with Tauri 2, using the DeepL and Lara engines.

### Overview

Ponto relies on two translation engines: **DeepL** and **Lara**. You can use just one, or both side by side to compare their translations.

### API keys

To use the app, you need an account and an API key for each engine you want to use:

- DeepL:
  - Create an account: <https://auth.deepl.com/signup>
  - API pricing: <https://www.deepl.com/en/pro#api>
- Lara:
  - Create an account: <https://app.laratranslate.com/sign-up>
  - Pricing: <https://app.laratranslate.com/pricing?billing=monthly>

Once signed in to your account, create your API key from the account settings.

Keys are entered in the app's settings and are stored locally, in plain text, in the `settings.json` file on the device you are using (Windows and Android apps). On the website, they are encrypted in the browser (see "Web version").

### Usage

#### Windows

- With one engine (DeepL or Lara): two panels, one for the source text and one for the translation.
- With both engines: four panels, two for the source text and two for the translations, for comparison.

#### Android

It works the same way, with one difference:

- in landscape mode, both engines are used;
- in portrait mode, only one engine is used.

### Web version

Ponto is also available as a website, installable as an app (PWA) on iOS, iPadOS, macOS and Linux. On Windows and Android, use the native app instead: <https://github.com/avuillet93TheFrenchy/Ponto/releases/latest>.

- **Usage**: open the site, enter your keys in the settings, then translate as in the app. Your keys are encrypted (AES-GCM) in the browser; the Cloudflare Worker that relays requests to DeepL and Lara keeps nothing and its request logs are disabled. Keys travel in headers, never in a URL.
- **Encryption limit**: it protects storage at rest, not against a malicious script running on the same origin. The "Erase my keys" button in the settings removes the keys and the encryption key.
- **Keys to re-enter**: in the installed iOS app (storage separate from Safari) and after site data is cleared.
- **Updates**: when a new version is published, an "Update available" banner appears; "Update" activates it and reloads the page (copy any text in progress first).
- **Installation**: iOS and iPadOS, Share › Add to Home Screen; Safari on macOS, File › Add to Dock; Chrome, Edge or Chromium, the site's "Install" button or the address-bar icon.
- **Deployment**: `pnpm deploy:web` builds the site and publishes it with Wrangler (a single Worker serves `dist/` and `/api/*`). It needs a Cloudflare account and `wrangler login`. With `NODE_ENV=production`, which `deploy:web` sets, the build also uploads source maps to Sentry (token in `.env.sentry-build-plugin`). Locally: `pnpm dev:web`.

### Privacy

The text you enter is sent to DeepL and/or Lara to be translated. Their terms of service and privacy policies apply. Avoid entering sensitive information if you are not comfortable with those terms.

### Bug tracking

The app uses [Sentry](https://sentry.io) to detect and analyze in-app bugs. When an error occurs, a technical report may be sent to Sentry to help the author fix it. Sentry's privacy policy applies.

You can also report a problem by opening an [issue](https://github.com/avuillet93TheFrenchy/Ponto/issues) on GitHub.

### License and contributions

© 2026 Alexandre Vuillet ([avuillet93TheFrenchy](https://github.com/avuillet93TheFrenchy)).

This project is licensed under the [Apache License 2.0](LICENSE).

You may use, modify and redistribute this code, provided that you:

- keep the license and copyright notices;
- state which files you have modified;
- include the contents of the [NOTICE](NOTICE) file, which identifies Ponto as the original project;
- do not use the name "Ponto" or the author's name to promote a derivative work.

This project is maintained solely by its author. Pull requests are welcome, but only the author decides whether to merge them. Any contribution submitted to the project is licensed under Apache 2.0.

### Disclaimer

Ponto is an independent project. It is not affiliated with DeepL or Lara. These names belong to their respective owners.
