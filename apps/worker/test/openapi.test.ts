import { describe, expect, it } from 'vitest';
import { buildApi, OPENAPI_CONFIG } from '../src/api/index';
import { OPENAPI_JSON } from '../src/api/openapi.gen';
import { call } from './helpers';

describe('OpenAPI document', () => {
  it('is up to date — run `pnpm --filter @clavis/worker openapi` after changing routes', () => {
    const current = JSON.parse(JSON.stringify(buildApi().getOpenAPI31Document(OPENAPI_CONFIG)));
    expect(JSON.parse(OPENAPI_JSON)).toEqual(current);
  });

  it('is served as the generated JSON', async () => {
    const res = await call('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.json.info.title).toBe('Clavis API');
  });
});
