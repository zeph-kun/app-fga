import { Plus } from "lucide-react";
import { createDocument } from "@/app/actions";
import { ActionForm, SubmitButton } from "./action-form";

/** Creates an untitled document in one click (in `folderId`, or at the root) and opens it. */
export function NewDocumentButton({
  folderId = null,
  variant = "default",
}: {
  folderId?: string | null;
  variant?: "default" | "outline";
}) {
  return (
    <ActionForm action={createDocument.bind(null, folderId)}>
      <SubmitButton variant={variant}>
        <Plus aria-hidden />
        New document
      </SubmitButton>
    </ActionForm>
  );
}
