# Clavis — 기술 아키텍처 (v0.3)

> 상태: **Active** · 작성일: 2026-09-27 · v0.2: Phase 0 결과 반영 (인증 구조, 서버 lint 범위, 백업) · v0.3: Phase 1 구현 반영
> 선행 문서: [`00-concept.md`](./00-concept.md) · 결정 로그: [`decisions.md`](./decisions.md)
> Cloudflare 한도 수치는 2026-09 기준 공식 문서에서 확인한 값이다 (§11 참고).

---

## 1. 전체 구조

```
                         ┌───────────────────── Cloudflare ─────────────────────┐
 사람(브라우저) ─이메일 PIN─▶ Cloudflare Access (Worker 전체 보호)                  │
 에이전트 ─서비스 토큰────▶   │  사람: Access JWT, 에이전트: Service Auth 정책     │
                         │   ▼                                                    │
                         │ ┌─────────────── clavis Worker (단일 배포) ──────────┐ │
                         │ │ Static Assets : React SPA  (Worker 미호출, 무료·무제한) │
 AI 에이전트 ──Bearer──▶ │ │ /api/v1/*     : Hono REST (zod-openapi)             │ │
 (Claude Code, Hermes)   │ │ /mcp          : Stateless MCP (createMcpHandler)    │ │
                         │ │ /files/*      : 첨부파일 프록시                        │ │
                         │ │ scheduled()   : 야간 백업 (Cron Trigger)             │ │
                         │ │        │ Service Layer (REST·MCP 공용)              │ │
                         │ └────────┼──────────────┬────────────────────────────┘ │
                         │          ▼              ▼                              │
                         │   D1 (SQLite + FTS5)   R2 (첨부파일, 백업)                │
                         └──────────────────────────────────────────────────────┘
```

**원칙**
1. **Worker 하나**에 SPA·REST·MCP·Cron을 모두 담는다. 소규모 팀(D-19)에 배포 단위를 늘릴 이유가 없다.
2. REST와 MCP는 **같은 Service Layer**를 호출한다. MCP가 REST를 HTTP로 다시 부르지 않는다.
3. **렌더링은 브라우저에서만** 한다. 서버는 Markdown을 저장·검증·색인만 한다 (CPU 10ms 제약, D-27).
4. Markdown 파서·Lint 규칙·스키마는 `shared` 패키지 하나로 브라우저와 Worker가 공유한다.

## 2. 저장소 구조 (pnpm 모노레포)

```
clavis/
├── apps/
│   ├── web/                 # React + Vite SPA
│   │   ├── src/routes/      #   화면 (TanStack Router, 파일 기반)
│   │   ├── src/editor/      #   CodeMirror 6, frontmatter 폼, lint(markdownlint 포함), 스크롤 동기화, 초안
│   │   ├── src/markdown/    #   렌더링 파이프라인 (unified + Clavis 플러그인, Shiki·Mermaid 지연 로딩)
│   │   ├── src/components/  #   shadcn/ui 기반 컴포넌트, 트리, 팔레트, 관리 화면 부품
│   │   └── src/i18n/        #   ko.json, en.json (lint 메시지는 ruleId로 번역, D-41)
│   └── worker/              # Cloudflare Worker
│       ├── src/index.ts     #   fetch / scheduled 진입점 (백업 + 휴지통 정리)
│       ├── src/api/         #   Hono 라우트 (zod-openapi), /files, /docs
│       ├── src/mcp/         #   MCP 서버 & 도구 정의
│       ├── src/services/    #   도메인 로직 (REST·MCP 공용), ServiceError
│       ├── src/auth/        #   Access JWT / API Token 검증
│       ├── src/backup/      #   분할 백업 (tar)
│       ├── src/db/          #   Drizzle 스키마
│       ├── migrations/      #   drizzle-kit 생성 + FTS 수동 SQL (0001_fts)
│       └── wrangler.jsonc
├── packages/
│   └── shared/              # 브라우저·Worker 공용 (AST 없는 코드만 — Worker CPU 10ms)
│       ├── markdown/        #   frontmatter 분리, 줄 스캐너(코드 펜스 인식), 위키 링크·첨부 추출
│       ├── lint/            #   Clavis 규칙 엔진 (줄 단위)
│       ├── schema/          #   zod 스키마 (frontmatter, API DTO, problem), URL 헬퍼
│       └── templates/       #   문서 유형별 템플릿과 필수 섹션 (코드로 내장)
├── e2e/                     # Playwright 스모크 테스트 (D-39)
└── docs/
```

