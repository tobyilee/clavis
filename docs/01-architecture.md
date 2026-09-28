# Clavis — 기술 아키텍처 (v0.4)

> 상태: **Active** · 작성일: 2026-09-27 · v0.2: Phase 0 결과 반영 (인증 구조, 서버 lint 범위, 백업) · v0.3: Phase 1 구현 반영 · v0.4: Phase 2 구현 반영 (lint 요약·설정, 섹션 편집, 댓글, 템플릿, 홈, `.md`·`llms.txt`, 모바일 편집)
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
                         │ │ *.md, llms.txt: 원본 Markdown, 페이지 목록 (AI용)       │ │
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
│   │   ├── src/editor/      #   CodeMirror 6, frontmatter 폼, lint(markdownlint 포함), 스크롤 동기화, 초안,
│   │   │                    #   모바일 서식 툴바(format.ts·format-toolbar.tsx)
│   │   ├── src/lib/         #   API 클라이언트·쿼리, viewport.ts(키보드 위 영역), images.ts(사진 줄이기)
│   │   ├── src/markdown/    #   렌더링 파이프라인 (unified + Clavis 플러그인, Shiki·Mermaid 지연 로딩)
│   │   ├── src/components/  #   shadcn/ui 기반 컴포넌트, 트리, 팔레트, 관리 화면 부품
│   │   └── src/i18n/        #   ko.json, en.json (lint 메시지는 ruleId로 번역, D-41)
│   └── worker/              # Cloudflare Worker
│       ├── src/index.ts     #   fetch / scheduled 진입점 (백업 + 휴지통 정리)
│       ├── src/api/         #   Hono 라우트 (zod-openapi), /files, /docs, .md·llms.txt
│       ├── src/mcp/         #   MCP 서버 & 도구 정의
│       ├── src/services/    #   도메인 로직 (REST·MCP 공용), ServiceError
│       ├── src/auth/        #   Access JWT / API Token 검증
│       ├── src/backup/      #   분할 백업 (tar)
│       ├── src/db/          #   Drizzle 스키마
│       ├── migrations/      #   drizzle-kit 생성 + FTS 수동 SQL (0001_fts)
│       └── wrangler.jsonc
├── packages/
│   └── shared/              # 브라우저·Worker 공용 (AST 없는 코드만 — Worker CPU 10ms)
│       ├── markdown/        #   frontmatter 분리·수정, 줄 스캐너(코드 펜스 인식), 위키 링크·첨부 추출, 섹션
│       ├── lint/            #   Clavis 규칙 엔진 (줄 단위, Space 설정 적용)
│       ├── schema/          #   zod 스키마 (frontmatter, API DTO, problem, lint 설정), URL 헬퍼
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
    "run_worker_first": ["/api/*", "/mcp", "/files/*", "/s/*.md", "/s/*/llms.txt", "/llms.txt"]
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
| `/s/{KEY}/p/{slugId}.md` | 원본 Markdown (`text/markdown`, `X-Clavis-Revision`) | 위와 같음 |
| `/s/{KEY}/llms.txt`, `/llms.txt` | Space의 페이지 목록(각 항목이 `.md` 링크) / Space 목록 (D-51) | 위와 같음 |

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
  tree_json     TEXT,                      -- 완성된 트리 캐시 (0003), tree_json_version과 함께
  tree_json_version INTEGER,
  lint_config   TEXT,                      -- LintConfig JSON (D-47), NULL = 기본값 (0004)
  lint_config_version INTEGER NOT NULL DEFAULT 0,  -- 설정 변경마다 증가 → 옛 page_lint는 재검사 대상
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

-- ── Phase 2 ──
page_lint (                                -- 페이지별 lint 요약 (D-46, 0004), 저장 쓰기 batch에서 upsert
  page_id        TEXT PRIMARY KEY REFERENCES pages(id),
  revision       INTEGER NOT NULL,         -- 검사한 revision (재검사 중 저장된 페이지는 건너뜀)
  config_version INTEGER NOT NULL,         -- spaces.lint_config_version과 다르면 재검사 필요
  errors, warnings, infos INTEGER NOT NULL,
  rules          TEXT NOT NULL,            -- {ruleId: {severity, count, line}} JSON (위키 링크 규칙 제외)
  checked_at     INTEGER NOT NULL
)

