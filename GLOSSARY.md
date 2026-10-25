# Glossary

**User**: a person who signs in through Keycloak. Identified by their username.

**Document**: a titled piece of text that a User creates and that others may be given access to.

**Owner**: the User who created a Document. Can read, edit, delete it, and manage who it is shared with. A Document has one Owner (an Owner of its Folder is also an Owner of it).

**Editor**: a User who can read and change a Document's title and content, but cannot delete it or manage sharing.

**Commenter**: a User who can read a Document and add Comments to it, but cannot change its title or content. Between Viewer and Editor: an Editor can comment too.

**Viewer**: a User who can only read a Document.

**Comment**: a short text (up to 2,000 characters) that a User with at least the Commenter role posts on a Document. Everyone who can read the Document reads its Comments, oldest first. A Comment is deleted by its author or by the Document's Owner, and goes with the Document.

**Grant**: the Editor, Commenter or Viewer role given to a User or a Team on a Document or Folder, optionally with an Expiry. A User or Team has at most one Grant per Document or Folder. Access that is inherited from a Folder or comes through a Team is not a Grant of that User.
_Avoid_: Permission, access right

**Share**: the action of creating a Grant for another User or a Team. Sharing again with a different role replaces the previous Grant.

**Share link**: a URL that an Owner creates on a Document or Folder for one role (Editor, Commenter or Viewer) and an optional Expiry. A signed-in User who opens it sees who invites them and to what, and receives a Grant with that role and Expiry once they accept. A link gives nothing before it is accepted, and revoking it does not take back the Grants it already gave (they stay in the Shares list). A User who already has at least that role for at least as long gets no Grant.
_Avoid_: Invitation, Public link (only signed-in Users can use it)

**Activity log**: the record, read by the Owner of a Document or Folder, of the changes to who has access to it: a Share given or removed, a Share link created, revoked or accepted, a Move. Each entry says who did what, to whom and when, with the names (of a Team, of a Folder) as they were then. It leaves out content, Comments, and an Expiry running out. It goes with the Document or Folder, and an entry can be missing if it could not be written at the time.
_Avoid_: Audit log (it promises a record that cannot be lost, which this is not)

**Team**: a named group of Users, created by a User who becomes its Team owner. Granting a role to a Team gives it to every member, so adding or removing a member changes their access without touching the Grants. Only the Team owner manages its name and members, and cannot be removed from it.
_Avoid_: Group

**Manager**: a User allowed to create Teams. Managers are the usernames in the `MANAGERS` setting. Being a Manager gives no access to anyone else's Teams, Documents or Folders; a User who owns a Team keeps managing it after they stop being a Manager.

**Expiry**: the moment a time-limited Grant stops applying; a Grant without one lasts until it is revoked. The Owner sets it when sharing and sees it in the Shares list.

**Access expiry**: the moment a User's own access to a Document ends, shown to them as the time left. It is the latest Expiry among all the ways they have access (own Grant, Team, Folder), and there is none if any of those never expires, or if they are the Owner.

**Shares list**: the Grants currently on a Document, with their role and Expiry. Only the Owner can see it; it never includes the Owner.

**Folder**: a named container for Documents, created by a User who becomes its Owner. A Document is in at most one Folder; Folders do not nest. Owner, Editor and Viewer mean the same on a Folder, and a role held on a Folder also applies to every Document in it. Only an empty Folder can be deleted.

**Move**: putting a Document in a Folder, or taking it out. The Document then gets the roles of its new Folder and loses those of the old one. Only its Owner can do it, and only into a Folder they can edit.

**Revoke**: removing a User's or Team's Grant on a Document or Folder. The Owner cannot be revoked.
