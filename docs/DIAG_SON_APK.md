# Diagnostiquer le son dans l'APK installée (sans clavier, sans console)

Oubliez `?debug=1` et `YEKIVA.voice()` : c'est pour le navigateur (Termux/dev)
uniquement. Dans l'APK installée on ne peut ni modifier l'URL ni ouvrir la
console. Tout se fait **au doigt**.

## Le chemin tactile (2 tapes)

1. Ouvrez l'app, choisissez langue + adulte/enfant, arrivez sur **Mon parcours**.
2. En bas, 4e bouton : **« son ? »** (icône musique) → écran **« Son et voix »**.

## Les 3 tests, dans l'ordre

| Bouton | Ce qu'il prouve | Si ✅ | Si ❌ |
|---|---|---|---|
| **1 · bip** | le haut-parleur sort un son | passez au 2 | montez le volume, quittez le mode silencieux/vibreur, réessayez. Si toujours rien : problème audio Android (pas l'app) |
| **2 · voix téléphone** | la synthèse vocale de secours parle | le son de base marche ; si les leçons restent muettes c'est le serveur (test 3) | installez **« Synthèse vocale Google »** (Play Store), puis dans Réglages Android → Langue → Synthèse vocale → choisissez-la + installez la voix française |
| **3 · voix serveur** | la voix naturelle Yekiva répond | tout est bon, les leçons doivent parler | lisez le message affiché (c'est le vrai diagnostic) |

## Lire le message du test 3 (c'est lui le diagnostic)

- **« Serveur NON configuré : cet APK a été construit sans --api »**
  → l'APK ne connaît aucune adresse serveur. Il faut **reconstruire** :
  secret GitHub `YEKIVA_SERVER_URL=https://votre-serveur`, `git push`,
  réinstaller l'APK. Aucun réglage dans l'app ne peut compenser.
- **« serveur injoignable (Failed to fetch / timeout / …) »**
  → l'adresse est bakée mais le téléphone ne l'atteint pas : Wi-Fi/4G coupé ?
  serveur éteint ? URL en `http://` bloquée ? HTTPS mal configuré ?
  Testez la même URL dans Chrome du téléphone : `https://votre-serveur/health`
  doit afficher `{"ok":true}`.
- **« le serveur ne renvoie aucun audio / HTTP 401 / 502 »**
  → le serveur est joint mais refuse : `APP_TOKEN` différent entre l'APK
  (secret GitHub) et `server/.env` ? clé MMS manquante côté serveur ?
  Regardez les logs du serveur.
- **« voix du serveur entendue »** mais leçons muettes ensuite
  → le serveur marche, c'est le cache/lecture : bouton **« erreurs »**
  (voir ci-dessous) puis rejouez une leçon.

## Bouton « erreurs » (bandeau de debug, tactile aussi)

Dans l'écran « Son et voix », bouton **« erreurs »** : affiche le bandeau
avec chaque erreur en clair (ex. `serveur Yekiva injoignable: https://…`).
Bouton **« voir »** = détail, **« tout effacer »** = vide, **« off »** = cache.

Autre accès : écran d'accueil, **5 tapes rapides sur le logo « Yekiva »**
(< 3 secondes) = affiche/cache le bandeau.

## Cas rapides

- **Aucun son nulle part, même le bip** → volume / silencieux / Bluetooth
  (enceinte connectée ?). Pas un bug Yekiva.
- **Bip OK, voix téléphone OK, serveur KO** → les leçons parlent avec la voix
  robot du téléphone (normal hors-ligne) ; la voix naturelle reviendra avec
  le serveur.
- **Tout est ✅ mais une leçon reste muette** → notez laquelle
  (langue + nom de leçon), bouton « erreurs », capture d'écran, envoyez-la
  avec le message affiché.
- **Après réinstallation ça remarche puis se tait** → le cache audio
  (IndexedDB) a pu se corrompre : le test 3 régénère une phrase neuve et
  suffit à le prouver.

## Pour le développeur (résumé technique)

- `screens/diag.js` : 3 boutons → `speaker.testBeep/testPhoneVoice/testServerVoice`.
- `core/debug.js` : `mount(force)` + `toggle()`, exposé en `YEKIVA.debugToggle()`.
- `screens/start.js` : 5 tapes < 3 s sur le logo = toggle du bandeau.
- `screens/path.js` : 4e action « son ? » → écran `diag`.
- Termux/navigateur gardent `?debug=1` + `YEKIVA.voice()` (inchangés).
