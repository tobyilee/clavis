import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Workers AI and Vectorize only exist on Cloudflare (remoteBindings is off), so tests run
// without semantic search, as local dev does; semantic.test.ts puts in-memory fakes here.
const bindings = env as unknown as Record<string, unknown>;
bindings.AI = undefined;
bindings.VECTORIZE = undefined;
