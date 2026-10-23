export interface Comment {
  readonly id: string;
  readonly documentId: string;
  /** The username of the User who wrote it. */
  readonly authorId: string;
  readonly text: string;
  readonly createdAt: Date;
}
