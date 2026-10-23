# Améliorations et nouvelles features possibles

Analyse faite avec les skills `codebase-design` et `domain-modeling` (mattpocock). Rien n'est implémenté: c'est une liste de pistes pour plus tard.

## 1. Améliorations d'architecture (`codebase-design`)

**a. `Authorizer` est large (≈15 méthodes abstraites) et mélange trois rôles.**
- **Vérifier**: `can`, `accessOn`, `rolesOn`, `expiryOn`, `resourcesWhere`.
- **Écrire des grants**: `grant`, `revoke`, `revokeAll`, `setParent`, `grantsOn`.
- **Gérer les Teams**: `teamMembers`, `addTeamMember`, `removeTeamMember`, `teamsOf`.

L'interface est plus large que nécessaire, et chaque nouvel adapter doit tout implémenter. Piste: garder `Authorizer` pour la vérification et les grants, et sortir les Teams dans un module `Membership`. Il aurait deux adapters (OpenFGA et in-memory), donc le seam serait réel. Test de suppression: `teams.service` dépend aujourd'hui de tout `Authorizer`.

**b. `expiryOn` calcule dans la couche abstraite ce que le modèle FGA sait déjà.**
La règle "latest expiry parmi Share, Team et Folder" est réimplémentée à la main côté API, donc dupliquée par rapport à `model.fga` (risque de divergence). Le contrat devrait la couvrir avec des cas croisés: Team expirée plus Folder permanent, ou deux Teams.

**c. Orchestration Postgres + OpenFGA répétée dans les services.**
`create` fait save, grant, setParent, puis un rollback manuel. `delete`, `move` et les folders ont la même forme. Les "Known gaps" (non-atomicité) le confirment. Piste: un module profond du type `ResourceLifecycle` (`create`/`delete`/`move`) qui cache la compensation et le rollback. Les services n'exposeraient plus que des règles métier.

**d. `sharing.ts` est un fourre-tout** (erreurs HTTP, DTO, helper de date, type guard). Les services `documents` et `folders` y piochent chacun leur morceau. Un module `Sharing` unique, avec `share(resource, input)`, `shares(resource)` et `revoke(...)`, supprimerait la duplication. C'est le meilleur gain de leverage de la liste.

**e. Réconciliation Postgres/OpenFGA** (gap connu).
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
- **Tests de propriété sur le contrat `Authorizer`**: séquences aléatoires de grants, revokes et moves, comparées entre `InMemoryAuthorizer` et `OpenFgaAuthorizer`. Meilleure défense contre la divergence avec `model.fga`.
- **Tests e2e web** (Playwright) sur le parcours Share, expiry puis page `access-ended`.

## 4. Vocabulaire à clarifier (`domain-modeling`)

- **"Share" est ambigu**: nom (le grant) et verbe. Un terme comme *Grant* pour l'objet éviterait la confusion. `Grant` existe déjà dans le code mais pas dans le glossaire.
- **"Team" est absent du glossaire**, alors qu'il est dans le modèle et dans l'UI.
- **Scénario à trancher**: un Document partagé avec une Team dont l'Owner quitte le Folder. Que devient l'*Access expiry*?
- **ADR candidats** (difficiles à inverser, surprenants, vrai compromis): (1) énumération d'utilisateurs tolérée, (2) règle de calcul d'*Access expiry* côté API plutôt que dans FGA.

## Ordre recommandé

1. Ajouter *Team* et *Grant* au glossaire (rapide).
2. Extraire le module `Sharing` (gain de leverage immédiat, refactor sûr grâce aux tests existants).
3. Séparer `Membership` de `Authorizer`.
4. Ajouter le rôle "Commenter" en TDD, pour valider que le modèle reste souple.

Option: lancer `grilling` sur la piste choisie pour trancher le design avant d'écrire du code.
