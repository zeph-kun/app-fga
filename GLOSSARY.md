# Glossary

**User**: a person who signs in through Keycloak. Identified by their username.

**Document**: a titled piece of text that a User creates and that others may be given access to.

**Owner**: the User who created a Document. Can read, edit, delete it, and manage who it is shared with. A Document has one Owner (an Owner of its Folder is also an Owner of it).

**Editor**: a User who can read and change a Document's title and content, but cannot delete it or manage sharing.

**Viewer**: a User who can only read a Document.

**Share**: giving another User Editor or Viewer access to a Document. Sharing again with a different role replaces the previous one.

**Expiry**: the moment a time-limited Share stops applying; a Share without one lasts until it is revoked. The Owner sets it when sharing and sees it in the Shares list.

**Access expiry**: the moment a User's own access to a Document ends, shown to them as the time left. It is the latest Expiry among all the ways they have access (own Share, Team, Folder), and there is none if any of those never expires, or if they are the Owner.

**Shares list**: the Users a Document is currently shared with and their role. Only the Owner can see it; it never includes the Owner.

**Folder**: a named container for Documents, created by a User who becomes its Owner. A Document is in at most one Folder; Folders do not nest. Owner, Editor and Viewer mean the same on a Folder, and a role held on a Folder also applies to every Document in it. Only an empty Folder can be deleted.

**Move**: putting a Document in a Folder, or taking it out. The Document then gets the roles of its new Folder and loses those of the old one. Only its Owner can do it, and only into a Folder they can edit.

**Revoke**: removing a User's Share on a Document. The Owner cannot be revoked.
