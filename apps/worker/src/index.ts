import { createApp } from './app';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller, _env, _ctx) {
    // Nightly Markdown backup to R2 (D-30) — implemented in spike S6.
  },
} satisfies ExportedHandler<Env>;
