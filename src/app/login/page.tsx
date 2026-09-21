"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data?.error || "Login failed. Please try again.");
        return;
      }
      const next = searchParams.get("next") || "/dashboard";
      router.push(next);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate min-h-[80vh] bg-slate-950 px-6 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.25),_transparent_60%)]" />
      </div>
      <div className="mx-auto grid max-w-5xl gap-10 rounded-[32px] border border-white/10 bg-white/5 p-8 md:grid-cols-2">
        <div className="space-y-6 text-slate-200">
          <p className="text-xs uppercase tracking-[0.4em] text-indigo-200">
            Account
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Sign in to Meeting Synth.
          </h1>
          <p className="text-sm text-slate-300">
            Access the analyzer, your meeting dashboard, and grounded chat
            over everything you&apos;ve indexed so far.
          </p>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
            <p className="font-semibold text-white">Need an account?</p>
            <p className="text-slate-300">Create one in under a minute.</p>
            <Link href="/register" className="mt-3 inline-flex text-indigo-300">
              Create an account →
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-8 shadow-[0_25px_80px_rgba(2,6,23,0.7)]">
          <h2 className="text-2xl font-semibold text-white">Welcome back</h2>
          <p className="text-sm text-slate-400">
            Sign in with the email and password you registered with.
          </p>
          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm">
              <span className="text-slate-400">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                required
              />
            </label>
            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-indigo-900/30 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Log in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
