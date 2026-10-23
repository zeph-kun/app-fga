# Améliorations et nouvelles features possibles

Analyse faite avec les skills `codebase-design` et `domain-modeling` (mattpocock). Rien n'est implémenté: c'est une liste de pistes pour plus tard.

## 1. Améliorations d'architecture (`codebase-design`)

**a. ✅ Fait — `Authorizer` est large (≈15 méthodes abstraites) et mélange trois rôles.** Les Teams sont sortis dans `Membership` (`OpenFgaMembership`, `InMemoryMembership`, `membership.contract.ts`), avec un `OpenFgaStore` partagé. `TeamsService` ne dépend plus d'`Authorizer`. Reste ouvert: séparer aussi les grants de la vérification.
- **Vérifier**: `can`, `accessOn`, `rolesOn`, `expiryOn`, `resourcesWhere`.
- **Écrire des grants**: `grant`, `revoke`, `revokeAll`, `setParent`, `grantsOn`.
- **Gérer les Teams**: `teamMembers`, `addTeamMember`, `removeTeamMember`, `teamsOf`.

L'interface est plus large que nécessaire, et chaque nouvel adapter doit tout implémenter. Piste: garder `Authorizer` pour la vérification et les grants, et sortir les Teams dans un module `Membership`. Il aurait deux adapters (OpenFGA et in-memory), donc le seam serait réel. Test de suppression: `teams.service` dépend aujourd'hui de tout `Authorizer`.

