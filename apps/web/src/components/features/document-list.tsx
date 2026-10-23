"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import type { Role } from "@/lib/api";
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
}

/**
 * Documents as a list of links. `folderNames` adds the folder to the subtitle when it is known;
 * `movable` lets the Owner drag a row onto a `DocumentDropTarget`.
 */
export function DocumentList({
  documents,
  folderNames,
  movable = false,
}: {
  documents: Item[];
  folderNames?: ReadonlyMap<string, string>;
  movable?: boolean;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {documents.map((doc) => {
        const folder = doc.folderId ? folderNames?.get(doc.folderId) : undefined;
        return (
          <li key={doc.id}>
            <Link
              href={`/documents/${doc.id}`}
              onDragStart={movable && doc.access === "owner" ? (event) => startDocumentDrag(event, doc) : (event) => event.preventDefault()}
              className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
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
          </li>
        );
      })}
    </ul>
  );
}
