// Cloudflare entry point: serves the site and runs the deposit scanner on a schedule.
// Generated at build time by `opennextjs-cloudflare build`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import handler from "./.open-next/worker.js";

type Env = { CRON_SECRET?: string };

const worker = {
  fetch: handler.fetch,

  // Cron trigger (see wrangler.jsonc). Calls the same protected route an external scheduler would.
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    if (!env.CRON_SECRET) {
      console.error("CRON_SECRET is not set; skipping deposit scan");
      return;
    }
    const request = new Request("https://hyfin.internal/api/cron/scan", {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    ctx.waitUntil(
      handler.fetch(request, env, ctx).then(async (res: Response) => {
        console.log("deposit scan", res.status, (await res.text()).slice(0, 500));
      }),
    );
  },
};

export default worker;
