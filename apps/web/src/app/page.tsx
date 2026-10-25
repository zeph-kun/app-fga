import { FileText, FolderPlus } from "lucide-react";
import { z } from "zod";
import { auth } from "@/auth";
import { DocumentDropTarget } from "@/components/features/document-drag";
import { DocumentList } from "@/components/features/document-list";
import { EmptyState } from "@/components/features/empty-state";
import { FolderGrid } from "@/components/features/folder-grid";
import { CreateDialog } from "@/components/features/create-dialog";
import { NewDocumentButton } from "@/components/features/new-document-button";
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
  // A Folder shared without its parent has no parent in this list: it shows at the top, like the others.
  const topFolders = folders.filter((folder) => folder.parentId === null);

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
          {topFolders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No folders yet. Group related documents in a folder with the folder button above, then share the
              whole folder in one step.
            </p>
          ) : (
            <FolderGrid folders={topFolders} onMoveDocument={moveDocument} />
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
