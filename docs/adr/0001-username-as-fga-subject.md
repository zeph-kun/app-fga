# Use the Keycloak username as the OpenFGA subject

OpenFGA tuples identify users as `user:<preferred_username>` rather than the Keycloak `sub` (UUID).

**Why:** sharing is done by typing a username. With `sub` we would need a username → id lookup through the Keycloak admin API on every share, and a user directory in the UI. Keycloak usernames are immutable by default (`editUsernameAllowed` is off), which makes them stable enough for this app.

**Consequences:** if usernames ever become editable or are reused after account deletion, existing tuples would point at the wrong person; moving to `sub` then means rewriting every tuple. Revisit before enabling username changes or opening registration.
