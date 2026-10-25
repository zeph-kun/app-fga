"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActionState } from "@/lib/action-state";

/**
 * A trash icon that opens a dialog stating the consequence and asking to confirm. `label` names the
 * icon for screen readers and in the tooltip, and the button that confirms. An action that redirects
 * leaves the page; one that does not closes the dialog and shows its success message.
 */
export function ConfirmDelete({
  label,
  title,
  description,
  onConfirm,
  size = "icon",
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => Promise<ActionState>;
  size?: "icon" | "icon-sm";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function confirm(): void {
    startTransition(async () => {
      const result = await onConfirm();
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (result.success) toast.success(result.success);
    });
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size={size}
              aria-label={label}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setOpen(true)}
            />
          }
        >
          <Trash2 aria-hidden />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setError(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={confirm}>
              {pending && <Loader2 aria-hidden className="animate-spin" />}
              {label}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
