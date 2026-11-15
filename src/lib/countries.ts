const names = new Intl.DisplayNames(["en"], { type: "region" });
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "ZZ", "QO", "XA", "XB", "AC", "CP", "DG", "EA", "IC", "TA", "CQ"]);

/** ISO 3166-1 alpha-2 codes with English names, built from the runtime's own region data. */
export const COUNTRIES: { code: string; name: string }[] = (() => {
  const out: { code: string; name: string }[] = [];
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const a of A)
    for (const b of A) {
      const code = a + b;
      if (NOT_COUNTRIES.has(code)) continue;
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        continue;
      }
      if (name && name !== code && !/unknown/i.test(name)) out.push({ code, name });
    }
  return out.sort((x, y) => x.name.localeCompare(y.name));
})();

export const countryName = (code: string | null | undefined) =>
  code ? (COUNTRIES.find((c) => c.code === code)?.name ?? code) : "—";
