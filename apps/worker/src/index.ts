import { createApp } from './app';
import { runBackupStep } from './backup/backup';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runBackupStep(env, new Date(controller.scheduledTime)).then(({ state, wrote, pruned }) => {
        if (wrote || pruned.length > 0) {
          console.log(JSON.stringify({ event: 'backup', wrote, pruned, ...state }));
        }
      }),
    );
  },
} satisfies ExportedHandler<Env>;