comments (                                 -- 스레드 = 루트 + 답글 1단계 (D-44, 0005)
  id            TEXT PRIMARY KEY,
  page_id       TEXT NOT NULL REFERENCES pages(id),
  thread_id     TEXT NOT NULL,             -- 루트는 자기 id
  author_id     TEXT NOT NULL REFERENCES actors(id),
  body          TEXT NOT NULL,             -- Markdown, 10KB까지
  section_id    TEXT,                      -- 루트만: 연결한 섹션(헤딩 앵커)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  resolved_at   INTEGER,                   -- 루트만
  resolved_by   TEXT REFERENCES actors(id)
)
CREATE INDEX comments_page ON comments(page_id, thread_id, created_at);
CREATE INDEX comments_open ON comments(page_id) WHERE id = thread_id AND resolved_at IS NULL;

templates (                                -- 커스텀 템플릿 (D-49, 0006). 기본 7종은 코드에 있음
  id            TEXT PRIMARY KEY,
  space_id      TEXT REFERENCES spaces(id),  -- NULL = 모든 Space (admin)
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  doc_type      TEXT NOT NULL,             -- 기존 7개 유형 중 하나
  content       TEXT NOT NULL,             -- {{title}}·{{owner}}·{{date}} 자리표시 가능
  created_by, updated_by TEXT NOT NULL,
  created_at, updated_at INTEGER NOT NULL
)

favorites  (actor_id, page_id, created_at, PRIMARY KEY (actor_id, page_id))          -- 0007
page_views (actor_id, page_id, viewed_at,  PRIMARY KEY (actor_id, page_id))          -- 사람만, 최신 50개 (D-50)
CREATE INDEX page_views_recent ON page_views(actor_id, viewed_at);
CREATE INDEX pages_updated ON pages(updated_at) WHERE deleted_at IS NULL;              -- 홈의 최근 변경
```

### 5.2 설계 포인트

- **원본은 `content` 한 컬럼** (D-28): frontmatter를 포함한 Markdown 전체를 그대로 저장한다. `doc_type`/`status`/`owner`/`page_tags`는 저장 시 파싱해서 채우는 **파생 데이터**다. 에이전트가 보낸 텍스트와 읽어가는 텍스트가 바이트 단위로 같다.
- **제목은 `pages.title`** (frontmatter 아님): 트리·URL·위키 링크 해석의 키이므로 별도 컬럼으로 관리한다.
- **형제 순서는 fractional index** (D-32): `a0`, `a0V`, `a1`처럼 문자열 사이에 끼워 넣어 이동 시 **한 행만** 갱신한다. D1 쓰기 한도를 아끼고 동시 이동 충돌을 줄인다.
- **휴지통**: 페이지 삭제 시 하위 트리 전체에 같은 `deleted_batch`를 기록한다. 복원 시 배치 단위로 되살리고, 부모가 없으면 Space 루트로 복원한다. 30일 후 Cron에서 영구 삭제(첨부 포함).
- **제목 중복**: 부분 유니크 인덱스로 "삭제되지 않은 페이지끼리만" 유일성을 보장한다.
- **lint 요약은 저장 시점의 스냅숏**: 위키 링크 규칙은 다른 페이지가 생기거나 지워지면 결과가 바뀌므로 `page_lint`에 넣지 않고, 대시보드는 링크 문제를 `page_links`(`to_page_id IS NULL`)의 **현재 상태**로 보여 준다.
- **댓글 삭제**: 답글이 있는 루트는 지울 수 없고(409 `has-replies`) 해결로 닫는다. 그래서 soft delete 없이 행만 지운다. 페이지가 휴지통에 가면 함께 숨고, 영구 삭제 때 함께 지운다.
- **새 테이블과 휴지통**: 페이지를 참조하는 테이블(`page_lint`, `comments`, `favorites`, `page_views`)은 영구 삭제(`services/trash.ts`)에서 함께 지운다. 테이블을 추가하면 여기와 테스트의 `resetDb`에 반영한다.
- **제목 변경 시 링크** (D-42 개정): `page_links.to_page_id`로 이 페이지를 링크하는 문서의 `[[옛 제목]]`을 같은 저장 요청 안에서 `[[새 제목]]`으로 고친다 (코드 블록 제외, 별칭·`KEY:` 유지). CPU를 위해 한 번에 50페이지·200KB까지만 고치고, 나머지는 깨진 링크로 남아 lint warning이 뜬다.

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
  3. D1 읽기 batch 1회: 페이지(+태그·조상), Space(보관 여부·lint 설정), 링크 대상 존재 여부(JSON 파라미터 1개로 전달),
     첨부 목록, 새 제목 중복, 옛 제목으로 들어오는 링크 수
  4. revision 불일치 → 409 + 현재 revision / Space 보관됨 → 409
  5. 서버 lint: Clavis 규칙 전체, Space 설정 적용 (D-27 개정, D-47). error가 있으면 422 + violations
  6. D1 쓰기 batch 1회 (단일 트랜잭션):
       revision 가드 (불일치면 json() 오류로 batch 전체 롤백 → 409)
       UPDATE pages (revision + 1, 파생 컬럼), page_tags·page_links 교체,
       제목 변경 시 참조 문서의 [[옛 제목]] 수정(50페이지·200KB까지, 문장 3개)·나머지 링크 끊기·새 제목을 기다리던 링크 연결,
       트리가 바뀌면 tree_version 증가,
       page_lint 요약 upsert (문장 1개, D-46),
       저장된 페이지를 다시 SELECT (같은 batch 안에서)
  7. 200 { page(본문 제외), violations(warning/info), linksUpdated?, linksToOldTitle? }
```

