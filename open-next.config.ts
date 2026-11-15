import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is rendered per request, so no cache storage (R2/KV) is needed.
export default defineCloudflareConfig({});
