import { Users2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { CreateDialog } from "@/components/features/create-dialog";
import { EmptyState } from "@/components/features/empty-state";
import { PageShell } from "@/components/layout/page-shell";
import { apiGet, meSchema, teamSchema } from "@/lib/api";
import { createTeam } from "../actions";

export const metadata: Metadata = { title: "Teams" };

const NEW_TEAM = {
  trigger: "New team",
  title: "New team",
  description: "Share a document or folder with a team to give every member the same access at once.",
  fieldName: "name",
  label: "Team name",
  placeholder: "e.g. Reviewers",
  submitLabel: "Create team",
  action: createTeam,
  icon: <Users2 aria-hidden />,
} as const;

export default async function TeamsPage() {
  const [teams, me] = await Promise.all([apiGet("/teams", z.array(teamSchema)), apiGet("/me", meSchema)]);

  return (
    <PageShell>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Teams</h1>
          {me.canCreateTeam && teams.length > 0 && <CreateDialog {...NEW_TEAM} variant="outline" />}
        </div>
        {teams.length === 0 ? (
          <EmptyState
            icon={Users2}
            title="No teams yet"
            description={
              me.canCreateTeam
                ? "Create a team, add its members, then share with the team instead of one person at a time."
                : "Ask a manager to create a team. Once you are a member, you can share with it instead of one person at a time."
            }
          >
            {me.canCreateTeam && <CreateDialog {...NEW_TEAM} />}
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
      </div>
    </PageShell>
  );
}
