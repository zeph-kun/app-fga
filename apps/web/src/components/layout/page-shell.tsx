import type { ReactNode } from "react";
import { z } from "zod";
import { moveDocument } from "@/app/actions";
import { FolderNav } from "@/components/features/folder-nav";
import { FolderNavSheet } from "@/components/features/folder-nav-sheet";
import { apiGet, folderSummarySchema } from "@/lib/api";
import { AppHeader } from "./app-header";

/**
 * Header, skip link and the page, with the Folder tree beside it. The tree needs the Folders the
 * user can see: pages that already ask for them share the request. `currentFolderId` marks the
 * Folder on screen (the one a Document is in, on a Document page).
 */
export async function PageShell({
  children,
  currentFolderId = null,
  sidebar = true,
}: {
  children: ReactNode;
  currentFolderId?: string | null;
  /** Off for a page that stands on its own, like the one a Share link opens. */
  sidebar?: boolean;
}) {
  const folders = sidebar ? await apiGet("/folders", z.array(folderSummarySchema)) : [];
  const nav = { folders, currentId: currentFolderId, onMoveDocument: moveDocument };

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring/50"
      >
        Skip to content
      </a>
      <AppHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4">
        {sidebar && (
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 lg:block">
            <FolderNav {...nav} />
          </aside>
        )}
        <main id="main" className={sidebar ? "min-w-0 max-w-5xl flex-1 py-8" : "mx-auto w-full max-w-5xl flex-1 py-8"}>
          {sidebar && (
            <div className="mb-4 lg:hidden">
              <FolderNavSheet {...nav} />
            </div>
          )}
          {children}
        </main>
      </div>
    </>
  );
}
