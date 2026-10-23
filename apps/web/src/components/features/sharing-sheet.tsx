"use client";

import { Clock, Loader2, UserPlus, Users, Users2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ActionState } from "@/lib/action-state";
import type { Share, Subject, Team } from "@/lib/api";
import { ActionForm, SubmitButton } from "./action-form";
import { ExpiryLabel } from "./expiry-label";
import { RoleBadge } from "./role-badge";

const ROLE_ITEMS = [
  { value: "viewer", label: "Viewer: can read" },
  { value: "editor", label: "Editor: can read and edit" },
];

const EXPIRY_ITEMS = [
  { value: "", label: "Never expires" },
  { value: "1", label: "1 hour" },
  { value: "24", label: "1 day" },
  { value: "168", label: "1 week" },
  { value: "720", label: "30 days" },
];

/** Who a document or folder is shared with, in a side panel: the Owner adds and removes shares here. */
export function SharingSheet({
  name,
  shares,
  teams,
  onShare,
  onUnshare,
  note,
}: {
  name: string;
  shares: Share[];
  /** The Owner's own teams: who a Share can give the role to besides individual people. */
  teams: Pick<Team, "id" | "name">[];
  onShare: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  onUnshare: (subject: Subject) => Promise<ActionState>;
  note?: string;
}) {
  const [subjectType, setSubjectType] = useState<"user" | "team">("user");
  const [pendingSubject, setPendingSubject] = useState<string>();
  const [pending, startTransition] = useTransition();

  function remove(subject: Subject): void {
    setPendingSubject(subjectKey(subject));
    startTransition(async () => {
      const result = await onUnshare(subject);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
      setPendingSubject(undefined);
    });
  }

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        <Users aria-hidden />
        Share
        {shares.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
            {shares.length}
          </span>
        )}
      </SheetTrigger>
      <SheetContent className="gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Share “{name}”</SheetTitle>
          <SheetDescription>Give a person or a team access, for as long as you choose.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-4">
          <ActionForm action={onShare} className="flex flex-col gap-3">
            <RadioGroup
              name="subjectType"
              value={subjectType}
              onValueChange={(value) => setSubjectType(value as "user" | "team")}
              className="grid-flow-col grid-cols-2"
            >
              <Label className="flex items-center gap-2 text-sm font-normal">
                <RadioGroupItem value="user" />
                Person
              </Label>
              <Label
                className="flex items-center gap-2 text-sm font-normal data-disabled:text-muted-foreground"
                data-disabled={teams.length === 0 ? "" : undefined}
              >
                <RadioGroupItem value="team" disabled={teams.length === 0} />
                Team
              </Label>
            </RadioGroup>

            {subjectType === "user" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="share-subject">Username</Label>
                <Input
                  id="share-subject"
                  name="subjectId"
                  required
                  autoComplete="off"
                  placeholder="e.g. bob"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="share-team">Team</Label>
                <Select name="subjectId" items={teams.map((t) => ({ value: t.id, label: t.name }))}>
                  <SelectTrigger id="share-team" className="w-full">
                    <SelectValue placeholder="Choose a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="share-role">Role</Label>
                <Select name="role" defaultValue="viewer" items={ROLE_ITEMS}>
                  <SelectTrigger id="share-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="share-expiry">Expires</Label>
                <Select name="expiresInHours" defaultValue="" items={EXPIRY_ITEMS}>
                  <SelectTrigger id="share-expiry" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_ITEMS.map((item) => (
                      <SelectItem key={item.value || "never"} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <SubmitButton className="self-start">
              <UserPlus aria-hidden />
              Share
            </SubmitButton>
          </ActionForm>

          <section aria-labelledby="share-list" className="flex flex-col gap-2">
            <h3 id="share-list" className="text-sm font-medium">
              People with access
            </h3>
            {shares.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {shares.map((share) => {
                  return (
                    <li key={subjectKey(share.subject)} className="flex items-center gap-3 px-3 py-2">
                      {share.subject.type === "team" ? (
                        <Users2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <span className="sr-only">Person:</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{share.name}</span>
                        {share.expiresAt && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock aria-hidden className="size-3" />
                            <ExpiryLabel expiresAt={share.expiresAt} />
                          </span>
                        )}
                      </span>
                      <RoleBadge role={share.role} />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove access for ${share.name}`}
                        disabled={pending && pendingSubject === subjectKey(share.subject)}
                        onClick={() => remove(share.subject)}
                      >
                        {pending && pendingSubject === subjectKey(share.subject) ? (
                          <Loader2 aria-hidden className="animate-spin" />
                        ) : (
                          <X aria-hidden />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function subjectKey(subject: Subject): string {
  return `${subject.type}:${subject.id}`;
}
