export interface Document {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: string;
  /** The Folder the Document is in, or null when it is at the root. */
  readonly folderId: string | null;
}
