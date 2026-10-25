# The Activity log is best effort, in Postgres, and goes with its resource

Changes to who has access to a Document or Folder are recorded as rows in Postgres (`activity_entries`), stored through `ActivityLogRepository`. An entry has the actor, the time, and the details of one kind of event (Share given or removed, Share link created, revoked or accepted, Move). It points to its Document or Folder through two nullable foreign keys, exactly one of them set, both `ON DELETE CASCADE`. Each service that makes such a change records it itself, once the change has succeeded.

**Why:** OpenFGA's change feed says neither who made a change nor why (a link accepted, or a Share given), and is not made for keeping history. The services that make the changes already know the actor and have already checked `can_share`; `Sharing` does not, and it is also called when a link is accepted, which would record the acceptance twice. The foreign keys make Postgres remove the entries with their resource, so `ResourceLifecycle` and the `Reconciler` have nothing to do for them (same reasoning as [ADR 0006](0006-comments-live-in-postgres-the-commenter-role-in-openfga.md) and [ADR 0007](0007-share-links-live-in-postgres-and-become-grants.md)).

**Consequences:**
- Writing the entry comes after the change and does not undo it: if it fails, the change stands and the failure is logged as an error. An entry can therefore be missing, which is why this is called an Activity log and not an audit log.
- The log is not kept when its resource is deleted, and Postgres has nothing that stops someone with database access from editing it.
- Names (of a Team, of a Folder) are copied into the entry, so a Team renamed or deleted later still reads right.
- Changes made before this existed have no entry; the log of an existing resource starts empty. Neither does an Expiry running out, nor the members of a Team, which belong to no Document or Folder.
- The Owner reads the latest 50 entries, with no pagination.
- A record that survives its resource, or cannot be lost, is a different decision and needs a new ADR.
