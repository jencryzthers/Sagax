# WIP: Pulsatrix Flow installé par défaut (EN PAUSE, 2026-10-18)

Décision de JC : en pause, pas de PR, pas de fusion, aucun marketplace exposé.

## État
- Perspicax : réglages `flow_plugins_default`, `flow_plugins_tenant`, `flow_plugins_tenant_source` (aucune migration), `connect.flow_plugins` de `/api/v1/me/access`, `flow_plugins` du répertoire Sagax, recette Claude Code de la console (lignes `claude plugin` + équivalent `.claude/settings.json`). Tests gateway et e2e console verts (576), clippy propre.
- Sagax : `server/org-flow-plugins.ts` (copie unique de l'org, clé réservée `_org-flow-plugins`, chargée par `--plugin-dir` pour les membres actifs ; déclenché par le répertoire, l'ajout d'un profil, une minuterie). Tests unitaires et e2e verts ; essai réel : Claude Code voit `pulsatrix-flow:using-px-flow`, un non-membre rien. test:unit complet : 2 échecs hors de ce chantier (claude-login-auth, motion), non vérifiés sur main.
- Ce code pointe encore vers GitHub (owner/repo). La décision suivante de JC : marketplace servi par Perspicax.

## Essai Claude Code 2.1.303 (HOME temporaire)
- Marketplace par URL HTTPS + sources `archive` (zip, sha256) + `headersHelper` dans `extraKnownMarketplaces` (réglages utilisateur) : fonctionne ; idempotent ; jeton jamais écrit sur disque ; jeton révoqué = 401, copie gardée.
- Limites : `claude plugin marketplace add` ne prend pas d'en-tête (déclarer dans settings.json) ; pas de chemins relatifs avec un marketplace par URL ; une source archive ne peut pas viser loopback ; un marketplace git n'utilise que les identifiants git du poste.

## Options pour le jeton côté poste
- A : petit assistant servi par Perspicax (OAuth une fois, refresh token dans le trousseau, jeton court 5 à 15 min).
- B : Sagax desktop fournit le jeton (seulement pour qui a Sagax).
- C : miroir produit sans jeton, seul le tenant exige A ou B. Recommandé : A + C.

## Ce qui reste
- Perspicax : marketplace par org (miroir signé épinglé par l'admin + tenant, versions, audit), jeton court dédié, spec dans docs/.
- Sagax : sources `archive` (zip + sha256) téléchargées avec le jeton de lien ; corriger les points de relecture (message de retrait de marketplace, clé de copie si nom local différent, refreshedAt après échec, copie atomique).
- Console : pointer vers le marketplace Perspicax ; captures d'écran.
- Rebase avant toute PR (console en refonte).
