# Folders: one parent per document, inherited roles, `can_*` permissions

Documents may sit in one Folder. The OpenFGA model (`infra/openfga/model.fga`) gives `document` a `parent: [folder]` relation, and each of its roles (`owner`, `editor`, `viewer`) also holds for anyone holding that role on the parent (`... from parent`). Folders do not nest. The API checks `can_view`, `can_comment`, `can_edit`, `can_delete` and `can_share` permissions (`can_comment` was added with the Commenter role, see ADR 0006), never roles: the `Authorizer` takes a `Permission` and a `Resource` (`document` or `folder`), and roles are only what `grant`/`revoke` write.

**Why:** a role on a folder should apply to everything in it without writing a tuple per document. OpenFGA's own guidance favours explicit types, flat hierarchies (recursion only for unbounded depth), roles as relations and `can_*` permissions on the type they apply to. One parent keeps the model simple and the access of a document easy to explain.

**Consequences:**
- A Folder Owner is an Owner of every document in it: they can delete, share and move them.
- Moving a document changes who can see it, so only its Owner may move it, and only into a folder they can edit. Creating a document in a folder needs edit access to the folder.
- Only an empty Folder can be deleted (409 otherwise); the user moves or deletes the documents first.
- `documents.folder_id` has no foreign key: the service checks that the folder exists, and the Postgres/OpenFGA writes stay non-atomic (see ADR 0002). Moving restores the previous folder if the OpenFGA write fails.
- Nesting folders would mean a recursive `parent` on `folder` in the model; revisit if users ask for it.
- `ListObjects` (used to list a user's documents and folders) is capped by OpenFGA (1000 results by default) and has not been paginated yet.
