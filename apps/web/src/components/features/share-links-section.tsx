"use client";

import { Check, Clock, Copy, Link2, Loader2, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionState, ShareLinkActionState } from "@/lib/action-state";
import type { ShareLinkEntry } from "@/lib/api";
import { ExpiryLabel } from "./expiry-label";
import { RoleBadge } from "./role-badge";
import { EXPIRY_ITEMS, ROLE_ITEMS } from "./share-options";

const createdOn = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

/**
 * The Share links of a document or folder, in its sharing panel: a link gives its role to any
 * signed-in User who opens it and accepts. Its address is shown once, when it is created,
 * since only a hash of it is kept; a lost address means revoking the link and making another.
 */
export function ShareLinksSection({
  links,
  onCreate,
  onRevoke,
}: {
  links: ShareLinkEntry[];
  onCreate: (previous: ShareLinkActionState, formData: FormData) => Promise<ShareLinkActionState>;
  onRevoke: (linkId: string) => Promise<ActionState>;
}) {
  const [state, formAction, creating] = useActionState(onCreate, {});
  const [pendingLink, setPendingLink] = useState<string>();
  const [pending, startTransition] = useTransition();

  function revoke(linkId: string): void {
    setPendingLink(linkId);
    startTransition(async () => {
      const result = await onRevoke(linkId);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
      setPendingLink(undefined);
    });
  }

  return (
    <section aria-labelledby="share-links" className="flex flex-col gap-3 border-t pt-6">
      <div className="flex flex-col gap-1">
        <h3 id="share-links" className="flex items-center gap-1.5 text-sm font-medium">
          <Link2 aria-hidden className="size-4 text-muted-foreground" />
          Share links
        </h3>
        <p className="text-xs text-muted-foreground">
          Anyone signed in who opens a link and accepts gets its role. Revoking a link keeps the access it already
          gave: remove that above.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="link-role">Role</Label>
            <Select name="role" defaultValue="viewer" items={ROLE_ITEMS}>
              <SelectTrigger id="link-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="link-expiry">Expires</Label>
            <Select name="expiresInHours" defaultValue="" items={EXPIRY_ITEMS}>
              <SelectTrigger id="link-expiry" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_ITEMS.map((item) => (
                  <SelectItem key={item.value || "never"} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" variant="outline" className="self-start" disabled={creating}>
          {creating ? <Loader2 aria-hidden className="animate-spin" /> : <Link2 aria-hidden />}
          Create link
        </Button>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </form>

      {state.token && <NewLink token={state.token} />}

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No links yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm">…{link.tokenSuffix}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>Created {createdOn.format(link.createdAt)}</span>
                  {link.expiresAt && (
                    <span className="flex items-center gap-1">
                      <Clock aria-hidden className="size-3" />
                      <ExpiryLabel expiresAt={link.expiresAt} />
                    </span>
                  )}
                </span>
              </span>
              <RoleBadge role={link.role} />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Revoke the link ending in ${link.tokenSuffix}`}
                disabled={pending && pendingLink === link.id}
                onClick={() => revoke(link.id)}
              >
                {pending && pendingLink === link.id ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The address of a link just created, to copy now: it cannot be shown again. */
function NewLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/join/${token}`;

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the address and copy it yourself.");
    }
  }

  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg border bg-muted/60 p-3">
      <Label htmlFor="new-link" className="text-xs">
        Copy this address now: it won’t be shown again.
      </Label>
      <div className="flex gap-2">
        <Input id="new-link" readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
