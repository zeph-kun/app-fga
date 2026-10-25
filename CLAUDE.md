# app-fga

Document-sharing app demonstrating fine-grained authorization (FGA).
Next.js frontend → NestJS API → OpenFGA, with Keycloak for authentication.

## Layout

- `apps/web` — Next.js 16 (App Router), Tailwind 4, shadcn/ui (`base-nova`, Base UI primitives, lucide icons), Auth.js (next-auth v5) with the Keycloak provider
- `apps/api` — NestJS 12 (ESM), Prisma 7 (Postgres), Vitest, zod
- `infra/` — Keycloak realm import, OpenFGA model (`infra/openfga/model.fga`), Postgres init
- `docker-compose.yml` — Postgres, Keycloak (:8080), OpenFGA (:8081, preshared-key auth, playground disabled)
- `GLOSSARY.md` — domain vocabulary; `docs/adr/` — architecture decisions

## Commands

Node is on the host; everything else (Postgres, Keycloak, OpenFGA) runs in Docker. No pnpm: use npm.

```
npm run infra:up      # start Docker services (waits for healthy)
npm run install:all   # install both apps
npm run dev:api       # http://localhost:4000 (run `npm run db:deploy` once first)
npm run dev:web       # http://localhost:3000
npm test              # API unit tests (no Docker needed, property tests on the in-memory adapters included), then the web's (Vitest, `src/lib`)
npm --prefix apps/api run test:integration   # adapter contract and property tests against Docker Postgres and OpenFGA: their own `app_test` database and `app-fga-test` store (created and migrated on the first run), never the app's data
npm run typecheck     # tsc --noEmit on both apps
npm run reconcile     # list Postgres/OpenFGA differences (stop the API first); `npm run reconcile -- --apply` repairs them
```

Dev logins (Keycloak realm `app-fga`): `alice`/`alice`, `bob`/`bob`, `florian`/`florian`, `adham`/`adham`, `jeremy`/`jeremy`, `yassine`/`yassine`. Admin console: `admin`/`admin`.
Keycloak's User Profile requires `lastName`: a user created without one can't log in (fails with "Account is not fully set up"), silently — the Admin API accepts the create and the stored `requiredActions` stays empty, so check this first if a newly added dev user can't authenticate.
`dev-cli` is a dev-only public client with password grant, for getting tokens with curl.

## Conventions

