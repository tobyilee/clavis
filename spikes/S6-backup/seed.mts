// Generates seed.sql: 500 pages (~10KB each, 50 parents x 9 children) in a throwaway ZZS6 space.
import { writeFileSync } from 'node:fs';
import { generateDoc } from '../S2-S3-cpu/gen.ts';

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const now = Date.now();
const body = generateDoc(10 * 1024);
const lines = [
  `INSERT INTO actors (id, kind, name, email, role, created_at) VALUES ('s6-actor','agent','s6-seed',NULL,'editor',${now});`,
  `INSERT INTO spaces (id, key, name, created_at) VALUES ('s6-space','ZZS6','S6 backup spike',${now});`,
];
let n = 0;
for (let r = 0; r < 50; r++) {
  const parent = `s6-p${n}`;
  const rows: [string, string | null, string][] = [[parent, null, `결제 설계 문서 ${r}`]];
  for (let c = 0; c < 9; c++) rows.push([`s6-p${n + 1 + c}`, parent, `하위 문서 ${r}-${c}`]);
  for (const [id, par, title] of rows) {
    lines.push(
      `INSERT INTO pages (id, short_id, space_id, parent_id, position, title, slug, content, doc_type, status, created_by, updated_by, created_at, updated_at) VALUES (${q(id)}, ${q(`s6${n.toString(36).padStart(4, '0')}`)}, 's6-space', ${par ? q(par) : 'NULL'}, ${q(`a${n}`)}, ${q(title)}, 'slug', ${q(body)}, 'spec', 'draft', 's6-actor', 's6-actor', ${now}, ${now});`,
    );
    n++;
  }
}
writeFileSync(new URL('./seed.sql', import.meta.url), lines.join('\n'));
console.log(`${n} pages, ${(lines.join('\n').length / 1024 / 1024).toFixed(1)}MB SQL`);
