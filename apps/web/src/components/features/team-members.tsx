"use client";

import { Loader2, UserPlus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton } from "./action-form";
import { UserPicker } from "./user-picker";

/** A team's roster. The owner can add and remove members here; a member can only see it. */
export function TeamMembers({
  members,
  ownerId,
  canManage,
  onAdd,
  onRemove,
}: {
  members: string[];
  ownerId: string;
  canManage: boolean;
  onAdd: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  onRemove: (userId: string) => Promise<ActionState>;
}) {
  const [pendingUser, setPendingUser] = useState<string>();
  const [pending, startTransition] = useTransition();
  // The picker keeps its own text: a new key empties it once a member is added.
  const [pickerKey, setPickerKey] = useState(0);

  function remove(userId: string): void {
    setPendingUser(userId);
    startTransition(async () => {
      const result = await onRemove(userId);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
      setPendingUser(undefined);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <ActionForm action={onAdd} className="flex items-start gap-2" onSuccess={() => setPickerKey((key) => key + 1)}>
          <div className="min-w-0 flex-1">
            <Label htmlFor="team-member" className="sr-only">
              Username to add
            </Label>
            <UserPicker
              key={pickerKey}
              id="team-member"
              name="userId"
              placeholder="Search a username to add"
              exclude={members}
            />
          </div>
          <SubmitButton>
            <UserPlus aria-hidden />
            Add
          </SubmitButton>
        </ActionForm>
      )}
      <ul className="divide-y rounded-lg border">
        {members.map((member) => (
          <li key={member} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-medium">{member}</span>
            {member === ownerId ? (
              <span className="text-xs text-muted-foreground">Owner</span>
            ) : (
              canManage && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${member} from the team`}
                  disabled={pending && pendingUser === member}
                  onClick={() => remove(member)}
                >
                  {pending && pendingUser === member ? (
                    <Loader2 aria-hidden className="animate-spin" />
                  ) : (
                    <X aria-hidden />
                  )}
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
