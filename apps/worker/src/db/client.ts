import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

// drizzle() walks the whole schema to build its relational config, so build it once per
// binding (one per isolate) instead of on every request — it showed up in request CPU (H2).
const instances = new WeakMap<D1Database, ReturnType<typeof create>>();
const create = (d1: D1Database) => drizzle(d1, { schema });

export function db(d1: D1Database) {
  let instance = instances.get(d1);
  if (!instance) {
    instance = create(d1);
    instances.set(d1, instance);
  }
  return instance;
}
export type Db = ReturnType<typeof db>;
