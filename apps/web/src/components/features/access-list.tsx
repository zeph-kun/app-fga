import { Eye } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Everyone who can currently view this document or folder, Teams and folder
 * inheritance already resolved into real usernames — an access review in one glance.
 */
export function AccessList({ users }: { users: string[] }) {
  const sorted = [...users].sort((a, b) => a.localeCompare(b));
  return (
    <section aria-labelledby="access-list" className="flex flex-col gap-2">
      <h3 id="access-list" className="flex items-center gap-1.5 text-sm font-medium">
        <Eye aria-hidden className="size-4 text-muted-foreground" />
        Who can view this
      </h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one can view this right now.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {sorted.map((user) => (
            <li key={user}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground" />
                  }
                >
                  {user}
                </TooltipTrigger>
                <TooltipContent>Can currently view, directly or through a team or folder</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
