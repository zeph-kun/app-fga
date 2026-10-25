# Share links live in Postgres and become Grants when accepted

A Share link is a row in Postgres (`share_links`), stored through `ShareLinkRepository`, with the SHA-256 of its random token, never the token. It points to a Document or a Folder through two nullable foreign keys, exactly one of them set, both `ON DELETE CASCADE`. OpenFGA knows nothing about links: accepting one gives the User an ordinary Grant (through `Sharing`) with the link's role and Expiry, so `model.fga`, the `Authorizer` and its contracts do not change.

**Why:** a link is a way to *obtain* access, not access itself. Only signed-in Users can accept it, so every access stays a Grant of a named User, and Comments, the Shares list and `usersWithAccess` keep working. An anonymous link would have needed a new subject type in the model, public routes, and accesses with no author. The foreign keys let Postgres remove a resource's links with it, so `ResourceLifecycle` and the `Reconciler` have nothing to do for them (same reasoning as [ADR 0006](0006-comments-live-in-postgres-the-commenter-role-in-openfga.md)).

**Consequences:**
- The token is shown once, when the link is created: only its hash is stored, so a leaked database gives no working link. An Owner who loses the URL revokes the link and creates another.
- A link that is unknown, expired or revoked answers 404 whichever it is.
- Accepting never lowers access: a User who already holds the role for at least as long (Owner, Grant, Team or Folder) gets no Grant.
- Revoking a link does not remove the Grants it gave, and a link has no limit on how many Users accept it. Add a count if that is needed: it brings state to update atomically.
- Anyone signed in who holds the URL can accept it: the URL is as sensitive as the access it gives.
- Making links anonymous later means a new subject type in `model.fga`: that decision would be a new ADR.
