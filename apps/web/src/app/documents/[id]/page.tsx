import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccessList } from "@/components/features/access-list";
import { ConfirmDelete } from "@/components/features/confirm-delete";
import { DocumentEditor } from "@/components/features/document-editor";
import { MoveDocument } from "@/components/features/move-document";
import { RoleBadge } from "@/components/features/role-badge";
import { SharingSheet } from "@/components/features/sharing-sheet";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageShell } from "@/components/layout/page-shell";
import {
  ApiError,
  apiGet,
  documentViewSchema,
  folderSummarySchema,
  shareSchema,
  teamSchema,
} from "@/lib/api";
import {
  deleteDocument,
  moveDocument,
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

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  const doc = await loadDocument(id);

  const canEdit = doc.access === "owner" || doc.access === "editor";
  const isOwner = doc.access === "owner";
  const [shares, folders, teams, access] = await Promise.all([
    isOwner ? apiGet(`/documents/${id}/shares`, z.array(shareSchema)) : [],
    apiGet("/folders", z.array(folderSummarySchema)),
    isOwner ? apiGet("/teams", z.array(teamSchema)) : [],
    isOwner ? apiGet(`/documents/${id}/access`, z.array(z.string())) : [],
  ]);
  const currentFolder = folders.find((folder) => folder.id === doc.folderId);
  const movable = folders.filter((folder) => folder.access !== "viewer");

  return (
    <PageShell>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          ...(doc.folderId
            ? [{ label: currentFolder?.name ?? "Folder", href: `/folders/${doc.folderId}` }]
            : []),
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
            <MoveDocument
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
            />
          </div>
        )}
      </div>

      <DocumentEditor
        key={`${doc.title}\u0000${doc.content}`}
        initialTitle={doc.title}
        initialContent={doc.content}
        canEdit={canEdit}
        onSave={updateDocument.bind(null, id)}
      />

      {isOwner && (
        <div className="mt-8">
          <AccessList users={access} />
        </div>
      )}

      {isOwner && (
        <section aria-labelledby="doc-danger" className="mt-12 flex flex-col gap-3 rounded-xl border border-destructive/30 p-4">
          <h2 id="doc-danger" className="font-medium">
            Delete this document
          </h2>
          <p className="text-sm text-muted-foreground">
            The document and everyone’s access to it are removed for good.
          </p>
          <div>
            <ConfirmDelete
              label="Delete document"
              title={`Delete “${doc.title}”?`}
              description="This cannot be undone."
              onConfirm={deleteDocument.bind(null, id)}
            />
          </div>
        </section>
      )}
    </PageShell>
  );
}
