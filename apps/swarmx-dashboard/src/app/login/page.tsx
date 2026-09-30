"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message || "Access token rejected.");
      }
      window.location.assign("/video");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg-base px-4 py-8 text-text-primary">
      <section className="w-full max-w-sm rounded-lg border border-control-border bg-bg-surface p-6 shadow-xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-text-muted">The Yap Engine</p>
        <h1 className="mt-2 text-xl font-semibold">Sign in to Creative Hub</h1>
        <p className="mt-2 text-sm text-text-secondary">Enter the server-configured dashboard access token. It is stored only in an HttpOnly session cookie.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium" htmlFor="dashboard-token">Access token</label>
          <input id="dashboard-token" name="token" type="password" autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} className="min-h-11 w-full rounded border border-control-border bg-bg-input px-3 text-base text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface" required />
          {error ? <p className="text-sm text-text-error" role="alert">{error}</p> : null}
          <Button className="min-h-11 w-full" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
        </form>
      </section>
    </main>
  );
}