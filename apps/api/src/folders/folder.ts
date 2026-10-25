export interface Folder {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  /** The Folder this one is in, or null for a Folder at the top. */
  readonly parentId: string | null;
}
