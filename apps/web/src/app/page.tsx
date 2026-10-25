import { FileText, FolderClosed, FolderPlus } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { auth } from "@/auth";
import { DocumentDropTarget } from "@/components/features/document-drag";
import { DocumentList } from "@/components/features/document-list";
import { EmptyState } from "@/components/features/empty-state";
import { CreateDialog } from "@/components/features/create-dialog";
import { NewDocumentButton } from "@/components/features/new-document-button";
import { RoleBadge } from "@/components/features/role-badge";
import { SignIn } from "@/components/features/sign-in";
import { PageShell } from "@/components/layout/page-shell";
import { apiGet, documentViewSchema, folderSummarySchema } from "@/lib/api";
import { createFolder, deleteDocumentFromList, moveDocument } from "./actions";

export default async function Home() {
  const session = await auth();
  if (!session || session.error) return <SignIn />;

  const [documents, folders] = await Promise.all([
    apiGet("/documents", z.array(documentViewSchema)),
    apiGet("/folders", z.array(folderSummarySchema)),
  ]);
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));

  return (
    <PageShell>
      <div className="flex flex-col gap-10">
        <section aria-labelledby="folders-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h1 id="folders-heading" className="text-xl font-semibold tracking-tight">
              Folders
            </h1>
            <CreateDialog
              trigger="New folder"
              title="New folder"
              description="A role given on a folder also applies to every document in it."
              fieldName="name"
              label="Folder name"
              placeholder="e.g. Project Atlas"
              submitLabel="Create folder"
              action={createFolder}
              icon={<FolderPlus aria-hidden />}
              iconOnly
            />
          </div>
          {folders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No folders yet. Group related documents in a folder with the folder button above, then share the
              whole folder in one step.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <DocumentDropTarget
                    folderId={folder.id}
                    disabled={folder.access !== "owner" && folder.access !== "editor"}
                    hint={`Move into ${folder.name}`}
                    onMove={moveDocument}
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
          )}
        </section>

        <section aria-labelledby="documents-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="documents-heading" className="text-xl font-semibold tracking-tight">
              Documents
            </h2>
            {documents.length > 0 && (
              <NewDocumentButton />
            )}
          </div>
          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Create your first document, or ask someone to share theirs with you."
            >
              <NewDocumentButton />
            </EmptyState>
          ) : (
            <DocumentDropTarget
              folderId={null}
              hint="Take out of its folder"
              onMove={moveDocument}
              className="pb-8"
            >
              <DocumentList
                documents={documents.map((doc) => ({ ...doc, deletable: doc.access === "owner" }))}
                folderNames={folderNames}
                movable
                onDelete={deleteDocumentFromList}
              />
            </DocumentDropTarget>
          )}
        </section>
      </div>
    </PageShell>
  );
}