- **D1 호출 2회**: 읽기 batch + 쓰기 batch. 서브리퀘스트 한도(50)와 무관한 수준이다. 생성·이동·삭제도 2~3회.
- **CPU 실측**(H2, 운영): 100KB 저장 중앙값 7.5ms·p95 10ms, 2.5KB 생성 4ms. 문서는 한 번만 파싱하고(규칙들은 헤딩·링크 스캔을 memo로 공유), 저장 응답에는 본문을 넣지 않으며, 링크·태그는 `json_each`로 문장 하나에 넣는다. 상세: [`03-phase1-plan.md`](./03-phase1-plan.md) §9.
- **revision 가드**: D1 batch에는 조건 분기가 없으므로, 첫 문장을 `SELECT CASE WHEN <revision 일치> THEN 1 ELSE json('…') END`로 두어 불일치 시 오류를 일으킨다. 읽기와 쓰기 사이에 다른 저장이 끼어들어도 덮어쓰지 않는다.
- **바인딩 파라미터 한도**: D1은 문장당 바인딩 100개가 한도라 링크 목록은 `json_each(?)` 한 개로 넘긴다.
- **AST 기반 파싱은 서버 금지**: remark·markdownlint는 Cloudflare 실측 10KB에 25ms 이상(S3). markdownlint 서식 규칙은 브라우저 에디터에서만 실행한다.
- 저장 응답과 `POST /api/v1/lint`(MCP `lint_markdown`)는 같은 Clavis 규칙 결과를 반환하므로, 에이전트는 저장 응답만으로 warning을 확인할 수 있다.

### 6.1 섹션 편집과 속성 변경 (D-48)

```
PUT /api/v1/pages/{ref}/sections/{section}  { mode: replace|append, content, baseSectionHash? | baseRevision? }
  1. 페이지 읽기 → parseSections(scanLines 결과, 코드 블록 안 헤딩 제외)로 섹션을 id(TOC 앵커 slug) 또는 헤딩 텍스트로 찾음
     (같은 제목이 여럿이면 409 + id 목록)
  2. replace: baseSectionHash가 지금 섹션 해시(FNV-1a)와 다르면 409 + 최신 섹션·해시
     append: base 불필요. 섹션 마지막 비어 있지 않은 줄 뒤에 — 목록·표는 이어 붙이고, 그 밖은 빈 줄로 새 블록
  3. 고친 전체 문서를 위의 일반 저장 파이프라인으로 저장 (lint, 링크, revision 가드)
     baseRevision을 주지 않았으면 경합(409) 시 한 번 다시 읽어 다시 적용 — 섹션 해시가 계속 보호한다
```

- 그래서 에이전트가 `## 액션 아이템`을 고치는 동안 사람이 다른 섹션을 저장해도 둘 다 남는다. `baseRevision`을 주면 기존처럼 엄격하게 판정한다.
- `PATCH /pages/{ref}/meta`는 status·owner·tags만 받아 서버가 frontmatter YAML을 고친다(`yaml` Document API — 주석·키 순서 유지, 웹 속성 폼과 같은 `updateFrontmatter`). 본문은 그대로이고 저장 경로는 같다.
- 섹션 저장은 "읽기 + 섹션 교체 + 일반 저장"이라 저장 중 가장 빠듯하다. 그래서 섹션 편집은 페이지 전체(`getPage`: 태그·조상 포함)가 아니라 `id·revision·content` 한 문장만 읽고, 찾은 섹션 하나만 해시한다(`locateSection`). 운영 실측(Z2, 100KB): 섹션 저장 중앙값 6ms·p95 9ms, 섹션 읽기 3ms·5ms. 상세: [`04-phase2-plan.md`](./04-phase2-plan.md) §9.

