# Folders nest up to five levels

A Folder may have a parent Folder, up to 5 levels deep. The OpenFGA model gives `folder` a `parent: [folder]` relation, and each of its roles also holds for anyone holding that role on the parent (`... from parent`), as `document` already does. Roles given on a Folder therefore reach everything below it, at every level. The parent is stored twice, like a Document's Folder: `folders.parent_id` in Postgres (a foreign key that refuses to delete a Folder that still has Folders in it), which is right, and the `parent` tuple in OpenFGA, written by `ResourceLifecycle` and repaired by the `Reconciler`. This replaces the "Folders do not nest" part of [ADR 0003](0003-folders-inherit-roles-and-permissions-are-checked.md); the rest of it stands.

**Why:** people group work in more than one level. A recursive `parent` is what OpenFGA offers for unbounded depth, and it keeps access one rule (a role on a Folder covers what is under it) instead of a tuple per Document. The limit of 5 keeps checks well under OpenFGA's resolution depth (25 by default), keeps the breadcrumb readable, and bounds the walk the API makes up the tree.

**Consequences:**
- OpenFGA does not stop a Folder from becoming its own ancestor, and a loop breaks the resolution of access. The service refuses a cycle, or a tree deeper than 5 levels, before writing anything, by walking the parents in Postgres. Two moves at the same time could still make a loop; the `Reconciler` reports it and does not repair it.
- Rights only add up: OpenFGA has no denial, so a Folder cannot lose an access it inherits.
- A Folder Owner is an Owner of everything below it. Creating a Folder needs edit access to its parent; moving one needs to own it and to edit the target.
- Only a Folder with no Document and no Folder in it can be deleted; Postgres refuses to delete a Folder that still has Folders in it.
- An Access expiry is the latest end over the whole chain of Folders above, not only the nearest.
- A User shared a Folder but not its parent sees it at the top of their workspace; their breadcrumb stops at the highest Folder they can see.
- The Activity log notes a Folder being moved on that Folder, not what is done to a parent. A Share link on a Folder reaches its whole subtree because it becomes a Grant on that Folder.
- Existing Folders become Folders at the top. Raising the limit later needs no change to the model.