**b. ✅ Couvert par les tests — `expiryOn` calcule dans la couche abstraite ce que le modèle FGA sait déjà.** Le contrat a maintenant les cas croisés (Team expirée plus Folder permanent, deux Teams, Team sur le Folder, grant expiré à côté d'un grant limité), et `authorizer.properties.ts` compare `expiryOn` à un oracle sur les deux adapters. La règle reste calculée côté API: la déplacer dans FGA n'est pas fait, ni l'ADR 2 ci-dessous.
La règle "latest expiry parmi Share, Team et Folder" est réimplémentée à la main côté API, donc dupliquée par rapport à `model.fga` (risque de divergence). Le contrat devrait la couvrir avec des cas croisés: Team expirée plus Folder permanent, ou deux Teams.

**c. ✅ Fait — Orchestration Postgres + OpenFGA répétée dans les services.** `ResourceLifecycle` (`createDocument`, `deleteDocument`, `moveDocument`, `createFolder`, `deleteFolder`) cache l'ordre des écritures et la compensation. Une suppression dont la révocation des grants échoue réussit maintenant et journalise un avertissement. Les Teams y sont aussi (`createTeam`, `deleteTeam`); `deleteTeam` retire les membres avant la ligne, pour qu'un échec ne laisse pas d'accès par une Team supprimée.
`create` fait save, grant, setParent, puis un rollback manuel. `delete`, `move` et les folders ont la même forme. Les "Known gaps" (non-atomicité) le confirment. Piste: un module profond du type `ResourceLifecycle` (`create`/`delete`/`move`) qui cache la compensation et le rollback. Les services n'exposeraient plus que des règles métier.

**d. ✅ Fait — `sharing.ts` est un fourre-tout** (erreurs HTTP, DTO, helper de date, type guard). Les services `documents` et `folders` y piochent chacun leur morceau. Un module `Sharing` unique, avec `share(resource, input)`, `shares(resource)` et `revoke(...)`, supprimerait la duplication. C'est le meilleur gain de leverage de la liste. Le module `Sharing` expose `share`, `shares`, `unshare` et `accessList`; il n'autorise rien, les services vérifient `can_share` avant de l'appeler.

**e. ✅ Fait — Réconciliation Postgres/OpenFGA** (gap connu). `npm --prefix apps/api run reconcile` liste les écarts (dry-run, code de sortie 1 s'il y en a) et `-- --apply` les répare, Postgres faisant foi: grant `owner` manquant, lien de Folder différent de la ligne, grants sur un id sans ligne. À lancer API arrêtée. Il couvre aussi les Teams: propriétaire non membre, membres d'une Team sans ligne. Les grants donnés à une Team supprimée ne sont pas retirés (ils s'affichent « Deleted team »).
Un job ou une commande `reconcile` qui détecte les documents sans grant `owner` et les tuples orphelins. Testable via les deux adapters existants.

## 2. Nouvelles features

| Feature | Intérêt FGA | Remarque |
|---|---|---|
| Journal d'audit ("qui a partagé quoi, quand") | Moyen | Concerne les Owners. Les événements Share, Revoke et Move existent déjà. |
| Liens de partage / invitation par lien | Élevé | Nouveau sujet (`link`). À trancher: ADR. |
| Dossiers imbriqués | Élevé | Exclu par l'ADR 0003. Il faudrait le rouvrir: `parent` récursif, risque de cycles. |
| Transfert de propriété | Moyen | Aujourd'hui un seul Owner. Définir le terme dans le glossaire. |
| Rôle "Commenter" (entre Viewer et Editor) | Élevé | Montre l'évolution du modèle sans toucher aux controllers (`can_comment`). |
| Historique de versions du contenu | Faible | Plus orienté produit que FGA. |
| Pagination et recherche | Technique | `ListObjects` est plafonné à 1000. Combiner avec une recherche Postgres. |
| Révocation en masse / "Shared with me" avec filtres | Faible | Bonne UX, peu de coût. |
| Notifications d'expiration imminente | Faible | S'appuie sur `expiryOn`, déjà présent. |

## 3. Qualité et sécurité

- **Rate limit par route**: il n'y en a pas (cf. CLAUDE.md). Un throttle plus strict sur les routes de partage et de lecture d'utilisateurs limiterait l'énumération de usernames.
- **Énumération d'utilisateurs**: `400 No user named "x"` révèle quels usernames existent. Acceptable pour une démo, mais à documenter dans un ADR.
- ✅ **Fait — tests de propriété sur le contrat `Authorizer`** (`authorizer.properties.ts`, comparés à un modèle de `model.fga` sur les deux adapters). Ils ont révélé que `grant` et `addTeamMember` échouaient sur OpenFGA quand le tuple existait déjà; les deux sont maintenant idempotents.
  Piste d'origine: séquences aléatoires de grants, revokes et moves, comparées entre `InMemoryAuthorizer` et `OpenFgaAuthorizer`. Meilleure défense contre la divergence avec `model.fga`.
- **Tests e2e web** (Playwright) sur le parcours Share, expiry puis page `access-ended`.

## 4. Vocabulaire à clarifier (`domain-modeling`)

- ✅ **Fait — "Share" est ambigu**: nom (le grant) et verbe. Un terme comme *Grant* pour l'objet éviterait la confusion. `Grant` existe déjà dans le code mais pas dans le glossaire.
- ✅ **Fait — "Team" est absent du glossaire**, alors qu'il est dans le modèle et dans l'UI.
- ✅ **Tranché — scénario**: un Folder ne perd jamais son Owner, sauf s'il est supprimé, et seul un Folder vide peut l'être. Les Documents ont donc déjà fait l'objet d'un *Move*, qui retire les rôles de l'ancien Folder et recalcule l'*Access expiry*. Rien à ajouter.
- **ADR candidats** (difficiles à inverser, surprenants, vrai compromis): (1) énumération d'utilisateurs tolérée, (2) règle de calcul d'*Access expiry* côté API plutôt que dans FGA.

## Ordre recommandé

1. ✅ Ajouter *Team* et *Grant* au glossaire (rapide).
2. ✅ Extraire le module `Sharing` (gain de leverage immédiat, refactor sûr grâce aux tests existants).
3. ✅ Séparer `Membership` de `Authorizer`.
4. Ajouter le rôle "Commenter" en TDD, pour valider que le modèle reste souple.

Option: lancer `grilling` sur la piste choisie pour trancher le design avant d'écrire du code.
