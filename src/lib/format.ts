export const usd = (n: number | string | null | undefined, digits = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(n ?? 0));

export const pct = (n: number | string, digits = 1) => `${Number(n).toFixed(digits).replace(/\.0+$/, "")}%`;

/** Simple (non-compounded) annualised rate for a fixed-term return. */
export const annualised = (returnPct: number | string, termDays: number) =>
  (Number(returnPct) * 365) / termDays;

export const day = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(iso),
      )
    : "—";

export const shortAddr = (a: string | null | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