| 영역 | 선택 | 결정 |
|---|---|---|
| 패키지 관리 | pnpm workspaces | 기본값 |
| API 프레임워크 | Hono + `@hono/zod-openapi` | D-26 |
| ORM | Drizzle ORM + drizzle-kit | D-24 |
| MCP | `agents` SDK `createMcpHandler` (Stateless, Streamable HTTP) | D-12 |
| UI | Tailwind CSS + shadcn/ui (Radix) | D-25 |
| 라우팅 / 서버 상태 | TanStack Router / TanStack Query | 기본값 |
| 에디터 | CodeMirror 6 (`@codemirror/lang-markdown`, `@codemirror/lint`) | 기본값 |
| Markdown | unified(remark/rehype) + remark-gfm + rehype-sanitize + Shiki + Mermaid(lazy) | D-14 |
| Lint | markdownlint(라이브러리) + Clavis 커스텀 규칙 | D-09 |
| i18n | i18next + react-i18next | D-18 |
| 테스트 | Vitest + `@cloudflare/vitest-pool-workers`, Playwright(E2E) | 기본값 |

## 3. 요청 라우팅

`wrangler.jsonc`의 Static Assets 설정으로 SPA는 Worker를 거치지 않고 서빙한다.

```jsonc
{
  "name": "clavis",
  "main": "apps/worker/src/index.ts",
  "assets": {
    "directory": "apps/web/dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/mcp", "/files/*"]
  },
  "d1_databases": [{ "binding": "DB", "database_name": "clavis" }],
  "r2_buckets":   [{ "binding": "FILES", "bucket_name": "clavis-files" }],
  "triggers":     { "crons": ["*/2 17-18 * * *"] }   // 02:00~03:58 KST 분할 백업
}
```

| 경로 | 처리 | 인증 |
|---|---|---|
| `/`, `/s/**`, `/search` … | Static Assets (SPA index.html) | Cloudflare Access (엣지) |
| `/api/v1/**` | Hono REST | Access(엣지) + Worker: Bearer 토큰 **또는** Access JWT |
| `/mcp` | MCP 핸들러 | Access 서비스 토큰(엣지) + Bearer 토큰 |
| `/files/{attachmentId}` | R2 프록시 | Access(엣지) + Worker: Bearer 토큰 **또는** Access JWT |

모든 경로가 Access 뒤에 있다. Access를 통과하지 못한 요청은 Worker에 도달하지 않는다 (예외 없음, Bypass 없음).

## 4. 인증 & 권한 (D-05, D-29)

