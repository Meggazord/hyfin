import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { getProfile } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "HyFin: fund trade deals with stablecoins",
  description:
    "HyFin finances purchase orders for trading businesses. Investors fund a deal in USDC or USDT and are repaid with a fixed return when the buyer pays. Capital at risk.",
};

async function Account() {
  const profile = await getProfile();
  if (!profile) {
    return (
      <>
        <Link href="/login" className="text-muted hover:text-ink">
          Sign in
        </Link>
        <Link href="/signup" className="btn btn-sm">
          Create account
        </Link>
      </>
    );
  }
  return (
    <>
      {profile.role === "admin" && (
        <Link href="/admin" className="text-muted hover:text-ink">
          Admin
        </Link>
      )}
      <Link href="/dashboard" className="text-muted hover:text-ink">
        My investments
      </Link>
      <form action={signOut}>
        <button className="btn btn-quiet btn-sm">Sign out</button>
      </form>
    </>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/80 backdrop-blur-md">
          <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
            <Link href="/" className="font-display flex items-center gap-2.5 text-xl font-bold tracking-tight">
              <span className="logo-mark" aria-hidden>
                H
              </span>
              HyFin
            </Link>
            <div className="flex items-center gap-4 text-sm font-medium">
              <Link href="/#how" className="hidden text-muted hover:text-ink sm:inline">
                How it works
              </Link>
              <Link href="/risk" className="hidden text-muted hover:text-ink sm:inline">
                Risks
              </Link>
              <Suspense fallback={null}>
                <Account />
              </Suspense>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted">
            <p className="max-w-3xl">
              Capital at risk. You can lose all the money you invest. HyFin is not a bank, deals are not deposits and
              are not insured, and returns are not guaranteed. Deals are offered only to verified investors in
              permitted countries. Nothing on this site is investment advice.
            </p>
            <p className="mt-3">
              <Link href="/risk" className="underline">
                Read the full risk disclosure
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
