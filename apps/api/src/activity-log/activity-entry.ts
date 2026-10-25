import type { SharedRole } from '../authorization/authorizer.js';

/** Who a Share was for, with the name it had then: a Team may be renamed or deleted later. */
export interface ActivitySubject {
  readonly type: 'user' | 'team';
  readonly id: string;
  readonly name: string;
}

/** A Folder as it was named when a Document moved in or out of it. */
export interface ActivityFolder {
  readonly id: string;
  readonly name: string;
}

/** What happened to a Document's or Folder's access. The actor is on the entry, not here. */
export type ActivityEvent =
  | { readonly kind: 'shared'; readonly subject: ActivitySubject; readonly role: SharedRole; readonly expiresAt?: Date }
  | { readonly kind: 'unshared'; readonly subject: ActivitySubject }
  | {
      readonly kind: 'link-created';
      readonly role: SharedRole;
      readonly tokenSuffix: string;
      readonly expiresAt?: Date;
    }
  | {
      readonly kind: 'link-revoked';
      readonly role: SharedRole;
      readonly tokenSuffix: string;
      readonly expiresAt?: Date;
    }
  /** The actor is the User who accepted the link. */
  | { readonly kind: 'link-accepted'; readonly role: SharedRole; readonly tokenSuffix: string }
  | { readonly kind: 'moved'; readonly from: ActivityFolder | null; readonly to: ActivityFolder | null };

export interface ActivityEntry {
  readonly id: string;
  /** The Document or Folder whose access changed. */
  readonly resource: { readonly type: 'document' | 'folder'; readonly id: string };
  /** The username of the User who did it. */
  readonly actorId: string;
  readonly at: Date;
  readonly event: ActivityEvent;
}
