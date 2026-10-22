import { KeyRound, ShieldCheck } from "lucide-react";
import { login } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SignIn() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck aria-hidden className="size-6" />
          </span>
          <CardTitle className="text-xl">Welcome to app-fga</CardTitle>
          <CardDescription>
            Share documents and folders, and decide exactly who can read or edit each one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login}>
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
