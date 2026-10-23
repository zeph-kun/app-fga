"use client";

import { Check, CloudOff, Loader2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/action-state";
import { type AutosaveStatus, Autosaver } from "@/lib/autosaver";

const AUTOSAVE_DELAY_MS = 800;

interface Draft {
  readonly title: string;
  readonly content: string;
}

/**
 * Title and content of a document. Read-only for viewers; for editors, changes are saved
 * as they type and the status says where things stand.
 */
export function DocumentEditor({
  initialTitle,
  initialContent,
  canEdit,
  autoFocusTitle = false,
  onSave,
}: {
  initialTitle: string;
  initialContent: string;
  canEdit: boolean;
  /** Focus the title with its text selected, for a document that was just created. */
  autoFocusTitle?: boolean;
  onSave: (formData: FormData) => Promise<ActionState>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const titleInput = useRef<HTMLInputElement>(null);

  // `onSave` is bound to this document and the page keys the editor by document, so the first one stays right.
  const [autosaver] = useState(
    () =>
      new Autosaver<Draft>({
        initial: { title: initialTitle, content: initialContent },
        delayMs: AUTOSAVE_DELAY_MS,
        equals: (a, b) => a.title === b.title && a.content === b.content,
        canSave: (draft) => draft.title.trim() !== "",
        save: (draft) => {
          const formData = new FormData();
          formData.set("title", draft.title);
          formData.set("content", draft.content);
          return onSave(formData);
        },
      }),
  );
  const status = useSyncExternalStore(
    (listener) => autosaver.subscribe(listener),
    () => autosaver.status,
    () => autosaver.status,
  );

  useEffect(() => {
    if (autoFocusTitle) titleInput.current?.select();
  }, [autoFocusTitle]);

  // Leaving the page (a link, closing the tab) must not drop what was typed in the last moment.
  useEffect(() => {
    return () => void autosaver.flush();
  }, [autosaver]);
  useEffect(() => {
    if (status.state === "saved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status.state]);

  function edit(next: Draft): void {
    setTitle(next.title);
    setContent(next.content);
    autosaver.change(next);
  }

  function saveNow(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      void autosaver.flush();
    }
  }

  return (
    <div onKeyDown={canEdit ? saveNow : undefined} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="doc-title">Title</Label>
        <Input
          ref={titleInput}
          id="doc-title"
          name="title"
          value={title}
          onChange={(event) => edit({ title: event.target.value, content })}
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
          onChange={(event) => edit({ title, content: event.target.value })}
          readOnly={!canEdit}
          maxLength={50_000}
          placeholder={canEdit ? "Start writing…" : "This document is empty."}
          className="min-h-72 resize-y leading-relaxed"
        />
      </div>
      {canEdit ? (
        <div className="flex items-center justify-end gap-3">
          <SaveStatus status={status} untitled={title.trim() === ""} />
          {status.state === "error" && (
            <Button type="button" variant="outline" size="sm" onClick={() => void autosaver.flush()}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">You can read this document but not edit it.</p>
      )}
    </div>
  );
}

function SaveStatus({ status, untitled }: { status: AutosaveStatus; untitled: boolean }) {
  const base = "flex items-center gap-1.5 text-xs text-muted-foreground";
  if (status.state === "error") {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
        <CloudOff aria-hidden className="size-3.5" />
        Not saved: {status.error}
      </p>
    );
  }
  return (
    <p aria-live="polite" className={base}>
      {status.state === "saving" && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
      {status.state === "saved" && <Check aria-hidden className="size-3.5" />}
      {status.state === "saving" && "Saving…"}
      {status.state === "saved" && "All changes saved"}
      {status.state === "unsaved" && (untitled ? "Add a title to save" : "Unsaved changes")}
    </p>
  );
}
