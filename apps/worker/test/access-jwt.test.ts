import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { devIdentity, parseAudiences, verifyAccessJwt } from '../src/auth/access';

const TEAM = 'https://team.cloudflareaccess.com';
const AUD = 'aud-123';

let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;
let otherPrivateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  keys = createLocalJWKSet({ keys: [jwk] });
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
});

function sign(
  claims: JWTPayload,
  opts: { key?: CryptoKey; iss?: string; aud?: string; exp?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(opts.iss ?? TEAM)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(opts.key ?? privateKey);
}

const verify = (token: string) => verifyAccessJwt(token, { teamDomain: TEAM, aud: AUD, keys });

describe('verifyAccessJwt', () => {
  it('returns the email from a valid Access JWT', async () => {
    expect(await verify(await sign({ email: 'owner@gmail.com' }))).toEqual({
      email: 'owner@gmail.com',
      name: undefined,
    });
  });

  it.each([
    ['another application', { aud: 'other-aud' }],
    ['another team', { iss: 'https://evil.cloudflareaccess.com' }],
    ['an expired token', { exp: '-1m' }],
  ])('rejects a token for %s', async (_, opts) => {
    expect(await verify(await sign({ email: 'owner@gmail.com' }, opts))).toBeNull();
  });

  it('rejects a token signed with a different key', async () => {
    const forged = await sign({ email: 'owner@gmail.com' }, { key: otherPrivateKey });
    expect(await verify(forged)).toBeNull();
  });

  it('returns null for service-token JWTs, which carry no email', async () => {
    expect(await verify(await sign({ common_name: 'client-id.access' }))).toBeNull();
  });

  it('returns null for garbage', async () => {
    expect(await verify('not-a-jwt')).toBeNull();
  });
});

describe('multiple Access applications', () => {
  it('accepts a token for any of the configured audiences', async () => {
    const aud = parseAudiences(' aud-worker , aud-api ,');
    expect(aud).toEqual(['aud-worker', 'aud-api']);
    const token = await sign({ email: 'owner@gmail.com' }, { aud: 'aud-api' });
    expect(await verifyAccessJwt(token, { teamDomain: TEAM, aud, keys })).not.toBeNull();
    const other = await sign({ email: 'owner@gmail.com' }, { aud: 'aud-other' });
    expect(await verifyAccessJwt(other, { teamDomain: TEAM, aud, keys })).toBeNull();
  });
});

describe('local development identity', () => {
  it('applies only to local hosts and only when configured', () => {
    expect(devIdentity('http://localhost:8787/api/v1/me', 'dev@gmail.com')).toEqual({
      email: 'dev@gmail.com',
    });
    expect(devIdentity('http://127.0.0.1:5173/api/v1/me', 'dev@gmail.com')).not.toBeNull();
    expect(
      devIdentity('https://clavis.crawl-proxy.workers.dev/api/v1/me', 'dev@gmail.com'),
    ).toBeNull();
    expect(devIdentity('http://localhost:8787/api/v1/me', undefined)).toBeNull();
  });
});
