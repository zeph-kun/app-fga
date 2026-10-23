# Any signed-in User can search the Keycloak user directory

`GET /users?q=` suggests usernames (prefix match, 8 at most, the caller left out) to any authenticated User, so the sharing panel offers a picker instead of a free text field. The API reads them through `UserDirectory.search`, with the `api-service` client.

**Why:** typing a username blind meant guessing, and `400 No user named "x"` already told a caller which usernames exist. Listing them openly is the same exposure, in a form that is easier to use. Typed text is still accepted and checked by `UserDirectory.exists`.

**Consequences:** every signed-in User can enumerate every username in the realm, one prefix at a time. That is fine for a demo and for an internal realm; it is not for a public one, where the search should be limited to people the caller already works with (Teams, past Shares). The global rate limit is the only brake for now (see per-route throttling in `docs/improvements.md`).
