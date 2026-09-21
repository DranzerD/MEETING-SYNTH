// app/layout.tsx
import "./globals.css";
import Link from "next/link";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";

const sans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const navLinks = [
  { href: "/#features", label: "Product" },
  { href: "/#pipeline", label: "Architecture" },
  { href: "/#plans", label: "Playbooks" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <nav className="fixed inset-x-0 top-0 z-50">
          <div className="mx-auto max-w-7xl px-6 pt-6">
            <div className="rounded-full border border-white/10 bg-slate-950/80 px-6 py-3 backdrop-blur-xl shadow-[0_20px_60px_rgba(2,6,23,0.4)]">
              <div className="flex items-center justify-between gap-4">
                <Link
                  href="/"
                  className="flex items-center gap-3 text-sm font-semibold"
                >
                  <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-[10px] uppercase tracking-[0.4em] text-indigo-200">
                    Aura
                  </span>
                  <span className="text-white">Meeting Synth</span>
                </Link>
                <div className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
                  {navLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="tracking-wide transition hover:text-white"
                    >
                      {link.label}
                    </a>
                  ))}
                  <Link
                    href="/login"
                    className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em]"
                  >
                    Login
                  </Link>
                  <Link
                    href="/analyze"
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-indigo-900/30 transition hover:scale-[1.02]"
                  >
                    Launch workspace
                  </Link>
                </div>
                <Link
                  href="/analyze"
                  className="md:hidden rounded-full border border-indigo-500 px-4 py-2 text-sm font-semibold text-indigo-200"
                >
                  Analyze
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="flex min-h-screen flex-col pt-40 md:pt-36">
          {children}
        </main>

        <footer className="border-t border-white/5 bg-slate-950/90 py-10 text-sm text-slate-400">
          <div className="mx-auto grid max-w-7xl gap-8 px-6 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-indigo-300">
                Aura Intelligence
              </p>
              <p className="mt-3 text-slate-200">
                Documentation, demos, and enterprise pilots available on
                request. SOC2-ready hosting playbook included.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-white">Navigation</p>
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block text-slate-400 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
              <Link
                href="/analyze"
                className="block text-slate-400 hover:text-white"
              >
                Analyzer UI
              </Link>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-white">Talk to us</p>
              <a
                href="mailto:founders@auralabs.dev"
                className="text-indigo-300"
              >
                founders@auralabs.dev
              </a>
              <p>
                © {new Date().getFullYear()} Aura Intelligence. Built for teams
                who need decisions, not decks.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
