import { KeyRound, Link2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ActionForm, SubmitButton } from "@/components/features/action-form";
import { ExpiryLabel } from "@/components/features/expiry-label";
import { RoleBadge } from "@/components/features/role-badge";
import { PageShell } from "@/components/layout/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiGet, shareLinkPreviewSchema } from "@/lib/api";
import { cn } from "@/lib/utils";
import { acceptShareLink, loginToJoin } from "../../actions";

export const metadata: Metadata = { title: "Join" };

/** Share links are base64url; anything else cannot be one, so there is nothing to ask the API. */
const TOKEN = /^[A-Za-z0-9_-]{1,100}$/;

/** Where someone lands from a Share link: they see what it gives, and accept it with a click. */
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  if (!TOKEN.test(token)) notFound();

  const session = await auth();
  if (!session || session.error) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck aria-hidden className="size-6" />
            </span>
            <CardTitle className="text-xl">You’ve been invited</CardTitle>
            <CardDescription>Sign in to see what you’re invited to and to accept.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={loginToJoin.bind(null, token)}>
              <Button type="submit" size="lg" className="w-full">
                <KeyRound aria-hidden />
                Sign in with Keycloak
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  const preview = await apiGet(`/share-links/${token}`, shareLinkPreviewSchema).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const { resource } = preview;

  return (
    <PageShell>
      <div className="flex justify-center py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Link2 aria-hidden className="size-6" />
            </span>
            <CardTitle className="text-xl">
              Join {resource.type === "folder" ? "the folder" : "the document"} “{resource.name}”
            </CardTitle>
            <CardDescription>{preview.invitedBy} invites you to work on it.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">You’ll be</span>
              <RoleBadge role={preview.role} />
            </div>
            {preview.expiresAt && (
              <p className="text-muted-foreground">
                <ExpiryLabel prefix="Your access would end in" expiresAt={preview.expiresAt} />
              </p>
            )}
            {resource.type === "folder" && (
              <p className="text-muted-foreground">The role also applies to every document in the folder.</p>
            )}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <ActionForm action={acceptShareLink.bind(null, token)} className="flex flex-col gap-3">
              <SubmitButton size="lg">Join</SubmitButton>
            </ActionForm>
            <Link href="/" className={cn(buttonVariants({ variant: "ghost" }))}>
              Not now
            </Link>
          </CardFooter>
        </Card>
      </div>
    </PageShell>
  );
}
