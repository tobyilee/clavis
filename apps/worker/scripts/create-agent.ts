// Registers an AI agent and issues its first API token straight into D1 — the bootstrap path
// before any admin UI exists (Phase 0, T9). The token is written to an env file, never printed.
//
//   pnpm --filter @clavis/worker agent:create --name hermes [--role editor|viewer] [--local]
//
import { execFileSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ulid } from 'ulid';
import { generateToken, hashToken, tokenPrefix } from '../src/auth/tokens';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    role: { type: 'string', default: 'editor' },
    local: { type: 'boolean', default: false },
    out: { type: 'string', default: resolve(import.meta.dirname, '../../../.agent.env') },
  },
});

const name = values.name?.trim() ?? '';
if (!/^[\w.-]{1,64}$/.test(name)) throw new Error('--name must be 1-64 chars of [A-Za-z0-9_.-]');
if (values.role !== 'editor' && values.role !== 'viewer')
  throw new Error('--role must be editor or viewer');

const now = Date.now();
const actorId = ulid(now);
const token = generateToken();
const sql = `
INSERT INTO actors (id, kind, name, role, created_at) VALUES ('${actorId}', 'agent', '${name}', '${values.role}', ${now});
INSERT INTO api_tokens (id, actor_id, token_hash, prefix, created_at)
  VALUES ('${ulid(now)}', '${actorId}', '${await hashToken(token)}', '${tokenPrefix(token)}', ${now});`;

execFileSync(
  resolve(import.meta.dirname, '../node_modules/.bin/wrangler'),
  ['d1', 'execute', 'DB', values.local ? '--local' : '--remote', '-y', '--command', sql],
  { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'ignore', 'inherit'] },
);

const key = `CLAVIS_TOKEN_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
const out = values.out;
const lines = existsSync(out)
  ? readFileSync(out, 'utf8')
      .split('\n')
      .filter((l) => !l.startsWith(`${key}=`))
  : [];
writeFileSync(out, `${[...lines.filter(Boolean), `${key}=${token}`].join('\n')}\n`);
chmodSync(out, 0o600);
appendFileSync(out, '');
console.log(`Registered agent "${name}" (${values.role}), id ${actorId}.`);
console.log(`Token ${tokenPrefix(token)}… saved to ${out} as ${key} (not printed).`);
