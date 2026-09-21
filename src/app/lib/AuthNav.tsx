"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SessionUser = { name: string; email: string; role: string } | null;

export default function AuthNav() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  };

  if (!loaded) {
    return <span className="h-8 w-16" aria-hidden />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em]"
      >
        Login
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="hidden text-slate-300 sm:inline">{user.name}</span>
      <button
        onClick={handleLogout}
        className="rounded-full border border-white/20 px-4 py-2 font-semibold uppercase tracking-[0.4em] transition hover:border-white/40"
      >
        Log out
      </button>
    </div>
  );
}
