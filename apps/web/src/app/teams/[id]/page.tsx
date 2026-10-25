import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmDelete } from "@/components/features/confirm-delete";
import { InlineRenameTitle } from "@/components/features/inline-rename-title";
import { TeamMembers } from "@/components/features/team-members";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageShell } from "@/components/layout/page-shell";
import { ApiError, apiGet, teamViewSchema } from "@/lib/api";
import { addTeamMember, deleteTeam, removeTeamMember, renameTeam } from "../../actions";

async function loadTeam(id: string) {
  return apiGet(`/teams/${id}`, teamViewSchema).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
}

export async function generateMetadata({ params }: PageProps<"/teams/[id]">): Promise<Metadata> {
  const { id } = await params;
  const team = await loadTeam(id);
  return { title: team.name };
}

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  const team = await loadTeam(id);
  const isOwner = team.role === "owner";

  return (
    <PageShell>
      <Breadcrumb items={[{ label: "Teams", href: "/teams" }, { label: team.name }]} />

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <InlineRenameTitle
            name={team.name}
            label="Team name"
            canEdit={isOwner}
            onRename={renameTeam.bind(null, id)}
          />
          <p className="text-sm text-muted-foreground">
            Owned by {team.ownerId} · {team.members.length}{" "}
            {team.members.length === 1 ? "member" : "members"}
          </p>
        </div>
        {isOwner && (
          <ConfirmDelete
            label="Delete team"
            title={`Delete “${team.name}”?`}
            description="Members lose any access they only had through this team. The team and its membership are removed for good, and this cannot be undone."
            onConfirm={deleteTeam.bind(null, id)}
          />
        )}
      </div>

      <section aria-labelledby="team-members" className="mt-8 flex flex-col gap-3">
        <h2 id="team-members" className="text-lg font-semibold tracking-tight">
          Members
        </h2>
        <p className="text-sm text-muted-foreground">
          Sharing a document or folder with this team gives every member below the same access.
        </p>
        <TeamMembers
          members={team.members}
          ownerId={team.ownerId}
          canManage={isOwner}
          onAdd={addTeamMember.bind(null, id)}
          onRemove={removeTeamMember.bind(null, id)}
        />
      </section>
    </PageShell>
  );
}
