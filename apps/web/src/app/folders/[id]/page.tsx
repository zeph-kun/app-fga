import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccessList } from "@/components/features/access-list";
import { ConfirmDelete } from "@/components/features/confirm-delete";
import { DocumentList } from "@/components/features/document-list";
import { EmptyState } from "@/components/features/empty-state";
import { InlineRenameTitle } from "@/components/features/inline-rename-title";
import { NewDocumentButton } from "@/components/features/new-document-button";
import { RoleBadge } from "@/components/features/role-badge";
import { ActivitySection } from "@/components/features/activity-section";
import { ShareLinksSection } from "@/components/features/share-links-section";
import { SharingSheet } from "@/components/features/sharing-sheet";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageShell } from "@/components/layout/page-shell";
import { ApiError, activitySchema, apiGet, folderViewSchema, shareLinkEntrySchema, shareSchema, teamSchema } from "@/lib/api";
import {
  createFolderShareLink,
  deleteFolder,
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
  const [shares, teams, access, links, activity] = await Promise.all([
    isOwner ? apiGet(`/folders/${id}/shares`, z.array(shareSchema)) : [],
    isOwner ? apiGet("/teams", z.array(teamSchema)) : [],
    isOwner ? apiGet(`/folders/${id}/access`, z.array(z.string())) : [],
    isOwner ? apiGet(`/folders/${id}/share-links`, z.array(shareLinkEntrySchema)) : [],
    isOwner ? apiGet(`/folders/${id}/activity`, activitySchema) : { entries: [], more: false },
  ]);

  return (
    <PageShell>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: folder.name }]} />

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
            <NewDocumentButton folderId={id} />
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
        </div>
      </div>

      <section aria-labelledby="folder-documents" className="mt-8 flex flex-col gap-3">
        <h2 id="folder-documents" className="text-lg font-semibold tracking-tight">
          Documents
        </h2>
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
          <DocumentList documents={folder.documents} />
        )}
      </section>

      {isOwner && (
        <div className="mt-8">
          <AccessList users={access} />
        </div>
      )}

      {isOwner && (
        <section aria-labelledby="folder-danger" className="mt-12 flex flex-col gap-3 rounded-xl border border-destructive/30 p-4">
          <h2 id="folder-danger" className="font-medium">
            Delete this folder
          </h2>
          <p className="text-sm text-muted-foreground">
            Only an empty folder can be deleted. Move or delete its documents first.
          </p>
          <div>
            <ConfirmDelete
              label="Delete folder"
              title={`Delete “${folder.name}”?`}
              description="This removes the folder and everyone's access to it. This cannot be undone."
              onConfirm={deleteFolder.bind(null, id)}
            />
          </div>
        </section>
      )}
    </PageShell>
  );
}
