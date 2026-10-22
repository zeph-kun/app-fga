"use client";

import { Check, Loader2 } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/action-state";

/** Title and content of a document. Read-only for viewers; editors see a Save button once something changed. */
export function DocumentEditor({
  initialTitle,
  initialContent,
  canEdit,
  onSave,
}: {
  initialTitle: string;
  initialContent: string;
  canEdit: boolean;
  onSave: (formData: FormData) => Promise<ActionState>;
}) {
  const [saved, setSaved] = useState({ title: initialTitle, content: initialContent });
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const dirty = title !== saved.title || content !== saved.content;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await onSave(formData);
      setError(result.error);
      if (result.success) {
        setSaved({ title, content });
        toast.success(result.success);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="doc-title">Title</Label>
        <Input
          id="doc-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          readOnly={!canEdit}
          required
          maxLength={200}
          className="h-10 text-base font-medium"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="doc-content">Content</Label>
        <Textarea
          id="doc-content"
          name="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          readOnly={!canEdit}
          maxLength={50_000}
          placeholder={canEdit ? "Start writing…" : "This document is empty."}
          className="min-h-72 resize-y leading-relaxed"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {canEdit ? (
        <div className="flex items-center justify-end gap-3">
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <Button type="submit" disabled={!dirty || pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
            Save changes
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">You can read this document but not edit it.</p>
      )}
    </form>
  );
}
