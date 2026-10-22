import { FileText } from "lucide-react";
import Link from "next/link";
import type { Role } from "@/lib/api";
import { RoleBadge } from "./role-badge";

interface Item {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly folderId: string | null;
  readonly access?: Role;
}

/** Documents as a list of links. `folderNames` adds the folder to the subtitle when it is known. */
export function DocumentList({
  documents,
  folderNames,
}: {
  documents: Item[];
  folderNames?: ReadonlyMap<string, string>;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {documents.map((doc) => {
        const folder = doc.folderId ? folderNames?.get(doc.folderId) : undefined;
        return (
          <li key={doc.id}>
            <Link
              href={`/documents/${doc.id}`}
              className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText aria-hidden className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{doc.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {folder ? `${folder} · ` : ""}by {doc.ownerId}
                </span>
              </span>
              {doc.access && <RoleBadge role={doc.access} />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
