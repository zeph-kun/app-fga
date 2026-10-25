import type { SharedRole } from '../authorization/authorizer.js';

/** A Share link as stored: the token itself is never kept, only its hash. */
export interface ShareLink {
  readonly id: string;
  readonly resource: { readonly type: 'document' | 'folder'; readonly id: string };
  readonly role: SharedRole;
  /** SHA-256 of the token, hex. */
  readonly tokenHash: string;
  /** The last characters of the token, to tell links apart in a list. */
  readonly tokenSuffix: string;
  /** The username of the Owner who created it. */
  readonly createdBy: string;
  readonly createdAt: Date;
  /** When the link stops working, and the Grants it gives stop applying. Absent means never. */
  readonly expiresAt?: Date;
}
