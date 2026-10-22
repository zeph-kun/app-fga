"use client";

import { Check, Loader2 } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/action-state";

/** A heading (folder or team name) that its owner can rename in place. */
export function InlineRenameTitle({
  name,
  label,
  canEdit,
  onRename,
}: {
  name: string;
  /** What this is, for the input's accessible name, e.g. "Folder name". */
  label: string;
  canEdit: boolean;
  onRename: (formData: FormData) => Promise<ActionState>;
}) {
  const [saved, setSaved] = useState(name);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>;
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await onRename(formData);
      setError(result.error);
      if (result.success) {
        setSaved(value);
        toast.success(result.success);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1">
          <Input
            name="name"
            aria-label={label}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            maxLength={200}
            className="h-10 border-transparent bg-transparent px-2 text-2xl! font-semibold tracking-tight hover:border-input focus-visible:bg-background dark:bg-transparent"
          />
        </h1>
        {value !== saved && (
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
            Rename
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
