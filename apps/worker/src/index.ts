import { createApp } from './app';
import { runBackupStep } from './backup/backup';
import { purgeTrash } from './services/trash';

const app = createApp();

export default {
  fetch: app.fetch,
  // The nightly Cron window (D-30) also empties the trash (D-36): each run purges up to 50
  // expired pages before its backup step, so no extra Cron trigger is needed.
  async scheduled(controller, env, ctx) {
    const now = controller.scheduledTime;
    ctx.waitUntil(
      (async () => {
        const purged = await purgeTrash(env.DB, env.FILES, now);
        if (purged > 0) console.log(JSON.stringify({ event: 'trash-purge', purged }));
        const { state, wrote, pruned } = await runBackupStep(env, new Date(now));
        if (wrote || pruned.length > 0) {
          console.log(JSON.stringify({ event: 'backup', wrote, pruned, ...state }));
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
