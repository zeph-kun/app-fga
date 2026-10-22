import { FileText, FolderClosed, FolderPlus, Plus, Users2 } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { auth } from "@/auth";
import { DocumentList } from "@/components/features/document-list";
import { EmptyState } from "@/components/features/empty-state";
import { CreateDialog } from "@/components/features/create-dialog";
import { RoleBadge } from "@/components/features/role-badge";
import { SignIn } from "@/components/features/sign-in";
import { PageShell } from "@/components/layout/page-shell";
import { apiGet, documentViewSchema, folderSummarySchema, teamSchema } from "@/lib/api";
import { createDocument, createFolder, createTeam } from "./actions";

export default async function Home() {
  const session = await auth();
  if (!session || session.error) return <SignIn />;

  const [documents, folders, teams] = await Promise.all([
    apiGet("/documents", z.array(documentViewSchema)),
    apiGet("/folders", z.array(folderSummarySchema)),
    apiGet("/teams", z.array(teamSchema)),
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
            {folders.length > 0 && (
              <CreateDialog
                trigger="New folder"
                title="New folder"
                description="A role given on a folder also applies to every document in it."
                fieldName="name"
                label="Folder name"
                placeholder="e.g. Project Atlas"
                submitLabel="Create folder"
                action={createFolder}
                variant="outline"
                icon={<FolderPlus aria-hidden />}
              />
            )}
          </div>
          {folders.length === 0 ? (
            <EmptyState
              icon={FolderClosed}
              title="No folders yet"
              description="Group related documents in a folder, then share the whole folder in one step."
            >
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
              />
            </EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {folders.map((folder) => (
                <li key={folder.id}>
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
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="teams-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="teams-heading" className="text-xl font-semibold tracking-tight">
              Teams
            </h2>
            {teams.length > 0 && (
              <CreateDialog
                trigger="New team"
                title="New team"
                description="Share a document or folder with a team to give every member the same access at once."
                fieldName="name"
                label="Team name"
                placeholder="e.g. Reviewers"
                submitLabel="Create team"
                action={createTeam}
                variant="outline"
                icon={<Users2 aria-hidden />}
              />
            )}
          </div>
          {teams.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="No teams yet"
              description="Create a team, add its members, then share with the team instead of one person at a time."
            >
              <CreateDialog
                trigger="New team"
                title="New team"
                description="Share a document or folder with a team to give every member the same access at once."
                fieldName="name"
                label="Team name"
                placeholder="e.g. Reviewers"
                submitLabel="Create team"
                action={createTeam}
                icon={<Users2 aria-hidden />}
              />
            </EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link
                    href={`/teams/${team.id}`}
                    className="flex h-full items-center gap-3 rounded-xl border bg-card p-4 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Users2 aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{team.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">by {team.ownerId}</span>
                    </span>
                  </Link>
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
              <CreateDialog
                trigger="New document"
                title="New document"
                description="It starts empty, and only you can see it until you share it."
                fieldName="title"
                label="Title"
                placeholder="e.g. Meeting notes"
                submitLabel="Create document"
                action={createDocument.bind(null, null)}
                icon={<Plus aria-hidden />}
              />
            )}
          </div>
          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Create your first document, or ask someone to share theirs with you."
            >
              <CreateDialog
                trigger="New document"
                title="New document"
                description="It starts empty, and only you can see it until you share it."
                fieldName="title"
                label="Title"
                placeholder="e.g. Meeting notes"
                submitLabel="Create document"
                action={createDocument.bind(null, null)}
              />
            </EmptyState>
          ) : (
            <DocumentList documents={documents} folderNames={folderNames} />
          )}
        </section>
      </div>
    </PageShell>
  );
}
