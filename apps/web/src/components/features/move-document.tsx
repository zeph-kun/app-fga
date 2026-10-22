"use client";

import { FolderInput, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionState } from "@/lib/action-state";

const ROOT = "root";

/** Moves a document into one of the folders the user can edit, or back to the root. */
export function MoveDocument({
  currentFolderId,
  folders,
  onMove,
}: {
  currentFolderId: string | null;
  folders: { id: string; name: string }[];
  onMove: (folderId: string | null) => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentFolderId ?? ROOT);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const items = [{ value: ROOT, label: "No folder (root)" }, ...folders.map((f) => ({ value: f.id, label: f.name }))];

  function move(): void {
    startTransition(async () => {
      const result = await onMove(value === ROOT ? null : value);
      setError(result.error);
      if (result.success) {
        toast.success(result.success);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(currentFolderId ?? ROOT);
          setError(undefined);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <FolderInput aria-hidden />
        Move
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move document</DialogTitle>
          <DialogDescription>
            The document gets the access of its new folder and loses the access of the previous one.
            Only folders you can edit are listed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="move-folder">Folder</Label>
          <Select value={value} onValueChange={(next) => next && setValue(next)} items={items}>
            <SelectTrigger id="move-folder" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button onClick={move} disabled={pending || value === (currentFolderId ?? ROOT)}>
            {pending && <Loader2 aria-hidden className="animate-spin" />}
            Move here
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
