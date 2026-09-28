import { createApp } from './app';
import { runBackupStep } from './backup/backup';
import { consumeEvents, type QueuedEvent } from './events';
import { EVENT_HANDLERS } from './events/handlers';
import { pruneNotifications } from './services/notifications';
import { queueStalePages } from './services/semantic';
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
        await pruneNotifications(env.DB, now);
        // Once a night (the window's first run): pages whose indexing gave up, say on the
        // daily Workers AI allowance, get another go (its allowance resets at 00:00 UTC).
        const at = new Date(now);
        if (at.getUTCHours() === 17 && at.getUTCMinutes() < 2) {
          const queued = await queueStalePages(env);
          if (queued > 0) console.log(JSON.stringify({ event: 'index-catch-up', queued }));
        }
        const { state, wrote, pruned } = await runBackupStep(env, new Date(now));
        if (wrote || pruned.length > 0) {
          console.log(JSON.stringify({ event: 'backup', wrote, pruned, ...state }));
        }
      })(),
    );
  },
  async queue(batch, env) {
    await consumeEvents(batch as MessageBatch<QueuedEvent>, env, EVENT_HANDLERS);
  },
} satisfies ExportedHandler<Env>;
