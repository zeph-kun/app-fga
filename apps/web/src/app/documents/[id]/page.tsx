import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccessList } from "@/components/features/access-list";
import { CommentsSection } from "@/components/features/comments-section";
import { ConfirmDelete } from "@/components/features/confirm-delete";
import { DocumentEditor } from "@/components/features/document-editor";
import { ExpiryLabel } from "@/components/features/expiry-label";
import { MoveToFolder } from "@/components/features/move-to-folder";
import { RoleBadge } from "@/components/features/role-badge";
import { ActivitySection } from "@/components/features/activity-section";
import { ShareLinksSection } from "@/components/features/share-links-section";
import { SharingSheet } from "@/components/features/sharing-sheet";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageShell } from "@/components/layout/page-shell";
import { ancestorsOf, inTreeOrder } from "@/lib/folder-tree";
import {
  ApiError,
  activitySchema,
  apiGet,
  commentSchema,
  documentViewSchema,
  folderSummarySchema,
  meSchema,
  shareLinkEntrySchema,
  shareSchema,
  teamSchema,
} from "@/lib/api";
import {
  addComment,
  createDocumentShareLink,
  deleteComment,
  deleteDocument,
  moveDocument,
  revokeDocumentShareLink,
  shareDocument,
  unshareDocument,
  updateDocument,
} from "../../actions";

async function loadDocument(id: string) {
  return apiGet(`/documents/${id}`, documentViewSchema).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
}

export async function generateMetadata({ params }: PageProps<"/documents/[id]">): Promise<Metadata> {
  const { id } = await params;
  const doc = await loadDocument(id);
  return { title: doc.title };
}

export default async function DocumentPage({ params, searchParams }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  const { new: justCreated } = await searchParams;
  const doc = await loadDocument(id);

  const canEdit = doc.access === "owner" || doc.access === "editor";
  const canComment = canEdit || doc.access === "commenter";
  const isOwner = doc.access === "owner";
  const [comments, me, shares, folders, teams, access, links, activity] = await Promise.all([
    apiGet(`/documents/${id}/comments`, z.array(commentSchema)),
    apiGet("/me", meSchema),
    isOwner ? apiGet(`/documents/${id}/shares`, z.array(shareSchema)) : [],
    apiGet("/folders", z.array(folderSummarySchema)),
    isOwner ? apiGet("/teams", z.array(teamSchema)) : [],
    isOwner ? apiGet(`/documents/${id}/access`, z.array(z.string())) : [],
    isOwner ? apiGet(`/documents/${id}/share-links`, z.array(shareLinkEntrySchema)) : [],
    isOwner ? apiGet(`/documents/${id}/activity`, activitySchema) : { entries: [], more: false },
  ]);
  const currentFolder = folders.find((folder) => folder.id === doc.folderId);
  // Levels come from every Folder the user sees, then only the ones they can edit are offered.
  const movable = inTreeOrder(folders).filter((folder) => folder.access === "owner" || folder.access === "editor");
  const folderTrail = doc.folderId
    ? [...ancestorsOf(folders, doc.folderId), ...(currentFolder ? [currentFolder] : [])].map((folder) => ({
        label: folder.name,
        href: `/folders/${folder.id}`,
      }))
    : [];

  return (
    <PageShell currentFolderId={doc.folderId}>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          ...(doc.folderId && folderTrail.length === 0
            ? [{ label: "Folder", href: `/folders/${doc.folderId}` }]
            : folderTrail),
          { label: doc.title },
        ]}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RoleBadge role={doc.access} />
            <span>Owned by {doc.ownerId}</span>
          </div>
        </div>
        {isOwner && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <MoveToFolder
              noun="document"
              currentFolderId={doc.folderId}
              folders={movable}
              onMove={moveDocument.bind(null, id)}
            />
            <SharingSheet
              name={doc.title}
              shares={shares}
              teams={teams}
              onShare={shareDocument.bind(null, id)}
              onUnshare={unshareDocument.bind(null, id)}
              note={
                doc.folderId
                  ? "People who have access through the folder aren't listed here."
                  : undefined
              }
            >
              <ShareLinksSection
                links={links}
                onCreate={createDocumentShareLink.bind(null, id)}
                onRevoke={revokeDocumentShareLink.bind(null, id)}
              />
              <ActivitySection activity={activity} />
            </SharingSheet>
            <ConfirmDelete
              label="Delete document"
              title={`Delete “${doc.title}”?`}
              description="The document and everyone’s access to it are removed for good. This cannot be undone."
              onConfirm={deleteDocument.bind(null, id)}
            />
          </div>
        )}
      </div>

      {doc.accessExpiresAt && (
        <div
          role="timer"
          className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-sm"
        >
          <Clock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <ExpiryLabel
            prefix="Your access to this document ends in"
            expiresAt={doc.accessExpiresAt}
            onExpiredGoTo={`/access-ended?${new URLSearchParams({ title: doc.title })}`}
          />
        </div>
      )}

      <DocumentEditor
        key={doc.id}
        autoFocusTitle={justCreated === "1" && canEdit}
        initialTitle={doc.title}
        initialContent={doc.content}
        canEdit={canEdit}
        onSave={updateDocument.bind(null, id)}
      />

      <div className="mt-8">
        <CommentsSection
          comments={comments}
          currentUser={me.id}
          canComment={canComment}
          isOwner={isOwner}
          onAdd={addComment.bind(null, id)}
          onDelete={deleteComment.bind(null, id)}
        />
      </div>

      {isOwner && (
        <div className="mt-8">
          <AccessList users={access} />
        </div>
      )}
    </PageShell>
  );
}
