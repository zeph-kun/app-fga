# Store Documents in Postgres through Prisma, behind a DocumentRepository

Documents (title, content, owner) live in a `documents` table in the `app` database of the Postgres container. Access goes through the `DocumentRepository` abstraction (`save`, `findById`, `findByIds`, `delete`) with two adapters: `PrismaDocumentRepository` and `InMemoryDocumentRepository` (service tests). The same contract suite runs against both.

**Why:** the in-memory map lost every Document on restart while the OpenFGA tuples survived. Prisma gives a typed client and migrations (`apps/api/prisma/`); the repository keeps `DocumentsService` free of any ORM, mirroring how `Authorizer` isolates OpenFGA.

**Consequences:**
- Who can access a Document stays in OpenFGA only; the table has no sharing columns.
- Writes to Postgres and OpenFGA are not atomic. Create deletes the row if the Owner grant fails. Delete removes the row first, then every grant (`Authorizer.revokeAll`): if that second step fails, the leftover grants point at an id that no longer exists and are harmless (the Document is a 404), but nothing cleans them up yet.
- Adapter specs (`*.integration.spec.ts`) need the Docker Postgres and run with `npm run test:integration`; `npm test` stays Docker-free.
