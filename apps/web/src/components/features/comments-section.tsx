"use client";

import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/action-state";
import type { Comment } from "@/lib/api";
import { ActionForm, SubmitButton } from "./action-form";

const WHEN = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/**
 * The comments on a document, oldest first. Whoever can comment gets a form; a comment is
 * deleted by its author or by the document's Owner.
 */
export function CommentsSection({
  comments,
  currentUser,
  canComment,
  isOwner,
  onAdd,
  onDelete,
}: {
  comments: Comment[];
  currentUser: string;
  canComment: boolean;
  isOwner: boolean;
  onAdd: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  onDelete: (commentId: string) => Promise<ActionState>;
}) {
  const [pendingId, setPendingId] = useState<string>();
  const [pending, startTransition] = useTransition();

  function remove(commentId: string): void {
    setPendingId(commentId);
    startTransition(async () => {
      const result = await onDelete(commentId);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
      setPendingId(undefined);
    });
  }

  return (
    <section aria-labelledby="comments-heading" className="flex flex-col gap-3">
      <h2 id="comments-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <MessageSquare aria-hidden className="size-4 text-muted-foreground" />
        Comments
        {comments.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">
            {comments.length}
          </span>
        )}
      </h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {comments.map((comment) => {
            const mine = comment.authorId === currentUser;
            const busy = pending && pendingId === comment.id;
            return (
              <li key={comment.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{comment.authorId}</span>
                    <time dateTime={comment.createdAt.toISOString()} suppressHydrationWarning className="text-xs text-muted-foreground">
                      {WHEN.format(comment.createdAt)}
                    </time>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{comment.text}</p>
                </div>
                {(mine || isOwner) && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete the comment by ${comment.authorId}`}
                    disabled={busy}
                    onClick={() => remove(comment.id)}
                  >
                    {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canComment ? (
        <ActionForm action={onAdd} className="flex flex-col gap-2">
          <Label htmlFor="new-comment">Add a comment</Label>
          <Textarea id="new-comment" name="text" required maxLength={2000} placeholder="Write a comment…" className="min-h-20" />
          <div>
            <SubmitButton>
              <Send aria-hidden />
              Comment
            </SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <p className="text-xs text-muted-foreground">You can read the comments but not add any.</p>
      )}
    </section>
  );
}