- **TypeScript is strict** in both apps (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`). No `any`, no non-null `!`, no `as` casts to silence errors; parse external data (env, HTTP bodies, API responses) with zod.
- API is ESM (`nodenext`): relative imports need a `.js` extension.
- Do not run `npm run format` in `apps/api`: the committed code does not follow its `.prettierrc`, so it would reformat most of `src/`. Match the style of the surrounding code.
- Use `GLOSSARY.md` terms exactly (Document, Folder, Owner, Editor, Viewer, Grant, Share, Team, Move). The UI copy is in English for that reason.
- **Web UI**: colors and radii are tokens in `apps/web/src/app/globals.css` (OKLCH, light and dark designed separately, contrast checked for WCAG AA); never hard-code colors. Primitives live in `src/components/ui` (shadcn, generated: change them by `className`), app pieces in `src/components/features` and `src/components/layout`. Roles are always shown with `RoleBadge`. Every list has an empty state, every page a loading/error/not-found state.
- Development style follows the mattpocock skills: `tdd` (red-green-refactor through the public interface), `domain-modeling` (update GLOSSARY.md / ADRs as terms and decisions crystallise), `codebase-design` (deep modules, small interfaces, a seam only where something varies).

## Architecture rules

- **All authorization goes through the `Authorizer` module** (`apps/api/src/authorization`). Controllers and services never talk to the OpenFGA SDK, and ask about `can_*` permissions on a `Resource` (`documentRef`/`folderRef`), never about roles. Two adapters exist: `OpenFgaAuthorizer` (prod) and `InMemoryAuthorizer` (tests), both held to `authorizer.contract.ts` and to `authorizer.properties.ts` (random sequences of grants, revokes, moves and membership changes, compared to a plain model of `model.fga`).
- **Who may create Teams goes through `Managers`** (same folder): `OpenFgaManagers` and `InMemoryManagers`, held to `managers.contract.ts`, applied from the `MANAGERS` setting at startup by `ManagersBootstrap`. The `Authorizer` answers `can(user, 'can_create_team', organizationRef())` from `organization:main` in the model (see `docs/adr/0005-managers-create-teams-through-an-organization-object.md`); `GET /me` tells the web as `canCreateTeam`. Pass the same `InMemoryManagers` to the `InMemoryAuthorizer` in tests.
- **Who belongs to a Team goes through `Membership`** (same folder), not the `Authorizer`: `OpenFgaMembership` and `InMemoryMembership`, held to `membership.contract.ts`. The `Authorizer` takes a `Membership` to resolve Teams, so an in-memory test wires one `InMemoryMembership` into both the `InMemoryAuthorizer` and `TeamsService`. `OpenFgaAuthorizer`, `OpenFgaMembership` and `OpenFgaManagers` share one `OpenFgaStore` (client, store and model bootstrap).
- **Creating, moving and deleting Documents, Folders and Teams goes through `ResourceLifecycle`** (deleting a Team also removes the Grants given to it, with `Authorizer.revokeEverywhere`) (`apps/api/src/lifecycle`), which owns the Postgres + OpenFGA write order and the undo on failure; services only apply business rules and read through the repositories. `Reconciler` (`npm run reconcile`) repairs what a crash between the two writes leaves behind, with Postgres as the source of truth; it reports (and never repairs) Folders that sit in each other.
- **Giving, listing and revoking Grants goes through `Sharing`** (`apps/api/src/sharing`). It does not authorize: the Documents and Folders services check `can_share` first, then pass the resource and its Owner.
- **Comments are stored through `CommentRepository`** (`apps/api/src/comments`), with the same contract-per-adapter rule; the Postgres foreign key removes a Document's Comments with it (see `docs/adr/0006-comments-live-in-postgres-the-commenter-role-in-openfga.md`). `CommentsService` checks `can_view` / `can_comment` / `can_delete`; the roles are `owner` > `editor` > `commenter` > `viewer`, so changing them means updating `model.fga`, `InMemoryAuthorizer`, `authorizer.contract.ts` and `authorizer.properties.ts` too.
- **Share links go through `ShareLinks`** (`apps/api/src/share-links`, `ShareLinkRepository` held to its contract by an in-memory and a Prisma adapter, see `docs/adr/0007-share-links-live-in-postgres-and-become-grants.md`). A link only becomes access when a signed-in User accepts it: `ShareLinks` then gives an ordinary Grant through `Sharing`, so the Authorizer and `model.fga` know nothing about links. Only the hash of the token is stored; the web builds the address (`/join/<token>`) from the token it is shown once.
- **Access changes are recorded in the Activity log through `ActivityLog`** (`apps/api/src/activity-log`, `ActivityLogRepository` held to its contract by an in-memory and a Prisma adapter, see `docs/adr/0008-the-activity-log-is-best-effort-in-postgres.md`). The services that make a change (`DocumentsService`, `FoldersService`, `ShareLinks`) call `activityLog.record(actor, resource, event)` once it has succeeded, not `Sharing` (it does not know the actor, and accepting a link would be noted twice). Recording is best effort: a failure is logged and never fails the change. Owners (`can_share`) read the latest 50 entries with `GET /documents/:id/activity` and `GET /folders/:id/activity`. A new kind of event goes in `ActivityEvent` and in the zod schema of the Prisma adapter.
- **Documents and Folders are stored through `DocumentRepository` / `FolderRepository`** (`apps/api/src/documents`, `apps/api/src/folders`); only the `Prisma*Repository` adapters touch Prisma. Run the shared contract (`*-repository.contract.ts`) against any new adapter. The generated client (`src/generated`) is git-ignored and rebuilt by `postinstall`.
- **Integration specs never touch the app's data**: the Prisma specs empty their tables before each test, so `vitest.config.integration.ts` points `DATABASE_URL` at `app_test` (`TEST_DATABASE_URL` overrides it; its name must end in `_test` or the run refuses to start) and `test/integration-setup.ts` creates and migrates it. The OpenFGA specs use the `app-fga-test` store. Keep new integration specs on the same two.
- The OpenFGA model lives in `infra/openfga/model.fga`; the API creates the store and writes the model at startup. Keep `InMemoryAuthorizer` and the oracle in `authorizer.properties.ts` in sync with it.
- Folders: a Document is in at most one Folder and a Folder in at most one Folder, up to 5 levels (see `docs/adr/0009-folders-nest-up-to-five-levels.md`, which replaces the "do not nest" part of `docs/adr/0003-folders-inherit-roles-and-permissions-are-checked.md`). `Authorizer.setParent(child, parentId)` and `parentOf(child)` take a Document or a Folder, roles are inherited down the whole subtree, and `expiryOn` follows the chain of Folders above. OpenFGA does not refuse a loop, so `FoldersService` does (it walks the parents in Postgres before moving or creating), and the depth limit lives there too (`MAX_FOLDER_DEPTH`, mirrored in `apps/web/src/lib/folder-tree.ts`). Changing `infra/openfga/model.fga` means updating `InMemoryAuthorizer`, `authorizer.contract.ts` and `authorizer.properties.ts` too (its Folders only take a parent of a lower number, so that no sequence of moves makes a loop).
- FGA subject is `user:<Keycloak preferred_username>` (see `docs/adr/0001-username-as-fga-subject.md`).
- Documents the caller cannot view return 404, not 403, so existence is not leaked.
- Sharing a Document or Folder with its own Owner is rejected (403): the Owner already has full access.
- Sharing with an unknown username is rejected (400): `UserDirectory` (`apps/api/src/users`) checks it against Keycloak's Admin REST API first, using the `api-service` client (a service account with the realm's `view-users` role). `InMemoryUserDirectory` is the test adapter, seeded with the usernames a test needs. The same directory feeds the sharing panel's picker through `GET /users?q=` (`UsersService.suggest`, any signed-in User, see `docs/adr/0004-any-user-can-search-the-user-directory.md`).
- A global rate limit (`RATE_LIMIT_PER_MINUTE`, default 120/min per IP, via `@nestjs/throttler`) protects every route. Searching users (`GET /users`, `RATE_LIMIT_USER_SEARCH_PER_MINUTE`, 60) and giving or revoking a Share (`RATE_LIMIT_SHARE_PER_MINUTE`, 30, counted per route) have a stricter limit per signed-in User: mark a route with `@RateLimited(...)` (`apps/api/src/http/user-throttler.guard.ts`, after `JwtAuthGuard`). The IP is the web server's for every User, hence the per-User count.
- OpenFGA requires a preshared key (`OPENFGA_API_TOKEN` / `OPENFGA_PRESHARED_KEY`, see `.env.example`): its HTTP API has no auth otherwise. This is why the Playground (`:3001`) is disabled — it only works with `authn-method: none`.
- The access token never reaches the browser: it stays in the encrypted Auth.js cookie and is read server-side in `apps/web/src/lib/api.ts`. Mutations are Server Actions.
- **The document editor saves as you type** through `Autosaver` (`apps/web/src/lib/autosaver.ts`: debounce, one save at a time, the last change always lands); `New document` creates an "Untitled" document in one click and opens it with the title selected (`?new=1`). Owners drag documents from the list onto folders (or out of one) with `document-drag.tsx`, which calls the same `moveDocument` action as the Move dialog, the keyboard alternative.
- **Server Actions in `apps/web/src/app/actions.ts` answer with an `ActionState`** (`{ error?, success? }`) for expected failures (403, 409, validation) instead of throwing; actions that create or delete redirect. Forms use `ActionForm`/`SubmitButton`, direct calls use `useTransition`; errors show inline, successes as a toast.
- **`apps/web/src/proxy.ts` must keep running `auth`** (Next 16's `proxy` replaces `middleware`): it is the only place the refreshed Keycloak tokens get written back to the session cookie. Without it the access token (~5 min) goes stale in the cookie and the app loops on `GET /` redirects. `lib/api.ts` redirects to `/` on an expired token so the next response carries the fresh cookie.
- Next.js 16 differs from older versions; read `apps/web/node_modules/next/dist/docs/` before using an unfamiliar API.

## Known gaps

- Postgres and OpenFGA writes are not atomic (see `docs/adr/0002-documents-in-postgres-via-prisma.md`): `ResourceLifecycle` cleans up after a failed create, a failed delete of the grants is logged and left to `npm run reconcile`, which is manual (not scheduled) and unsafe while the API is creating things.
- The Activity log can miss an entry (best effort, ADR 0008), is not kept when its Document or Folder is deleted, and shows the latest 50 entries with no pagination. It starts empty for what existed before it.
- Two Folder moves at the same time could make a Folder its own ancestor despite the check in `FoldersService`; `npm run reconcile` reports it (`parent-cycle`) and someone has to move one of the Folders by hand. A User who only sees a Folder deep in a tree sees it at the top, so the 5-level check the web does for the Move dialog can pass where the API refuses.
- Comments cannot be edited and are not paginated (see ADR 0006).
- The lists of documents and folders come from OpenFGA `ListObjects` without pagination (capped at 1000 by default).
- Sign-out relies on the `id_token` kept in the Auth.js cookie (`logout` in `apps/web/src/app/actions.ts`); sessions opened before that change fall back to a Keycloak confirmation page.
- `MANAGERS` defaults to `florian,adham,jeremy` in `apps/api/src/config/env.ts`, like the other development defaults: override it before running this API anywhere but your own machine.
- `docker-compose.yml`'s credentials (`POSTGRES_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `OPENFGA_PRESHARED_KEY`) default to values committed in this repo; override them via a root `.env` (see `.env.example`) before running this stack anywhere but your own machine.
- The `api-service` client isn't in `infra/keycloak/realm-app-fga.json` import flow for an already-running Keycloak (`--import-realm` skips existing realms); a fresh `docker compose down -v && up` picks it up from the file, an already-running one needs it created once through the Admin API (already done for the current stack).
