"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const res =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(f.get("name") || email) });
    setPending(false);
    if (res.error) setError(res.error.message ?? "Authentication failed");
    else router.replace("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">{mode === "login" ? "Sign in" : "Create your account"}</CardTitle>
          <CardDescription>Shopify × Meta Ads profitability dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <Field label="Name">
                <Input name="name" autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <Input name="email" type="email" required autoComplete="email" />
            </Field>
            <Field label="Password" hint={mode === "signup" ? "At least 10 characters" : undefined}>
              <Input name="password" type="password" required minLength={mode === "signup" ? 10 : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </Field>
            {error && <p role="alert" className="text-sm text-critical">{error}</p>}
            <Button type="submit" disabled={pending}>{pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</Button>
            <p className="text-center text-xs text-muted-foreground">
              {mode === "login" ? (
                <>No account? <Link className="text-primary" href="/signup">Sign up</Link></>
              ) : (
                <>Already registered? <Link className="text-primary" href="/login">Sign in</Link></>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
