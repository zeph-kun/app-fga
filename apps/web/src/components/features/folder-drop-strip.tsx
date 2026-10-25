"use client";

import { FolderClosed, House } from "lucide-react";
import Link from "next/link";
import type { ActionState } from "@/lib/action-state";
import { DocumentDropTarget } from "./document-drag";

export interface DropFolder {
  /** Null stands for the top: out of any folder. */
  readonly id: string | null;
  readonly name: string;
}

/**
 * The Folders next to the one on screen (its parent, or the top, and the Folders at its level),
 * where a document of this page can be dropped to move it there: they are on no other page the
 * document is listed on. Each one also opens the Folder.
 */
export function FolderDropStrip({
  targets,
  onMoveDocument,
}: {
  targets: DropFolder[];
  onMoveDocument: (documentId: string, folderId: string | null) => Promise<ActionState>;
}) {
  return (
    <div role="group" aria-label="Move a document by dropping it on a folder" className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Drop a document on a folder to move it:</span>
      {targets.map((target) => (
        <DocumentDropTarget
          key={target.id ?? "top"}
          folderId={target.id}
          hint=""
          onMove={onMoveDocument}
          className="rounded-full"
        >
          <Link
            href={target.id ? `/folders/${target.id}` : "/"}
            title={target.id ? `Open ${target.name}` : "Open your workspace"}
            className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {target.id ? <FolderClosed aria-hidden className="size-3.5" /> : <House aria-hidden className="size-3.5" />}
            <span className="max-w-40 truncate">{target.name}</span>
          </Link>
        </DocumentDropTarget>
      ))}
    </div>
  );
}
