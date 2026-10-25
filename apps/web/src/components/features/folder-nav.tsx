"use client";

import { ChevronRight, FolderClosed, House } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { ActionState } from "@/lib/action-state";
import type { Role } from "@/lib/api";
import { type TreeNode, buildTree, openedFor } from "@/lib/folder-tree";
import { cn } from "@/lib/utils";
import { DocumentDropTarget } from "./document-drag";

const STORAGE_KEY = "app-fga:folder-tree";

interface Item {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly access: Role;
}

/** Folders the user opened (true) or closed (false) by hand; the rest follow the Folder on screen. */
type Overrides = Readonly<Record<string, boolean>>;

// The whole text is the snapshot, so that React sees a change only when there is one. Kept in memory
// as well: the tree is drawn again on every page, and must keep what was opened without waiting for
// the browser, which may also refuse to store it (a private window, say).
let current: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function snapshot(): string {
  if (current !== null) return current;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function overridesIn(text: string): Overrides {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  } catch {
    return {};
  }
}

function save(overrides: Overrides): void {
  current = JSON.stringify(overrides);
  try {
    window.localStorage.setItem(STORAGE_KEY, current);
  } catch {
    // Not remembered for next time: the tree still works.
  }
  for (const listener of listeners) listener();
}

/**
 * The Folders as a tree to move around in, and onto which a document can be dropped to move it into
 * that Folder (or out to the top, on "All documents"). The Folder on screen is marked and its
 * ancestors are open; the other Folders left open are remembered by the browser.
 */
export function FolderNav({
  folders,
  currentId,
  onMoveDocument,
}: {
  folders: Item[];
  /** The Folder on screen, if there is one. */
  currentId: string | null;
  onMoveDocument: (documentId: string, folderId: string | null) => Promise<ActionState>;
}) {
  const overrides = overridesIn(useSyncExternalStore(subscribe, snapshot, () => "{}"));
  const ancestors = openedFor(folders, currentId);
  const isOpen = (id: string): boolean => overrides[id] ?? ancestors.has(id);

  function toggle(id: string): void {
    save({ ...overrides, [id]: !isOpen(id) });
  }

  return (
    <nav aria-label="Folders" className="flex flex-col gap-1 text-sm">
      <DocumentDropTarget folderId={null} hint="" onMove={onMoveDocument} className="rounded-md">
        <Link
          href="/"
          aria-current={currentId === null ? "page" : undefined}
          className={cn(rowClass, "px-2", currentId === null && "bg-accent font-medium text-accent-foreground")}
        >
          <House aria-hidden className="size-4 shrink-0" />
          All documents
        </Link>
      </DocumentDropTarget>
      <Branch nodes={buildTree(folders)} isOpen={isOpen} currentId={currentId} onToggle={toggle} onMoveDocument={onMoveDocument} />
    </nav>
  );
}

const rowClass =
  "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50";

function Branch({
  nodes,
  isOpen,
  currentId,
  onToggle,
  onMoveDocument,
  nested = false,
}: {
  nodes: TreeNode<Item>[];
  isOpen: (id: string) => boolean;
  currentId: string | null;
  onToggle: (id: string) => void;
  onMoveDocument: (documentId: string, folderId: string | null) => Promise<ActionState>;
  nested?: boolean;
}) {
  if (nodes.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-0.5", nested && "ml-3.5 border-l pl-1")}>
      {nodes.map(({ folder, children }) => {
        const open = isOpen(folder.id);
        const current = folder.id === currentId;
        return (
          <li key={folder.id}>
            <DocumentDropTarget
              folderId={folder.id}
              disabled={folder.access !== "owner" && folder.access !== "editor"}
              hint=""
              onMove={onMoveDocument}
              className="rounded-md"
            >
              <div className={cn("flex items-center", current && "rounded-md bg-accent text-accent-foreground")}>
                {children.length > 0 ? (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${folder.name}`}
                    onClick={() => onToggle(folder.id)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <ChevronRight aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-90")} />
                  </button>
                ) : (
                  <span aria-hidden className="size-6 shrink-0" />
                )}
                <Link
                  href={`/folders/${folder.id}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(rowClass, "pr-2", current && "font-medium")}
                >
                  <FolderClosed aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{folder.name}</span>
                </Link>
              </div>
            </DocumentDropTarget>
            {open && (
              <Branch
                nodes={children}
                isOpen={isOpen}
                currentId={currentId}
                onToggle={onToggle}
                onMoveDocument={onMoveDocument}
                nested
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
