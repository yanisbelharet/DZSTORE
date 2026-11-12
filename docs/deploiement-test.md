# Guide — environnement de test gratuit (Vercel + Neon)

> Environnement **de test, non commercial** (ADR-0013, ADR-0025) : aucune vente réelle, aucune
> dépense publicitaire. Toutes les pages affichent « Environnement de test » et ne sont pas
> indexées par les moteurs de recherche. La production se fera sur un VPS avant toute vente.

Deux façons de faire :

- **Le plus simple** : crée les comptes (étape 1), puis donne à Claude un jeton Vercel et une
  clé d'API Neon depuis claude.ai sur un ordinateur (formulaire sécurisé, jamais dans le chat).
  Claude fait le reste.
- **À la main** : suis les étapes 1 à 7 (environ 20 minutes).

Résultat attendu :

| Service | Adresse |
|---|---|
| Admin (OMS) | `https://dzstore-admin.vercel.app` |
| Boutique « Beauté Démo » | `https://dzstore-beaute.vercel.app` (arabe, `/fr/` en français) |
| Boutique « Maison Démo » | `https://dzstore-maison.vercel.app` (arabe) |
| API | `https://dzstore-api.vercel.app` (pas de page : `/health` répond `{"status":"ok"}`) |

Si l'un de ces noms est déjà pris sur Vercel, choisis-en un autre et signale-le à Claude :
l'adresse de l'API est écrite dans `apps/admin/vercel.json`.

---

## 1. Comptes (une seule fois)

1. **Vercel** : <https://vercel.com/signup> → offre **Hobby** → « Continue with GitHub ».
   Autorise l'accès au dépôt `yanisbelharet/DZSTORE`.
2. **Neon** : le plus simple est de passer par Vercel (étape 3), qui crée le compte Neon et
   branche la base automatiquement.

## 2. Secrets à générer

Quatre valeurs secrètes, à ne **jamais** mettre dans le dépôt ni dans le chat. Sur un ordinateur
avec Node.js :

```bash
node -e "const c=require('node:crypto');console.log('APP_ENCRYPTION_KEYS=1:'+c.randomBytes(32).toString('base64'));for(const n of ['TICK_SECRET','STORE_SERVICE_TOKEN'])console.log(n+'='+c.randomBytes(32).toString('base64url'))"
```

Puis choisis `SEED_DEMO_PASSWORD` : un mot de passe d'au moins 12 caractères, pour tous les
comptes de démonstration de l'environnement de test. Garde ces valeurs dans ton gestionnaire de
mots de passe.

## 3. Projet API (`dzstore-api`) et base Neon

1. Vercel → **Add New… → Project** → importe `DZSTORE`.
2. **Project Name** : `dzstore-api`. **Root Directory** : `apps/api` (laisse cochée l'option
   qui inclut les fichiers hors de ce dossier). Framework : *Other*. Les commandes viennent de
   `apps/api/vercel.json`, ne les modifie pas.
3. **Environment Variables** (Production) :

   | Variable | Valeur |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DEPLOYMENT_ENVIRONMENT` | `test` |
   | `NODEJS_HELPERS` | `0` |
   | `TRUST_PROXY` | `1` (un seul proxy de confiance : Vercel) |
   | `LOG_LEVEL` | `info` |
   | `APP_ENCRYPTION_KEYS` | (étape 2) |
   | `TICK_SECRET` | (étape 2) |
   | `STORE_SERVICE_TOKEN` | (étape 2) |
   | `SEED_ON_DEPLOY` | `true` (pour le premier déploiement) |
   | `SEED_DEMO_PASSWORD` | (étape 2) |
   | `SEED_STORE_HOSTS` | `demo-beaute=dzstore-beaute.vercel.app,demo-maison=dzstore-maison.vercel.app` |

4. Deploy. Le premier déploiement échoue tant qu'il n'y a pas de base : c'est normal.
5. Dans le projet → **Storage → Create Database → Neon** (offre Free, région la plus proche :
   Francfort `eu-central-1`) → connecte-la à `dzstore-api`. Neon ajoute `DATABASE_URL` (poolée)
   et `DATABASE_URL_UNPOOLED` (directe).
6. **Settings → Git → Production Branch** : `claude/vibrant-allen-p2e3je` (chaque push de Claude
   redéploie).
7. **Deployments → Redeploy**. Le journal doit montrer les migrations, puis « Seed … done », puis
   le bundle. Vérifie `https://dzstore-api.vercel.app/health` → `{"status":"ok"}` et
   `/ready` → `"database":"ok"`.
