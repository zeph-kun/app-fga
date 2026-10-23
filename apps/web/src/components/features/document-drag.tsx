"use client";

import { type DragEvent, type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "cn";
import type { ActionState } from "@/lib/action-state";

/** Marks a drag as "a document being moved", so other drags (text, files) are ignored. */
export const DOCUMENT_DRAG_TYPE = "application/x-app-fga-document";

const draggedSchema = z.object({ id: z.string().uuid(), folderId: z.string().uuid().nullable() });

export function startDocumentDrag(event: DragEvent, document: { id: string; folderId: string | null }): void {
  event.dataTransfer.setData(DOCUMENT_DRAG_TYPE, JSON.stringify({ id: document.id, folderId: document.folderId }));
  event.dataTransfer.effectAllowed = "move";
}

/**
 * Where a dragged document can be dropped to move it into `folderId` (null: out of any folder).
 * The API still decides: a refused move shows its reason as a toast.
 */
export function DocumentDropTarget({
  folderId,
  disabled = false,
  hint,
  onMove,
  className,
  children,
}: {
  folderId: string | null;
  /** For a folder the user cannot edit. */
  disabled?: boolean;
  /** Shown over the target while a document is dragged above it. */
  hint: string;
  onMove: (documentId: string, folderId: string | null) => Promise<ActionState>;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [, startTransition] = useTransition();
  const accepts = (event: DragEvent) => !disabled && event.dataTransfer.types.includes(DOCUMENT_DRAG_TYPE);

  function drop(event: DragEvent): void {
    if (!accepts(event)) return;
    event.preventDefault();
    setOver(false);
    const dragged = draggedSchema.safeParse(safeJson(event.dataTransfer.getData(DOCUMENT_DRAG_TYPE)));
    if (!dragged.success) return;
    if (dragged.data.folderId === folderId) {
      toast.info("The document is already here.");
      return;
    }
    startTransition(async () => {
      const result = await onMove(dragged.data.id, folderId);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  return (
    <div
      onDragEnter={(event) => accepts(event) && setOver(true)}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={(event) => {
        // Moving over a child fires a leave on the parent: only react to leaving the target itself.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={drop}
      className={cn("relative rounded-xl transition-shadow", over && "ring-2 ring-ring", className)}
    >
      {children}
      {over && (
        <span className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow">
          {hint}
        </span>
      )}
    </div>
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