## 7. Lint 엔진 (`packages/shared/lint`)

```ts
interface LintRule {
  id: string;                     // 'clavis/frontmatter-required'
  severity: 'error' | 'warning' | 'info';   // 기본 심각도. 실제 심각도는 Space 설정이 덮어쓴다
  check(doc: LintDocument, env: LintEnv): RuleViolation[];
}
lint(input: string | LintDocument, options?: LintEnv & { blockingOnly? }): Violation[]
                                  // error가 하나라도 있으면 저장 차단 (D-09)
interface LintDocument { content: string; split: SplitResult; lines: ScannedLine[]; frontmatter: Frontmatter | null }
interface LintEnv {
  config?: LintConfig;             // Space 설정 (§7.1)
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

### 7.1 Space별 설정 (D-47)

```ts
LintConfig = {
  rules?: { [ruleId]: 'off' | 'info' | 'warning' | 'error' },   // frontmatter-required는 조정 불가(error 고정)
  requiredSections?: { [docType]: string[] },                   // 유형의 필수 H2를 교체 (빈 목록 = 없음)
  docLengthKb?: number,                                          // doc-length 기준 (5~100KB)
}
```

- `spaces.lint_config`에 저장하고 `PUT /spaces/{key}/lint-config`(admin)로 바꾼다. Space 응답에 `lintConfig`·`lintConfigVersion`이 들어 있어 **에디터·저장 API·`/lint`·MCP가 같은 설정**으로 검사한다. 저장 읽기 batch가 이미 Space 행을 읽으므로 D1 호출은 늘지 않는다.
- 규칙을 `error`로 올려도 기존 페이지는 그대로 있고, 다음 저장 때 고치도록 막힌다(설정 화면에 경고).
- 설정을 바꾸면 버전이 올라 기존 `page_lint`가 옛것이 된다. 대시보드가 열리면 `POST /spaces/{key}/lint/recheck`를 끝날 때까지 반복 호출한다: 요약이 없거나 옛 버전인 페이지를 **본문 합계 약 100KB까지** 검사해 한 문장(`json_each`)으로 저장한다(계획의 150KB에서 CPU 때문에 낮춤). 그사이 저장된 페이지는 revision 조건으로 건너뛴다.
- 기본 템플릿 7종도 Space의 필수 섹션으로 렌더링한다. 커스텀 템플릿은 저장할 때 자리표시(`{{title}}`·`{{owner}}`·`{{date}}`)를 채운 샘플로 그 Space 규칙에 따라 검사하고, error면 422로 거부한다.

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

### 8.3 엔드포인트 (P2)

| Method | Path | 설명 | 권한 |
|---|---|---|---|
| GET | `/pages/{ref}/backlinks` | 이 페이지를 링크하는 문서 (다른 Space 포함, 휴지통 제외) | viewer |
| GET | `/spaces/{key}/health` | 대시보드: 규칙별·페이지별 lint 요약, 깨진 위키 링크(현재 상태), 재검사 필요 수 | viewer |
| POST | `/spaces/{key}/lint/recheck` | 오래된 요약의 다음 묶음(약 100KB) 재검사, 남은 수 반환 (대시보드를 여는 누구나) | viewer |
| PUT | `/spaces/{key}/lint-config` | Space lint 설정 교체 (설정 조회는 `GET /spaces/{key}`의 `lintConfig`) | admin |
| GET | `/pages/{ref}/sections` | 섹션 목록 (id, 레벨, 제목, 줄 범위, 해시) | viewer |
| GET / PUT | `/pages/{ref}/sections/{section}` | 섹션 읽기 / 교체·끝에 추가 (§6.1) | viewer / editor |
| PATCH | `/pages/{ref}/meta` | status·owner·tags만 변경 | editor |
| GET / POST | `/pages/{ref}/comments` | 스레드 목록 / 댓글·답글 작성 (`replyTo`, `sectionId`) | viewer (D-45) |
| PATCH / DELETE | `/comments/{id}` | 수정(작성자) / 삭제(작성자·admin, 답글 있는 루트는 409) | 작성자 |
| POST | `/comments/{id}/resolve`, `/comments/{id}/reopen` | 스레드 해결 / 다시 열기 (스레드의 어느 댓글 id든) | editor |
| GET | `/templates?space=&locale=` | 커스텀(Space → 전역) + 기본 템플릿 | viewer |
| POST / PUT / DELETE | `/templates`, `/templates/{id}` | 커스텀 템플릿 관리 (전역 `space: null`은 admin) | editor |
| GET | `/me/home` | 홈: 즐겨찾기, 최근 본, 최근 변경(🧑/🤖 필터는 화면에서), 내 문서의 열린 댓글 (D1 1회) | viewer |
| GET | `/me/favorites` | 즐겨찾기 목록 | viewer |
| PUT / DELETE | `/pages/{ref}/favorite` | 즐겨찾기 추가 / 빼기 | viewer |

- `GET /pages/{ref}`는 사람이 읽으면 응답 뒤(`ctx.waitUntil`)에 `page_views`를 upsert하고 50개를 넘는 옛 기록을 지운다. 에이전트 조회는 기록하지 않는다.
- `POST /spaces/{key}/pages`의 `template`은 문서 유형 또는 커스텀 템플릿 id다(다른 Space의 템플릿은 400).

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
| `list_templates` | `space?`, `locale?` | viewer |
| `lint_markdown` | `content`, `space?`, `page?` | viewer |
| `create_page` | `space`, `title`, `content?`, `template?`, `parent?`, `after?` | editor |
| `update_page` | `page`, `content`, `baseRevision`, `title?` | editor |
| `move_page` | `page`, `parent?`, `after?`, `before?` | editor |
| `delete_page` | `page` | editor |
| `get_backlinks` | `page` | viewer |
| `get_space_health` | `space` | viewer |
| `list_sections` · `read_section` | `page`, `section` | viewer |
| `update_section` | `page`, `section`, `mode`, `content`, `baseSectionHash?` (replace는 필수) | editor |
| `set_page_meta` | `page`, `status?`, `owner?`, `tags?` | editor |
| `list_comments` | `page`, `includeResolved?` | viewer |
| `add_comment` | `page`, `body`, `replyTo?`, `section?` | viewer (D-45) |
| `resolve_comment` | `comment`, `reopen?` | editor |

- Phase 2에서 추가: `read_page` 헤더 주석에 `open_comments=N`(백링크는 `get_backlinks`로 따로), `list_templates`·`lint_markdown`에 `space`(커스텀 템플릿·Space 규칙), `create_page`의 `template`에 커스텀 템플릿 id.
- instructions는 큰 문서에서 **섹션 도구 우선**, 그리고 "사람이 남긴 미해결 댓글을 반영하면 답글을 달고 해결" 흐름(D-53)을 안내한다.

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
| D1 쓰기 행 (P2) | 최근 본 기록: 페이지뷰 1,000회 × upsert 1행(+ 50개 초과분 삭제) | ≈ 1,000~2,000 | 1~2% |
| D1 저장 | 문서 평균 10KB × 500 + 인덱스 | ≈ 20MB | 4% (500MB 기준) |
| R2 저장 | 이미지 2,000개 × 300KB | ≈ 600MB | 6% |

**결론**: 규모상 여유가 크다. 실제 병목은 **요청당 CPU 10ms**, **요청당 서브리퀘스트 50개**, **에이전트 폭주(루프 버그)**다.
- **서브리퀘스트 규칙**: D1·R2 호출도 1개씩 센다. 서비스 코드는 행마다 쿼리하지 않고 `DB.batch()`로 묶는다 (batch 1회 = 1 서브리퀘스트).
- 트리 조회는 `ETag`(tree_version)로 `304`를 반환해 D1 읽기를 줄이고, 완성된 트리 JSON을 `spaces.tree_json`에 캐시해 변경 후 첫 조회 때만 다시 만든다 (570페이지 2ms).
- `/api/v1/openapi.json`은 빌드 시 생성한 문자열을 그대로 보낸다 (`pnpm --filter @clavis/worker openapi`, 최신인지 테스트가 확인). 요청마다 만들면 30~115ms였다.
- MCP는 요청마다 서버를 새로 만들지만(stateless), 도구 스키마의 JSON Schema 변환은 isolate당 한 번만 한다 (호출당 15ms → 3.5ms).
- 에이전트 토큰별 분당 호출 제한: Workers Rate Limiting 바인딩 (S7, 무료 플랜 사용 가능 확인). 에이전트·비인증 120회/60초, 사람 600회/60초(별도 바인딩, Phase 2 Step 4 — 페이지 한 번에 요청이 7개 안팎이라 120회는 빠르게 둘러보기에 부족), 초과 시 `429` + `Retry-After`, 웹은 안내 화면과 다시 시도 버튼.
- 한도 초과 시 무료 플랜은 요청이 실패하므로, 대시보드 알림을 설정한다. 필요 시 Workers Paid($5/월) 전환이 유일한 비용 옵션이다.

## 12. 프론트엔드

### 12.1 라우트
| 경로 | 화면 |
|---|---|
| `/` | 홈: Space 목록(admin은 새 Space), 즐겨찾기, 최근 본 문서, 최근 변경(🧑/🤖), 내 문서의 열린 댓글 |
| `/s/:key` | Space 홈 → 홈 페이지로 이동 (D-35) |
| `/s/:key/p/:slugId` | 페이지 보기 (slug가 다르면 정규 URL로 교체) |
| `/s/:key/p/:slugId/edit?line=` | 편집 (`line`이면 그 줄로 이동) |
| `/s/:key/new?parent=&template=` | 새 페이지 (템플릿 선택) |
| `/s/:key/w/:title` | 위키 링크 해석 → 페이지로 이동 |
| `/s/:key/health` | 문서 상태 대시보드 (열면 재검사 자동 반복, 위반 클릭 → `edit?line=N`) |
| `/s/:key/settings?tab=rules\|templates` | 문서 규칙·템플릿 (규칙은 admin만 편집) |
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
- **페이지 보기 하단**: 백링크 목록, 댓글 스레드(해결된 것은 접기, 섹션 선택, 답글·수정·삭제·해결). 헤딩 옆에 열린 댓글 수 배지 → 해당 스레드로 스크롤.
- **페이지 메뉴**: 즐겨찾기(별), AI용 복사(제목·URL·원문), 원본 Markdown 열기 — viewer에게도 보이고 편집 항목만 editor 전용.
- **트리 편집**: 사이드바 드래그(위 1/4 = 앞, 아래 1/4 = 뒤, 가운데 = 하위로)와 페이지 메뉴의 이동 대화상자(키보드·모바일).

### 12.3 반응형
- `md` 이상: 3단(사이드바/본문/TOC), 편집 시 2단 분할.
- `md` 미만: 사이드바는 Drawer, TOC는 상단 접이식, 편집은 [편집 | 미리보기] 탭 (D-06).
- **폰 편집 화면** (Phase 2 Step 6): 앱 전체를 덮고 **키보드 위 보이는 영역**(`visualViewport`)에 고정한다. iOS는 키보드가 떠도 `100dvh`·fixed 요소를 줄이지 않고 캐럿을 보이려고 페이지를 스크롤하므로, `useVisualViewportVars()`(`lib/viewport.ts`)가 `<html>`에 `--vv-top`·`--vv-height`를 두고 레이아웃이 따라간다. 제목·저장은 항상 위, 서식 툴바는 키보드 바로 위.
  - 서식 툴바: 헤딩(##→###→해제)·굵게·목록·체크박스·링크·`[[`·코드. 선택 영역을 감싸고 다시 누르면 풀린다. 버튼은 `onMouseDown`에서 `preventDefault`해 에디터 포커스(키보드)를 유지한다.
  - 속성 폼과 lint 문제는 아래 시트(시트도 키보드 위로). CodeMirror 툴팁은 `tooltips({ tooltipSpace })`로 에디터 영역 안에서만 열린다.
  - 사진: `accept="image/*"`(카메라와 사진 보관함 모두 — `capture`는 카메라만 열어 뺐다). JPEG·HEIC는 브라우저에서 긴 변 2000px JPEG(품질 0.85, EXIF 회전 반영)로 줄여 올린다. 붙여넣기·첨부 버튼도 같다.
- **터치 화면의 입력칸은 16px 이상**: iOS Safari는 16px 미만 입력칸을 누르면 확대하고 되돌리지 않는다. 공통 입력 컴포넌트는 `text-sm pointer-coarse:text-base`, 에디터는 `--editor-font-size`(`(pointer: coarse)`에서 16px). `maximum-scale=1`로 확대 자체를 막지는 않는다(접근성).

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
