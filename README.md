# app-fga

Next.js + NestJS + OpenFGA + Keycloak. See `CLAUDE.md` for architecture and conventions.

## Quick start

Docker must be usable by your user (`docker ps` works without sudo).

```
npm run infra:up       # Postgres, Keycloak :8080, OpenFGA :8081
npm run install:all
npm run db:deploy      # apply Prisma migrations to the `app` database
npm run dev:api        # :4000
npm run dev:web        # :3000
```

Open http://localhost:3000, sign in as `alice` / `alice`, create a document, share it with `bob`, then sign in as `bob` (private window) to see it.

Keycloak admin: http://localhost:8080 (`admin`/`admin`). The OpenFGA Playground is disabled (see `CLAUDE.md`); use the OpenFGA API directly with the preshared key below.

To use different credentials than the committed dev defaults (Postgres, Keycloak admin, OpenFGA's API key), copy `.env.example` to `.env` first — `docker compose` reads it automatically.

## Try the API with curl

```
TOKEN=$(curl -s -d grant_type=password -d client_id=dev-cli -d username=alice -d password=alice \
  http://localhost:8080/realms/app-fga/protocol/openid-connect/token | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/documents
```

## Try the OpenFGA API with curl

```
curl -H "Authorization: Bearer dev-openfga-key" http://localhost:8081/stores
```
