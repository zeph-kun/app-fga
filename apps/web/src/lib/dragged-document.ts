export interface DraggedDocument {
  readonly id: string;
  readonly folderId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads what `startDocumentDrag` put in a drag: the document and the folder it comes from, or
 * `undefined` for anything else. Plain checks rather than zod, which would be sent to every browser
 * (about 30 kB compressed) to check two fields.
 */
export function parseDraggedDocument(text: string): DraggedDocument | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || !("id" in value) || !("folderId" in value)) return undefined;
  const { id, folderId } = value;
  if (typeof id !== "string" || !UUID.test(id)) return undefined;
  if (folderId !== null && (typeof folderId !== "string" || !UUID.test(folderId))) return undefined;
  return { id, folderId };
}