### 4.1 흐름 (D-05 개정)
```
엣지 (Cloudflare Access, Worker 단위 앱)
  사람      ─ 이메일 PIN 로그인(추후 Google), @gmail.com 허용 ─▶ 통과, Cf-Access-Jwt-Assertion 헤더 주입
  에이전트  ─ CF-Access-Client-Id / CF-Access-Client-Secret (Service Auth 정책) ─▶ 통과
  그 외     ─ 로그인 페이지로 302

Worker (authenticate 미들웨어) — "Clavis 안에서 누구인가"
  Authorization: Bearer clv_xxx ──▶ SHA-256 해시 → api_tokens 조회 → actor(agent)   (우선)
  Access 신원 ──▶ ctx.access 또는 Cf-Access-Jwt-Assertion JWT 검증 → email → actor(human)
  (둘 다 없으면 401)
```
- `ctx.access.getIdentity()`는 실제로 채워지지 않는 경우가 있어, Worker가 `Cf-Access-Jwt-Assertion` JWT를 직접 검증한다 (`jose`, JWKS `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, `iss` = 팀 도메인, `aud` = `ACCESS_AUD`).
- 서비스 토큰 정책의 Action은 **Service Auth**여야 한다. `Allow`로 두면 Access가 토큰을 무시한다 (S4에서 확인).
- 로컬 개발은 `apps/worker/.dev.vars`의 `DEV_ACCESS_EMAIL`로 사람을 흉내 낸다 (localhost 요청에만 적용).
- 연결 방법: [`guides/agent-connection.md`](./guides/agent-connection.md)

### 4.2 Actor 모델
사람과 에이전트를 **Actor** 하나로 통합하여 작성자 표시·권한 검사를 동일하게 처리한다.

| 항목 | 사람 | 에이전트 |
|---|---|---|
| `kind` | `human` | `agent` |
| 식별 | Access 이메일 | API Token (1 actor : N token) |
| 생성 | 첫 로그인 시 자동 생성 (`pending`, 승인 대기), **최초 사용자는 `Admin`** (D-29) | Admin이 UI에서 생성 |
| 역할 | Admin / Editor / Viewer (+ `pending`) | Editor / Viewer (Admin 불가) |

- 토큰 형식: `clv_` + 32바이트 랜덤(base62). DB에는 SHA-256 해시와 앞 8자(식별용)만 저장. 발급 시 1회만 노출.

## 5. 데이터 모델 (D1)

### 5.1 테이블

```sql
-- 사람과 에이전트
actors (
  id            TEXT PRIMARY KEY,          -- ULID
  kind          TEXT NOT NULL,             -- 'human' | 'agent'
  name          TEXT NOT NULL,             -- 표시명 (예: 'hermes')
  email         TEXT UNIQUE,               -- human만
  role          TEXT NOT NULL,             -- 'admin' | 'editor' | 'viewer'
  locale        TEXT DEFAULT 'ko',
  created_at    INTEGER NOT NULL,
  disabled_at   INTEGER
)

api_tokens (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT NOT NULL REFERENCES actors(id),
  token_hash    TEXT NOT NULL UNIQUE,
  prefix        TEXT NOT NULL,             -- 'clv_ab12' (목록 표시용)
  last_used_at  INTEGER,
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER
)

spaces (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,      -- 'PAY' (대문자, 2~10자)
  name          TEXT NOT NULL,
  description   TEXT,
  home_page_id  TEXT,
  tree_version  INTEGER NOT NULL DEFAULT 0,  -- 트리 변경 시 증가 (캐시 무효화)
  created_at    INTEGER NOT NULL,
  archived_at   INTEGER
)

pages (
  id            TEXT PRIMARY KEY,          -- ULID
  short_id      TEXT NOT NULL UNIQUE,      -- URL용 6~8자 base36
  space_id      TEXT NOT NULL REFERENCES spaces(id),
  parent_id     TEXT REFERENCES pages(id),
  position      TEXT NOT NULL,             -- 형제 간 순서 (fractional index)
  title         TEXT NOT NULL,
  slug          TEXT NOT NULL,             -- 제목에서 생성 (한글 유지)
  content       TEXT NOT NULL,             -- ★ 원본: frontmatter 포함 Markdown 전체
  doc_type      TEXT NOT NULL,             -- ↓ content에서 추출한 파생 컬럼 (필터·정렬용)
  status        TEXT NOT NULL,
  owner         TEXT,
  revision      INTEGER NOT NULL DEFAULT 1,  -- 낙관적 잠금
  created_by    TEXT NOT NULL REFERENCES actors(id),
  updated_by    TEXT NOT NULL REFERENCES actors(id),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER,                   -- 휴지통
  deleted_batch TEXT,                      -- 하위 트리 일괄 삭제/복원 단위
  deleted_by    TEXT REFERENCES actors(id)  -- 휴지통 화면의 삭제자 (0002)
)
CREATE UNIQUE INDEX pages_title_uniq ON pages(space_id, title) WHERE deleted_at IS NULL;
CREATE INDEX pages_tree ON pages(space_id, parent_id, position) WHERE deleted_at IS NULL;

page_tags   (page_id TEXT, tag TEXT, PRIMARY KEY (page_id, tag))

page_links (                               -- 위키 링크 / 내부 링크 (백링크·깨진 링크용)
  from_page_id    TEXT NOT NULL,
  target_space_key TEXT NOT NULL,
  target_title    TEXT NOT NULL,
  to_page_id      TEXT,                    -- 해석 실패 시 NULL = 깨진 링크
  PRIMARY KEY (from_page_id, target_space_key, target_title)
)

attachments (
  id            TEXT PRIMARY KEY,
  page_id       TEXT NOT NULL REFERENCES pages(id),
  filename      TEXT NOT NULL,             -- 페이지 안에서 유일
  r2_key        TEXT NOT NULL,             -- 'att/{pageId}/{id}'
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (page_id, filename)
)
```

### 5.2 설계 포인트

- **원본은 `content` 한 컬럼** (D-28): frontmatter를 포함한 Markdown 전체를 그대로 저장한다. `doc_type`/`status`/`owner`/`page_tags`는 저장 시 파싱해서 채우는 **파생 데이터**다. 에이전트가 보낸 텍스트와 읽어가는 텍스트가 바이트 단위로 같다.
- **제목은 `pages.title`** (frontmatter 아님): 트리·URL·위키 링크 해석의 키이므로 별도 컬럼으로 관리한다.
- **형제 순서는 fractional index** (D-32): `a0`, `a0V`, `a1`처럼 문자열 사이에 끼워 넣어 이동 시 **한 행만** 갱신한다. D1 쓰기 한도를 아끼고 동시 이동 충돌을 줄인다.
- **휴지통**: 페이지 삭제 시 하위 트리 전체에 같은 `deleted_batch`를 기록한다. 복원 시 배치 단위로 되살리고, 부모가 없으면 Space 루트로 복원한다. 30일 후 Cron에서 영구 삭제(첨부 포함).
- **제목 중복**: 부분 유니크 인덱스로 "삭제되지 않은 페이지끼리만" 유일성을 보장한다.
- **제목 변경 시 링크**: `page_links.to_page_id`로 연결된 페이지의 본문에 있는 `[[옛 제목]]`은 P1에서 **자동으로 고치지 않는다**. 대신 해당 링크가 깨진 링크로 표시되고 lint warning이 뜬다. (자동 치환은 P2 검토)

### 5.3 전문 검색 (FTS5, D-11)

```sql
CREATE VIRTUAL TABLE pages_fts USING fts5(
  title, content,
  content='pages', content_rowid='rowid',   -- external content: 원문은 pages에만 저장
  tokenize='trigram'
);
-- pages의 INSERT/UPDATE/DELETE 트리거로 동기화 (S1에서 검증)
```

- **trigram**은 한국어 부분 일치를 지원하지만 **3글자 미만 검색어는 매칭되지 않는다.** 검색어가 2글자 이하이면 `title LIKE ? OR content LIKE ?`로 대체한다 (문서 수백 건 규모에서 충분).
- **FTS 테이블은 재생성 가능한 파생 데이터**다. `wrangler d1 export`는 FTS5 가상 테이블이 있으면 실패하는 알려진 문제가 있으므로([workers-sdk#9519](https://github.com/cloudflare/workers-sdk/issues/9519)), 백업에서 제외하고 복구 시 `rebuild` 한다 (§10).
- ✅ S1 검증 완료 (로컬·원격): trigram, external content + 트리거, `snippet`, `bm25`, `rebuild` 동작.

## 6. 저장(Save) 파이프라인

```
PUT /api/v1/pages/{ref}  { title?, content, baseRevision }
  1. 인증/권한 확인 (editor 이상), 본문 100KB 초과 시 413 (D-33)
  2. 위키 링크 추출 (줄 스캔, 코드 블록 제외) — Worker는 AST를 만들지 않는다
  3. D1 읽기 batch 1회: 페이지(+태그·조상), 링크 대상 존재 여부(JSON 파라미터 1개로 전달),
     첨부 목록, 새 제목 중복, 옛 제목으로 들어오는 링크 수
  4. revision 불일치 → 409 + 현재 revision / Space 보관됨 → 409
  5. 서버 lint: Clavis 규칙 전체 (D-27 개정). error가 있으면 422 + violations
  6. D1 쓰기 batch 1회 (단일 트랜잭션):
       revision 가드 (불일치면 json() 오류로 batch 전체 롤백 → 409)
       UPDATE pages (revision + 1, 파생 컬럼), page_tags·page_links 교체,
       제목 변경 시 옛 링크 끊기·새 제목을 기다리던 링크 연결, 트리가 바뀌면 tree_version 증가,
       저장된 페이지를 다시 SELECT (같은 batch 안에서)
  7. 200 { page, violations(warning/info), linksToOldTitle? }
```

- **D1 호출 2회**: 읽기 batch + 쓰기 batch. 서브리퀘스트 한도(50)와 무관한 수준이다. 생성·이동·삭제도 2~3회.
- **CPU 실측**(H2, 운영): 100KB 저장 중앙값 7.5ms·p95 10ms, 2.5KB 생성 4ms. 문서는 한 번만 파싱하고(규칙들은 헤딩·링크 스캔을 memo로 공유), 저장 응답에는 본문을 넣지 않으며, 링크·태그는 `json_each`로 문장 하나에 넣는다. 상세: [`03-phase1-plan.md`](./03-phase1-plan.md) §9.
- **revision 가드**: D1 batch에는 조건 분기가 없으므로, 첫 문장을 `SELECT CASE WHEN <revision 일치> THEN 1 ELSE json('…') END`로 두어 불일치 시 오류를 일으킨다. 읽기와 쓰기 사이에 다른 저장이 끼어들어도 덮어쓰지 않는다.
- **바인딩 파라미터 한도**: D1은 문장당 바인딩 100개가 한도라 링크 목록은 `json_each(?)` 한 개로 넘긴다.
- **AST 기반 파싱은 서버 금지**: remark·markdownlint는 Cloudflare 실측 10KB에 25ms 이상(S3). markdownlint 서식 규칙은 브라우저 에디터에서만 실행한다.
- 저장 응답과 `POST /api/v1/lint`(MCP `lint_markdown`)는 같은 Clavis 규칙 결과를 반환하므로, 에이전트는 저장 응답만으로 warning을 확인할 수 있다.

## 7. Lint 엔진 (`packages/shared/lint`)

```ts
interface LintRule {
  id: string;                     // 'clavis/frontmatter-required'
  severity: 'error' | 'warning' | 'info';
  blocking: boolean;              // error면 저장 차단 (D-09)
  check(doc: LintDocument, env: LintEnv): RuleViolation[];
}
interface LintDocument { content: string; split: SplitResult; lines: ScannedLine[]; frontmatter: Frontmatter | null }
interface LintEnv {
  resolveLink?(spaceKey: string | null, title: string): boolean;   // 브라우저: 트리 캐시 / 서버: D1
  attachmentExists?(filename: string): boolean;
}
interface Violation { ruleId: string; severity: Severity; message: string; line: number; column?: number; params?: Record<string, string | number> }
```

| 규칙 | 심각도 | 내용 |
|---|---|---|
| `clavis/frontmatter-required` | error | frontmatter 없음·YAML 오류·필수 필드/허용 값 (`params.kind` 또는 `params.field`) |
| `clavis/attachment-exists` | error | `attachments/<파일>` 참조가 페이지 첨부에 없음 |
| `clavis/no-h1` | warning | 본문 H1 (제목은 페이지 속성) |
| `clavis/heading-increment` | warning | 헤딩 레벨 건너뜀 |
| `clavis/wiki-link-exists` | warning | 없는 페이지로의 위키 링크 |
| `clavis/required-sections` | warning | 문서 유형별 필수 H2 (한/영 이름 모두 인정, 템플릿과 같은 정의) |
| `clavis/image-alt` | info | 이미지 alt 없음 |
| `clavis/code-lang` | info | 코드 블록 언어 없음 |
| `clavis/doc-length` | info | 50KB 초과 (분할 권장) |

- 모든 규칙은 **줄 스캔 + 정규식**만 쓴다 (서버 CPU, D-27). 100KB 전체 검사가 Node에서 5ms 미만인지 테스트로 지킨다.
- 브라우저 에디터는 여기에 **markdownlint** 서식 규칙을 더한다 (severity `info`, `markdownlint/MDxxx`). Clavis 규칙과 겹치는 MD001·MD025·MD040·MD045와 위키에 맞지 않는 MD013·MD028·MD033·MD041·MD060은 끈다.
- 메시지: 위반 항목의 `message`는 영어(API·에이전트용), UI는 `ruleId`·`params`로 번역한다 (D-41).
- 필수 섹션은 `templates/`의 정의를 참조한다 → **템플릿과 규칙이 한 곳에서 관리됨**.

## 8. REST API (D-26)

### 8.1 규약
| 항목 | 규약 |
|---|---|
| Base | `/api/v1` |
| 형식 | JSON. 페이지 원문은 `Accept: text/markdown`으로도 조회 가능 |
| 에러 | RFC 9457 `application/problem+json` + `violations[]` (lint) |
| 페이지네이션 | cursor 기반 (`?cursor=&limit=`) |
| 동시성 | 수정 요청에 `baseRevision` 필수, 불일치 시 `409` + 현재 revision |
| 스펙 | `/api/v1/openapi.json` 자동 생성, `/api/v1/docs` (Scalar UI) |

### 8.2 엔드포인트 (P1)

페이지 경로의 `{ref}`는 페이지 id, shortId, 또는 `KEY:제목`(URL 인코딩)이다.

| Method | Path | 설명 | 권한 |
|---|---|---|---|
| GET | `/spaces?includeArchived=` | Space 목록 | viewer |
| POST | `/spaces` | Space 생성 + 홈 페이지 (D-35) | admin |
| GET / PATCH / DELETE | `/spaces/{key}` | 조회 / 이름·설명·홈·보관 해제 / 보관 (D-34) | viewer / admin |
| GET | `/spaces/{key}/tree` | 페이지 트리. `ETag`(tree_version), `If-None-Match` → 304 | viewer |
| POST | `/spaces/{key}/pages` | 페이지 생성 (`content` 또는 `template`, `parent`, `after`) | editor |
| GET | `/pages/{ref}` | 페이지 (JSON, 또는 `Accept: text/markdown` → 원문 + `X-Clavis-Revision`) | viewer |
| GET | `/pages/by-title?space=&title=` | 제목으로 조회 | viewer |
| PUT | `/pages/{ref}` | 수정 (`title?`, `content`, `baseRevision`) | editor |
| POST | `/pages/{ref}/move` | 이동 (`parent`: id/null/생략, `after` 또는 `before`) | editor |
| DELETE | `/pages/{ref}` | 하위 포함 휴지통으로 (홈 페이지는 409) | editor |
| GET | `/trash?space=` | 휴지통 (삭제 단위별) | viewer |
| POST | `/trash/{batchId}/restore` | 복원 (제목이 겹치면 ` (restored)`) | editor |
| GET | `/search?q=&space=&type=&status=&limit=&cursor=` | 전문 검색 (snippet 표시 문자 U+E000/U+E001) | viewer |
| POST | `/lint` | 저장 없이 서버 규칙 전체 검사 | viewer |
| GET | `/templates?locale=` | 템플릿과 필수 섹션 | viewer |
| GET | `/pages/{ref}/attachments` | 첨부 목록 | viewer |
| POST | `/pages/{ref}/attachments?filename=` | 첨부 업로드 (원본 바이트 본문, 25MB) | editor |
| DELETE | `/attachments/{id}` | 첨부 삭제 | editor |
| GET | `/me` | 현재 actor | 모두 |
| GET / PATCH / POST / DELETE | `/admin/actors`, `/admin/agents`, `/admin/tokens` | 사람 승인·역할, 에이전트, 토큰 | admin |
| GET | `/openapi.json`, `/docs` | OpenAPI 3.1, Scalar 문서 | 공개(Access 뒤) |

## 9. MCP 서버 (D-12)

- **Stateless** `createMcpHandler` + Streamable HTTP, 엔드포인트 `/mcp`. Durable Objects 불필요(무료 플랜 OK). 요청마다 McpServer를 만들고 인증된 actor를 닫아 둔다.
- 도구 구현은 Service Layer를 직접 호출한다. `ServiceError`는 에이전트가 바로 고칠 수 있는 텍스트 오류로 바뀐다 (409: 현재 revision과 다음 행동, 422: 줄 번호가 붙은 위반 목록과 "저장 안 됨").
- 응답은 **토큰 효율**을 우선한다: 페이지 조회는 JSON 대신 원문 + 한 줄 메타 주석, 트리는 shortId·제목·유형·상태만.
- viewer 에이전트에게는 쓰기 도구가 목록에 나타나지 않는다 (서비스 계층도 역할을 다시 확인).

| 도구 | 입력 | 권한 |
|---|---|---|
| `list_spaces` | – | viewer |
| `get_space_tree` | `space` | viewer |
| `search_pages` | `query`, `space?`, `type?`, `status?`, `limit?` | viewer |
| `read_page` | `page` (shortId 또는 `KEY:제목`) | viewer |
| `list_templates` | `locale?` | viewer |
| `lint_markdown` | `content`, `space?`, `page?` | viewer |
| `create_page` | `space`, `title`, `content?`, `template?`, `parent?`, `after?` | editor |
| `update_page` | `page`, `content`, `baseRevision`, `title?` | editor |
| `move_page` | `page`, `parent?`, `after?`, `before?` | editor |
| `delete_page` | `page` | editor |

- 서버 `instructions`에 작성 규칙(frontmatter 필드, 제목은 인자, 템플릿 사용, 수정 전 `read_page`, 링크·첨부 문법)을 담는다.
- 첨부 업로드는 MCP 도구가 없고 REST로 한다 ([연결 가이드](./guides/agent-connection.md) §6).

## 10. 첨부파일 & 백업 (D-20, D-30, D-31)

### 10.1 첨부
- 업로드: `POST /pages/{ref}/attachments?filename=` — **파일 바이트를 그대로 본문으로** 받아 R2 `att/{pageId}/{attachmentId}`에 스트리밍한다. multipart를 파싱하지 않으므로 25MB 파일도 CPU를 거의 쓰지 않는다. `Content-Length` 필수, 파일당 **최대 25MB**.
- 파일 이름은 글자·숫자·`._-`만 남기고(공백은 `-`), 페이지 안에서 겹치면 `arch-1.png`처럼 접미사를 붙인다. 응답의 `filename`으로 참조한다.
- 본문 참조 문법 (D-31): `![다이어그램](attachments/arch.png)`, `[명세서](attachments/spec.pdf)` — **페이지 기준 상대 경로**. 렌더러가 첨부 목록으로 `/files/{attachmentId}`로 바꾼다.
- 에디터에 붙여넣기·드래그·파일 선택 시 업로드 후 위 문법을 자동 삽입한다 (업로드 중에는 자리표시).
- 서빙: `/files/{id}` → 권한 확인, 휴지통에 있는 페이지의 파일은 404, `Cache-Control: private, max-age=86400`, ETag 304. 모든 응답에 `Content-Security-Policy: sandbox`와 `nosniff`, SVG·HTML·XML은 `Content-Disposition: attachment`. R2 버킷은 비공개.
- 휴지통 영구 삭제(30일, D-36) 때 R2 객체도 함께 지운다.

### 10.2 백업 (운영용, 사용자 기능 아님)
| 수단 | 범위 | 복구 |
|---|---|---|
| D1 Time Travel | DB 전체, 최근 7일 (무료) | `wrangler d1 time-travel restore` — 전체 시점 복원 |
| 야간 분할 Markdown 백업 (Cron) | 2분마다 다음 ~150KB 분량 페이지를 `backup/{date}/part-NNN.tar`(내부 `{SPACE}/{부모--id}/{제목--id}.md`)로 저장, 마지막에 `meta.json`, 14일 보관 (S6) | 모든 part를 한 디렉터리에 풀면 전체 트리, 스크립트로 재적재 후 FTS `rebuild` |

- 야간 덤프는 FTS5 export 문제를 피하는 동시에, 사람이 읽을 수 있는 **Git 내보내기의 전 단계**가 된다.
- 버전 관리 기능이 아니므로 UI에 노출하지 않는다 (D-21 유지). 단, 운영자가 단일 문서를 수동 복구할 수는 있다.

## 11. 무료 플랜 한도 분석 (D-17, D-19)

### 11.1 공식 한도 (2026-09 확인)
| 서비스 | 항목 | Free |
|---|---|---|
| Workers | 요청 | 100,000 / 일 (00:00 UTC 리셋) |
| | CPU 시간 | **10ms / 요청** |
| | 서브리퀘스트 | **50 / 요청 — D1·R2 호출 포함** (Cron 포함) |
| | 정적 자산 요청 | 무료·무제한 (Worker 미호출 시) |
| | Cron Trigger | 계정당 5개, 실행당 CPU 10ms |
| D1 | 읽기 / 쓰기 행 | 5,000,000 / 100,000 per 일 |
| | DB 크기 | **500MB / DB**, 계정 합계 5GB |
| | 호출당 쿼리 | 50 |
| | Time Travel | 7일 |
| R2 | 저장 | 10GB-month |
| | Class A / B | 100만 / 1,000만 per 월 |
| | Egress | 무료 |
| Access | 사용자 | 50명까지 무료 (Zero Trust Free) — ⚠ 미확인, 가입 시 확인 |

### 11.2 사용량 추정 (10명, 문서 500건, 에이전트 3개)
| 항목 | 가정 | 일 사용량 | 한도 대비 |
|---|---|---|---|
| Worker 요청 (사람) | 10명 × 페이지뷰 100 × API 3회 | 3,000 | 3% |
| Worker 요청 (에이전트) | 3개 × 500회 | 1,500 | 1.5% |
| D1 읽기 행 | 트리 조회 시 Space 전체 행(≈150) 스캔 × 1,000회 + 기타 | ≈ 300,000 | 6% |
| D1 쓰기 행 | 저장 200회 × (pages·fts·links·tags ≈ 20행) | ≈ 4,000 | 4% |
| D1 저장 | 문서 평균 10KB × 500 + 인덱스 | ≈ 20MB | 4% (500MB 기준) |
| R2 저장 | 이미지 2,000개 × 300KB | ≈ 600MB | 6% |

**결론**: 규모상 여유가 크다. 실제 병목은 **요청당 CPU 10ms**, **요청당 서브리퀘스트 50개**, **에이전트 폭주(루프 버그)**다.
- **서브리퀘스트 규칙**: D1·R2 호출도 1개씩 센다. 서비스 코드는 행마다 쿼리하지 않고 `DB.batch()`로 묶는다 (batch 1회 = 1 서브리퀘스트).
- 트리 조회는 `ETag`(tree_version)로 `304`를 반환해 D1 읽기를 줄이고, 완성된 트리 JSON을 `spaces.tree_json`에 캐시해 변경 후 첫 조회 때만 다시 만든다 (570페이지 2ms).
- `/api/v1/openapi.json`은 빌드 시 생성한 문자열을 그대로 보낸다 (`pnpm --filter @clavis/worker openapi`, 최신인지 테스트가 확인). 요청마다 만들면 30~115ms였다.
- MCP는 요청마다 서버를 새로 만들지만(stateless), 도구 스키마의 JSON Schema 변환은 isolate당 한 번만 한다 (호출당 15ms → 3.5ms).
- 에이전트 토큰별 분당 호출 제한: Workers Rate Limiting 바인딩 (S7, 무료 플랜 사용 가능 확인). 기본 120회/60초, 초과 시 `429` + `Retry-After`.
- 한도 초과 시 무료 플랜은 요청이 실패하므로, 대시보드 알림을 설정한다. 필요 시 Workers Paid($5/월) 전환이 유일한 비용 옵션이다.

## 12. 프론트엔드

### 12.1 라우트
| 경로 | 화면 |
|---|---|
| `/` | Space 목록 (admin은 새 Space) |
| `/s/:key` | Space 홈 → 홈 페이지로 이동 (D-35) |
| `/s/:key/p/:slugId` | 페이지 보기 (slug가 다르면 정규 URL로 교체) |
| `/s/:key/p/:slugId/edit` | 편집 |
| `/s/:key/new?parent=&template=` | 새 페이지 (템플릿 선택) |
| `/s/:key/w/:title` | 위키 링크 해석 → 페이지로 이동 |
| `/s/:key/trash` | 휴지통 |
| `/search?q=&space=&type=&status=` | 검색 결과 (헤더의 ⌘K 팔레트에서도 진입) |
| `/admin` | 사람·에이전트·토큰·Space 관리 |

### 12.2 편집기
- **CodeMirror 6**: Markdown 모드(frontmatter 블록 인식, 코드 블록 언어별 하이라이트), `@codemirror/lint`로 밑줄·거터, 하단 Problems 패널(클릭 시 해당 줄), ⌘S 저장.
- **원문이 기준**: 에디터는 frontmatter를 포함한 전체 문서를 가진다. frontmatter 폼은 YAML을 `yaml` Document API로 고쳐 쓰는 보기일 뿐이라 주석·키 순서가 보존되고, lint 줄 번호가 에디터 줄과 그대로 맞는다.
- **미리보기**: 입력 후 150ms 디바운스로 렌더링. 블록의 `data-line`으로 양방향 **스크롤 동기화**(블록 사이는 보간).
- **Mermaid**(`securityLevel: 'strict'`)와 **Shiki**(D-40)는 해당 블록이 있을 때만 지연 로딩.
- **위키 링크 자동완성**: `[[` 입력 시 현재 Space 트리(캐시)에서, `[[KEY:`는 그 Space 트리에서. `](attachments/`는 첨부 목록에서.
- **충돌 처리**: 409면 다이얼로그 → 내 내용을 클립보드로 복사하고 최신본 불러오기.
- **이탈 방지**: 미저장 변경은 `localStorage` 초안으로 보관(다시 열면 복구 제안), 이동·닫기 시 경고.
- **트리 편집**: 사이드바 드래그(위 1/4 = 앞, 아래 1/4 = 뒤, 가운데 = 하위로)와 페이지 메뉴의 이동 대화상자(키보드·모바일).

### 12.3 반응형
- `md` 이상: 3단(사이드바/본문/TOC), 편집 시 2단 분할.
- `md` 미만: 사이드바는 Drawer, TOC는 상단 접이식, 편집은 [편집 | 미리보기] 탭 (D-06).

## 13. 보안

| 위협 | 대응 |
|---|---|
| XSS (Markdown 내 HTML) | `rehype-sanitize` 기본 스키마, 원시 HTML 비허용, Mermaid `strict` |
| 토큰 유출 | 해시 저장, 발급 시 1회 노출, 폐기 기능, `last_used_at` 표시 |
| 무단 접근 | 모든 경로를 Access가 먼저 막고, Worker는 Bearer 또는 Access JWT가 없으면 401 |
| 첨부 파일 악용 | 비공개 R2, 권한 확인 후 서빙, `Content-Disposition` 설정, SVG는 첨부 다운로드로만 제공 |
| CSP | `default-src 'self'`, 이미지 `self` + `/files/` |

## 14. 개발 & 배포 환경

| 환경 | 구성 |
|---|---|
| 로컬 | `pnpm dev` = `wrangler dev`(로컬 D1/R2) + Vite dev server 프록시. Access 대신 `apps/worker/.dev.vars`의 `DEV_ACCESS_EMAIL`로 사용자 주입 — localhost 요청에만 적용 |
| E2E | `pnpm build && pnpm e2e` — Playwright가 `e2e/serve.sh`로 빈 로컬 D1의 `wrangler dev`(:8788)를 띄워 데스크톱·모바일 스모크 테스트 (CI check 잡에도 포함) |
| Preview | 없음 (D-38) — 로컬 + 테스트 + `main` 자동 배포 |
| Production | `main` 머지 시 GitHub Actions → `wrangler deploy` + `d1 migrations apply` |

- 마이그레이션: drizzle-kit이 생성한 SQL + FTS5 등 Drizzle이 표현하지 못하는 부분은 수동 SQL 파일.
- 관측: Workers Logs(무료) + 요청별 CPU 시간 로깅.

## 15. Phase 0 기술 검증 (Spike) 목록

| # | 검증 항목 | 성공 기준 | 실패 시 대안 |
|---|---|---|---|
| S1 | D1 FTS5 `trigram` + contentless | 한국어 3글자 이상 부분 일치 검색 | `unicode61` + 애플리케이션 bigram 인덱스 테이블 |
| S2 | 저장 파이프라인 CPU | 100KB 문서 저장 < 10ms CPU | 문서 크기 상한 / 유료 플랜 |
| S3 | 전체 lint API CPU | 50KB 문서 < 10ms CPU | 서버 lint API 크기 제한, 클라이언트 lint 권장 |
| S4 | Access 쿠키 JWT 검증 + Bypass | SPA·에이전트 모두 인증 성공 | Access Service Token 사용 |
| S5 | Stateless MCP + Hermes Agent | Hermes에서 `read_page`/`update_page` 성공 | REST용 MCP 어댑터 |
| S6 | Cron 야간 덤프 | 500 페이지 덤프가 CPU 한도 내 완료 | 여러 Cron으로 분할 |
| S7 | Rate Limiting 바인딩 무료 여부 | 토큰별 분당 제한 동작 | D1 카운터 테이블 |

## 16. 참고 자료
- [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) · [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Remote MCP Transport (createMcpHandler)](https://developers.cloudflare.com/agents/model-context-protocol/transport/)
- [Access Policies (Bypass)](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- [D1 export fails with FTS5 virtual tables — workers-sdk#9519](https://github.com/cloudflare/workers-sdk/issues/9519)
