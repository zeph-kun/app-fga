import { Eye, Pencil, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/lib/api";
import { cn } from "@/lib/utils";

const ROLES = {
  owner: { label: "Owner", Icon: ShieldCheck, className: "bg-primary/10 text-primary" },
  editor: { label: "Editor", Icon: Pencil, className: "bg-success/15 text-success" },
  viewer: { label: "Viewer", Icon: Eye, className: "bg-muted text-muted-foreground" },
} as const;

/** The same badge everywhere a role is shown, so the meaning is learned once. */
export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const { label, Icon, className: tone } = ROLES[role];
  return (
    <Badge variant="secondary" className={cn("gap-1 font-medium", tone, className)}>
      <Icon aria-hidden className="size-3" />
      {label}
    </Badge>
  );
}
