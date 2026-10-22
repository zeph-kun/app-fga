"use client";

import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton } from "./action-form";

/** A button that opens a dialog asking for one name. The action usually redirects to what it created. */
export function CreateDialog({
  trigger,
  title,
  description,
  fieldName,
  label,
  placeholder,
  submitLabel,
  action,
  variant = "default",
  icon = <Plus aria-hidden />,
}: {
  trigger: string;
  title: string;
  description: string;
  fieldName: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  variant?: "default" | "outline";
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} />}>
        {icon}
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="flex flex-col gap-4" onSuccess={() => setOpen(false)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`create-${fieldName}`}>{label}</Label>
            <Input
              id={`create-${fieldName}`}
              name={fieldName}
              required
              maxLength={200}
              autoComplete="off"
              placeholder={placeholder}
            />
          </div>
          <div className="flex justify-end">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
