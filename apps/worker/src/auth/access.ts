import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';

export interface AccessIdentity {
  email: string;
  name?: string;
}

// One key set per team domain per isolate: jose caches the fetched keys and refreshes them
// on rotation, so steady-state verification needs no subrequest.
const keySets = new Map<string, JWTVerifyGetKey>();
function remoteKeys(teamDomain: string): JWTVerifyGetKey {
  let keys = keySets.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', teamDomain));
    keySets.set(teamDomain, keys);
  }
  return keys;
}

/**
 * Verifies the Access JWT (signature, issuer, audience, expiry) and returns the person's email.
 * Returns null for tokens without an email, such as service-token requests from agents.
 */
export async function verifyAccessJwt(
  token: string,
  opts: { teamDomain: string; aud: string | string[]; keys?: JWTVerifyGetKey },
): Promise<AccessIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, opts.keys ?? remoteKeys(opts.teamDomain), {
      issuer: opts.teamDomain,
      audience: opts.aud,
    });
    if (typeof payload.email !== 'string' || !payload.email) return null;
    return {
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * The signed-in person, from Cloudflare Access. Prefers ctx.access; falls back to verifying the
 * Cf-Access-Jwt-Assertion header, because ctx.access was not populated for this Worker in
 * practice (Phase 0 S4 diagnostics).
 */
export async function accessIdentity(
  ctx: ExecutionContext,
  request: { url: string; jwtHeader: string | undefined },
  env: Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'> & { DEV_ACCESS_EMAIL?: string },
): Promise<AccessIdentity | null> {
  const dev = devIdentity(request.url, env.DEV_ACCESS_EMAIL);
  if (dev) return dev;
  const jwtHeader = request.jwtHeader;
  const fromCtx = await ctx.access?.getIdentity();
  if (fromCtx?.email) return { email: fromCtx.email, name: fromCtx.name };
  if (!jwtHeader) return null;
  return verifyAccessJwt(jwtHeader, {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    aud: parseAudiences(env.ACCESS_AUD),
  });
}

/**
 * ACCESS_AUD may list several comma-separated AUD tags: the Worker-wide Access app plus the
 * self-hosted app for /api/* and /mcp, which exists because the Workers-managed app ignores
 * Service Auth policies (Phase 0 S4).
 */
export function parseAudiences(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Local development has no Cloudflare Access, so `DEV_ACCESS_EMAIL` (set only in the
 * git-ignored .dev.vars) stands in for the signed-in person. It is honored for local hosts
 * only, so even a misconfigured production variable has no effect.
 */
export function devIdentity(url: string, email: string | undefined): AccessIdentity | null {
  if (!email) return null;
  return LOCAL_HOSTS.has(new URL(url).hostname) ? { email } : null;
}
