# Clés d'accès de l'app (prototype) : YKV-....

L'APK parle au serveur Yekiva avec un header `x-app-token` (abus limités,
pas une vraie authentification — la clé est lisible dans l'app). Au lieu d'un
secret unique partagé, le serveur accepte des clés **YKV-PPPP-PPPP-PPPP-CC**
(12 caractères aléatoires + 2 de contrôle).

## Côté serveur (VPS)

1. `APP_TOKEN=votre-secret` dans `server/.env` (ou vide = ouvert, dev uniquement).
2. Le serveur accepte : le `APP_TOKEN` exact (comportement historique), **ou**
   n'importe quelle clé YKV bien formée (distribution multi-clés du prototype).
3. La formule de contrôle vit **obfusquée** dans `server/src/apptoken.js`
   (alphabet reconstruit, constantes éclatées) : le dépôt hackathon public
   n'expose pas la formule en clair. La validation est 100 % serveur —
   l'app ne contient aucune logique de clé.

## Émettre des clés (offline, machine privée)

```sh
node tools/make-key.mjs 5   # imprime 5 clés, à stocker en privé
```

## Côté build APK (une clé par build)

```sh
node tools/build-config.mjs --api https://votre-serveur.com --token YKV-....-....-....-..
```

## Limites assumées (prototype)

- Une clé extraite de l'APK est réutilisable : changer `APP_TOKEN` ne révoque
  pas les clés YKV déjà émises (révocation par liste = chantier prod).
- L'obfuscation freine la lecture curieuse, pas la rétro-ingénierie déterminée.
  La vraie sécurité viendra des comptes utilisateurs + HTTPS + rate-limit
  (déjà en place : 30 req/min/IP).