8. Remets `SEED_ON_DEPLOY` à `false` (le seed est idempotent, mais il remettrait les comptes de
   démo à leur état initial à chaque déploiement).

## 4. Projet store (`dzstore-store`)

1. Nouveau projet depuis `DZSTORE`, **Project Name** `dzstore-store`, **Root Directory**
   `apps/store`, framework *Astro* (commandes dans `apps/store/vercel.json`).
2. Variables (Production) :

   | Variable | Valeur |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DEPLOYMENT_ENVIRONMENT` | `test` |
   | `STORE_API_URL` | `https://dzstore-api.vercel.app` |
   | `STORE_SERVICE_TOKEN` | même valeur que dans `dzstore-api` |
   | `ASTRO_TELEMETRY_DISABLED` | `1` |

3. **Settings → Domains** : ajoute `dzstore-beaute.vercel.app` et `dzstore-maison.vercel.app`.
4. Production Branch : `claude/vibrant-allen-p2e3je`, puis Deploy.

## 5. Projet admin (`dzstore-admin`)

1. Nouveau projet, **Project Name** `dzstore-admin`, **Root Directory** `apps/admin`, framework
   *Vite*. Aucune variable : le build marque déjà l'environnement de test, et `/api` est réécrit
   vers l'API (`apps/admin/vercel.json`).
2. Production Branch : `claude/vibrant-allen-p2e3je`, puis Deploy.

## 6. Traitement des jobs toutes les 30 minutes

Le cron gratuit de Vercel ne tourne qu'une fois par jour. Utilise un planificateur externe
gratuit, par exemple <https://cron-job.org> :

- URL : `https://dzstore-api.vercel.app/v1/internal/tick`, méthode **POST** ;
- en-tête `x-tick-secret` : la valeur de `TICK_SECRET` ;
- toutes les 30 minutes.

Depuis l'admin, la page **Système** permet aussi de lancer un tour à la main.

## 6 bis. Médias (facultatif, Cloudflare R2 gratuit)

Sans R2, l'environnement de test fonctionne mais refuse les images (« stockage des médias non
configuré ») : le disque de Vercel est en lecture seule.

1. Cloudflare → **R2** → activer R2 (offre gratuite : 10 Go) → **Create bucket** `dzstore-media`.
2. Bucket → **Settings → Public access → R2.dev subdomain → Allow** ; note l'URL publique
   (`https://pub-….r2.dev`).
3. R2 → **Manage R2 API Tokens → Create API token** : permission *Object Read & Write*, limité
   au bucket `dzstore-media`. Note l'*Access Key ID* et le *Secret Access Key* (affiché une fois).
4. Projet `dzstore-api` → variables (Production) :

   | Variable | Valeur |
   |---|---|
   | `MEDIA_DRIVER` | `r2` |
   | `R2_ACCOUNT_ID` | identifiant du compte Cloudflare (32 caractères, barre latérale de R2) |
   | `R2_BUCKET` | `dzstore-media` |
   | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | (étape 3) |
   | `MEDIA_PUBLIC_BASE_URL` | l'URL publique de l'étape 2 |

5. Redeploy. Les versions AVIF/WebP sont produites au tour de traitement suivant (cron toutes les
   30 min, ou bouton « Lancer un tour de traitement » de la page Système).

## 7. Vérifications (critères d'acceptation de P0-12)

1. Sur ton téléphone : `https://dzstore-beaute.vercel.app` (arabe, de droite à gauche) et
   `https://dzstore-maison.vercel.app` affichent deux boutiques différentes, avec la mention
   « بيئة تجريبية ».
2. `https://dzstore-admin.vercel.app` : connexion `owner@demo.test` avec `SEED_DEMO_PASSWORD`,
   puis enrôlement de la 2FA (obligatoire) avec ton application d'authentification. La mention
   « Environnement de test » est visible.
3. Admin → **Système** → « Envoyer un événement de test » → « Lancer un tour de traitement » :
   « Événements relayés : 1 » et le job `system.test-event` apparaît « Réussi ».

## Région

Les fonctions de l'API et du store tournent à Francfort (`fra1`, fixé dans `vercel.json`), à
côté de la base Neon : crée la base Neon dans la région **Francfort (`eu-central-1`)**, sinon
chaque requête traverse l'Atlantique.

## Limites connues

- **Neon Free** : la base s'endort après 5 minutes sans activité ; la première requête suivante
  est plus lente (réveil).
- **Limitation de débit par IP** : derrière la réécriture `/api` de Vercel, l'IP vue par l'API peut
  être celle du proxy ; acceptable pour un environnement de test.
- Les données sont **fictives** ; ne saisis jamais de vraies commandes ni de vrais clients.
