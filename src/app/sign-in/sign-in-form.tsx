"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Sign in failed");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-[440px] rounded-3xl bg-card p-10 shadow-sm ring-1 ring-border">
        <Folder className="size-11 fill-folder text-folder-tab" strokeWidth={1.5} />
        <h1 className="mt-6 text-3xl tracking-tight">Sign in</h1>
        <p className="mt-2 text-muted-foreground">to continue to Folders</p>

        <form onSubmit={handleLogin} className="mt-8 grid gap-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            aria-label="Email"
            required
            className="h-12 rounded-lg px-4 text-base"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Password"
            required
            className="h-12 rounded-lg px-4 text-base"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <a href="https://members.axxes.club/sign-up" className="text-sm font-medium text-primary hover:underline">
              Create account
            </a>
            <Button type="submit" className="h-10 rounded-full px-6" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Next
            </Button>
          </div>
        </form>
        <p className="mt-10 text-xs text-muted-foreground">
          Use your AXXES account — the same one you use for members.axxes.club.
        </p>
      </div>
    </div>
  );
}
