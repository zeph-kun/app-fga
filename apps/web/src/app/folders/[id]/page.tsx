import { FileText, FolderPlus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccessList } from "@/components/features/access-list";
import { ConfirmDelete } from "@/components/features/confirm-delete";
import { CreateDialog } from "@/components/features/create-dialog";
import { DocumentList } from "@/components/features/document-list";
import { EmptyState } from "@/components/features/empty-state";
import { FolderDropStrip } from "@/components/features/folder-drop-strip";
import { FolderGrid } from "@/components/features/folder-grid";
import { InlineRenameTitle } from "@/components/features/inline-rename-title";
import { MoveToFolder } from "@/components/features/move-to-folder";
import { NewDocumentButton } from "@/components/features/new-document-button";
import { RoleBadge } from "@/components/features/role-badge";
import { ActivitySection } from "@/components/features/activity-section";
import { ShareLinksSection } from "@/components/features/share-links-section";
import { SharingSheet } from "@/components/features/sharing-sheet";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageShell } from "@/components/layout/page-shell";
import {
  ApiError,
  activitySchema,
  apiGet,
  folderSummarySchema,
  folderViewSchema,
  meSchema,
  shareLinkEntrySchema,
  shareSchema,
  teamSchema,
} from "@/lib/api";
import { moveTargets } from "@/lib/folder-tree";
import {
  createFolderShareLink,
  createSubfolder,
  deleteDocumentFromList,
  deleteFolder,
  moveDocument,
  moveFolder,
  renameFolder,
  revokeFolderShareLink,
  shareFolder,
  unshareFolder,
} from "../../actions";

async function loadFolder(id: string) {
  return apiGet(`/folders/${id}`, folderViewSchema).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
}

export async function generateMetadata({ params }: PageProps<"/folders/[id]">): Promise<Metadata> {
  const { id } = await params;
  const folder = await loadFolder(id);
  return { title: folder.name };
}

export default async function FolderPage({ params }: PageProps<"/folders/[id]">) {
  const { id } = await params;
  const folder = await loadFolder(id);

  const canEdit = folder.access === "owner" || folder.access === "editor";
  const isOwner = folder.access === "owner";
  const [allFolders, me, shares, teams, access, links, activity] = await Promise.all([
    apiGet("/folders", z.array(folderSummarySchema)),
    apiGet("/me", meSchema),
    isOwner ? apiGet(`/folders/${id}/shares`, z.array(shareSchema)) : [],
    isOwner ? apiGet("/teams", z.array(teamSchema)) : [],
    isOwner ? apiGet(`/folders/${id}/access`, z.array(z.string())) : [],
    isOwner ? apiGet(`/folders/${id}/share-links`, z.array(shareLinkEntrySchema)) : [],
    isOwner ? apiGet(`/folders/${id}/activity`, activitySchema) : { entries: [], more: false },
  ]);

  const accessOf = new Map(allFolders.map((summary) => [summary.id, summary.access]));
  const subfolders = folder.folders.map((child) => ({ ...child, access: accessOf.get(child.id) ?? "viewer" }));
  const targets = moveTargets(allFolders, id).filter((target) => target.access === "owner" || target.access === "editor");
  // The Owner of a Folder owns what is in it; otherwise only what the user wrote can be moved or deleted.
  const documents = folder.documents.map((doc) => ({ ...doc, owned: isOwner || doc.ownerId === me.id }));
  // Where a document of this page can be dropped: the Folder above (or the top) and the Folders at its level.
  const editable = (folderId: string) => ["owner", "editor"].includes(accessOf.get(folderId) ?? "");
  const above = folder.parentId === null ? [{ id: null, name: "Top level" }] : allFolders.filter((f) => f.id === folder.parentId && editable(f.id));
  const dropTargets = [
    ...above,
    ...allFolders.filter((f) => f.parentId === folder.parentId && f.id !== id && editable(f.id)).sort((a, b) => a.name.localeCompare(b.name)),
  ].map((target) => ({ id: target.id, name: target.name }));

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          ...folder.breadcrumb.map((ancestor) => ({ label: ancestor.name, href: `/folders/${ancestor.id}` })),
          { label: folder.name },
        ]}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <InlineRenameTitle
            name={folder.name}
            label="Folder name"
            canEdit={canEdit}
            onRename={renameFolder.bind(null, id)}
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RoleBadge role={folder.access} />
            <span>Owned by {folder.ownerId}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canEdit && (
            <CreateDialog
              trigger="New folder"
              title="New folder"
              description={`It is created in “${folder.name}” and gets its roles. Folders go 5 levels deep at most.`}
              fieldName="name"
              label="Folder name"
              placeholder="e.g. Plans"
              submitLabel="Create folder"
              action={createSubfolder.bind(null, id)}
              variant="outline"
              icon={<FolderPlus aria-hidden />}
            />
          )}
          {canEdit && (
            <NewDocumentButton folderId={id} />
          )}
          {isOwner && (
            <MoveToFolder
              noun="folder"
              currentFolderId={folder.parentId}
              folders={targets}
              onMove={moveFolder.bind(null, id)}
            />
          )}
          {isOwner && (
            <SharingSheet
              name={folder.name}
              shares={shares}
              teams={teams}
              onShare={shareFolder.bind(null, id)}
              onUnshare={unshareFolder.bind(null, id)}
              note="A role given on this folder also applies to every document in it."
            >
              <ShareLinksSection
                links={links}
                onCreate={createFolderShareLink.bind(null, id)}
                onRevoke={revokeFolderShareLink.bind(null, id)}
              />
              <ActivitySection activity={activity} />
            </SharingSheet>
          )}
          {isOwner && (
            <ConfirmDelete
              label="Delete folder"
              title={`Delete “${folder.name}”?`}
              description="Only an empty folder can be deleted: move or delete its documents first. This removes the folder and everyone's access to it, and cannot be undone."
              onConfirm={deleteFolder.bind(null, id)}
            />
          )}
        </div>
      </div>

      {(subfolders.length > 0 || canEdit) && (
        <section aria-labelledby="folder-folders" className="mt-8 flex flex-col gap-3">
          <h2 id="folder-folders" className="text-lg font-semibold tracking-tight">
            Folders
          </h2>
          {subfolders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No folders in this folder yet.</p>
          ) : (
            <FolderGrid folders={subfolders} onMoveDocument={moveDocument} />
          )}
        </section>
      )}

      <section aria-labelledby="folder-documents" className="mt-8 flex flex-col gap-3">
        <h2 id="folder-documents" className="text-lg font-semibold tracking-tight">
          Documents
        </h2>
        {documents.some((doc) => doc.owned) && <FolderDropStrip targets={dropTargets} onMoveDocument={moveDocument} />}
        {folder.documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nothing here yet"
            description={
              canEdit
                ? "Create a document in this folder, or move an existing one into it."
                : "There are no documents you can see in this folder."
            }
          />
        ) : (
          <DocumentList documents={documents} movable onDelete={deleteDocumentFromList} />
        )}
      </section>

      {isOwner && (
        <div className="mt-8">
          <AccessList users={access} />
        </div>
      )}
    </PageShell>
  );
}
