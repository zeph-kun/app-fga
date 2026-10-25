"use client";

import { FolderClosed } from "lucide-react";
import Link from "next/link";
import type { ActionState } from "@/lib/action-state";
import type { Role } from "@/lib/api";
import { DocumentDropTarget } from "./document-drag";
import { RoleBadge } from "./role-badge";

interface Item {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly access: Role;
}

/** Folders as cards that open them, and onto which a document can be dragged to move it in. */
export function FolderGrid({
  folders,
  onMoveDocument,
}: {
  folders: Item[];
  onMoveDocument: (documentId: string, folderId: string | null) => Promise<ActionState>;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {folders.map((folder) => (
        <li key={folder.id}>
          <DocumentDropTarget
            folderId={folder.id}
            disabled={folder.access !== "owner" && folder.access !== "editor"}
            hint={`Move into ${folder.name}`}
            onMove={onMoveDocument}
            className="h-full"
          >
            <Link
              href={`/folders/${folder.id}`}
              className="flex h-full items-center gap-3 rounded-xl border bg-card p-4 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FolderClosed aria-hidden className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{folder.name}</span>
                <span className="block truncate text-xs text-muted-foreground">by {folder.ownerId}</span>
              </span>
              <RoleBadge role={folder.access} />
            </Link>
          </DocumentDropTarget>
        </li>
      ))}
    </ul>
  );
}
