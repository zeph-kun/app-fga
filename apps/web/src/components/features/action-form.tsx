"use client";

import { Loader2 } from "lucide-react";
import { type ComponentProps, type ReactNode, useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

/**
 * A form wired to a Server Action that answers with an ActionState: errors show under
 * the fields, successes as a toast. The action may also redirect.
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, {});

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onSuccess?.();
    }
  }, [state, onSuccess]);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** Submit button that shows a spinner while the surrounding form is pending. */
export function SubmitButton({ children, disabled, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} {...props}>
      {pending && <Loader2 aria-hidden className="animate-spin" />}
      {children}
    </Button>
  );
}
