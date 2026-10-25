"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import type { ActionState } from "@/lib/action-state";
import type { Role } from "@/lib/api";
import { ConfirmDelete } from "./confirm-delete";
import { startDocumentDrag } from "./document-drag";
import { ExpiryLabel } from "./expiry-label";
import { RoleBadge } from "./role-badge";

interface Item {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly folderId: string | null;
  readonly access?: Role;
  readonly accessExpiresAt?: Date;
  /** Shows the delete icon (with `onDelete`): the caller knows who may delete. */
  readonly deletable?: boolean;
}

/**
 * Documents as a list of links. `folderNames` adds the folder to the subtitle when it is known;
 * `movable` lets the Owner drag a row onto a `DocumentDropTarget`; `onDelete` adds a delete icon to the
 * rows marked `deletable`.
 */
export function DocumentList({
  documents,
  folderNames,
  movable = false,
  onDelete,
}: {
  documents: Item[];
  folderNames?: ReadonlyMap<string, string>;
  movable?: boolean;
  onDelete?: (id: string) => Promise<ActionState>;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {documents.map((doc) => {
        const folder = doc.folderId ? folderNames?.get(doc.folderId) : undefined;
        return (
          <li
            key={doc.id}
            className="flex items-center transition-colors hover:bg-muted/60 focus-within:bg-muted/60"
          >
            <Link
              href={`/documents/${doc.id}`}
              onDragStart={movable && doc.access === "owner" ? (event) => startDocumentDrag(event, doc) : (event) => event.preventDefault()}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText aria-hidden className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{doc.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {folder ? `${folder} · ` : ""}by {doc.ownerId}
                  {doc.accessExpiresAt && (
                    <>
                      {" · "}
                      <ExpiryLabel prefix="Your access ends in" expiresAt={doc.accessExpiresAt} />
                    </>
                  )}
                </span>
              </span>
              {doc.access && <RoleBadge role={doc.access} />}
            </Link>
            {onDelete && doc.deletable && (
              <span className="pr-3">
                <ConfirmDelete
                  size="icon-sm"
                  label="Delete document"
                  title={`Delete “${doc.title}”?`}
                  description="The document and everyone’s access to it are removed for good. This cannot be undone."
                  onConfirm={() => onDelete(doc.id)}
                />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
