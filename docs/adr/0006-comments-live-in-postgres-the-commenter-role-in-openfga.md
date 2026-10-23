# Comments live in Postgres, the Commenter role in OpenFGA

The OpenFGA model has a `commenter` role between `viewer` and `editor` on `folder` and `document` (inherited like the others), and a `can_comment` permission. The Comments themselves are rows in Postgres (`comments`, with a foreign key to `documents` and `ON DELETE CASCADE`), stored through `CommentRepository`.

**Why:** who may read or write Comments is a relationship, so it belongs in the model next to the other roles. The Comments are data (text, author, date) and not a relation, and OpenFGA is not a place for them. The foreign key lets Postgres remove a Document's Comments with it, so `ResourceLifecycle` and the `Reconciler` have nothing to do for them.

**Consequences:**
- Reading Comments needs `can_view`, adding one `can_comment`; a Comment is deleted by its author, or by whoever has `can_delete` on the Document. A User who cannot view the Document gets a 404, a Viewer who tries to comment a 403.
- The in-memory `CommentRepository` has no cascade: only the Postgres adapter does, and its integration spec checks it.
- Comments cannot be edited and are not paginated: a Document with thousands of Comments loads them all. Revisit both if Comments become a real feature.
- Revoking or downgrading a Commenter does not delete what they wrote.
