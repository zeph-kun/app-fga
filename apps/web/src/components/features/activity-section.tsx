import { History } from "lucide-react";
import type { Activity, ActivityEvent } from "@/lib/api";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

const ROLE = { viewer: "Viewer", commenter: "Commenter", editor: "Editor" } as const;

/** One entry as a sentence, from the point of view of what happened to the resource. */
function describe(actor: string, event: ActivityEvent): string {
  switch (event.kind) {
    case "shared": {
      const who = event.subject.type === "team" ? `the team ${event.subject.name}` : event.subject.name;
      const end = event.expiresAt ? `, until ${when.format(event.expiresAt)} UTC` : "";
      return `${actor} gave ${who} the ${ROLE[event.role]} role${end}`;
    }
    case "unshared": {
      const who = event.subject.type === "team" ? `the team ${event.subject.name}` : event.subject.name;
      return `${actor} removed the access of ${who}`;
    }
    case "link-created": {
      const end = event.expiresAt ? `, until ${when.format(event.expiresAt)} UTC` : "";
      return `${actor} created a ${ROLE[event.role]} link ending in …${event.tokenSuffix}${end}`;
    }
    case "link-revoked":
      return `${actor} revoked the ${ROLE[event.role]} link ending in …${event.tokenSuffix}`;
    case "link-accepted":
      return `${actor} joined with the ${ROLE[event.role]} link ending in …${event.tokenSuffix}`;
    case "moved":
      if (event.from && event.to) return `${actor} moved it from “${event.from.name}” to “${event.to.name}”`;
      if (event.to) return `${actor} moved it into “${event.to.name}”`;
      if (event.from) return `${actor} moved it out of “${event.from.name}”`;
      return `${actor} moved it`;
  }
}

/**
 * The latest changes to who has access, newest first, for the Owner. Entries can be missing if
 * one could not be written at the time, and there are none for what happened before this existed.
 */
export function ActivitySection({ activity }: { activity: Activity }) {
  return (
    <section aria-labelledby="activity" className="flex flex-col gap-3 border-t pt-6">
      <h3 id="activity" className="flex items-center gap-1.5 text-sm font-medium">
        <History aria-hidden className="size-4 text-muted-foreground" />
        Activity
      </h3>
      {activity.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes to who has access yet.</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border">
          {activity.entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5 px-3 py-2">
              <span className="text-sm">{describe(entry.actorId, entry.event)}</span>
              <time dateTime={entry.at.toISOString()} className="text-xs text-muted-foreground">
                {when.format(entry.at)} UTC
              </time>
            </li>
          ))}
        </ol>
      )}
      {activity.more && <p className="text-xs text-muted-foreground">Showing the latest {activity.entries.length}.</p>}
    </section>
  );
}
