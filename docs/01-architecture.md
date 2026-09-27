# Clavis — 기술 아키텍처 (v0.2)

> 상태: **Active** · 작성일: 2026-09-27 · v0.2: Phase 0 결과 반영 (인증 구조, 서버 lint 범위, 백업)
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
│   │   ├── src/routes/      #   화면 (TanStack Router)
│   │   ├── src/editor/      #   CodeMirror 6 + lint 진단 + 미리보기
│   │   ├── src/components/  #   shadcn/ui 기반 컴포넌트
│   │   └── src/i18n/        #   ko.json, en.json
│   └── worker/              # Cloudflare Worker
│       ├── src/index.ts     #   fetch / scheduled 진입점
│       ├── src/api/         #   Hono 라우트 (zod-openapi)
│       ├── src/mcp/         #   MCP 서버 & 도구 정의
│       ├── src/services/    #   도메인 로직 (REST·MCP 공용)
│       ├── src/auth/        #   Access JWT / API Token 검증
│       ├── src/db/          #   Drizzle 스키마, 쿼리
│       ├── migrations/      #   drizzle-kit 생성 + FTS 수동 SQL
│       └── wrangler.jsonc
├── packages/
│   └── shared/              # 브라우저·Worker 공용
│       ├── markdown/        #   unified 파이프라인 설정, 위키링크 파서
│       ├── lint/            #   규칙 엔진 (markdownlint + 커스텀 규칙)
│       ├── schema/          #   zod 스키마 (API DTO, frontmatter)
│       └── templates/       #   문서 유형별 템플릿 (P1은 코드로 내장)
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
  deleted_batch TEXT                       -- 하위 트리 일괄 삭제/복원 단위
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
PUT /api/v1/pages/{id}  { title, content, baseRevision }
  1. 인증/권한 확인 (editor 이상)
  2. frontmatter 파싱 (YAML) ─ 실패 시 422
  3. 서버 lint: Clavis 규칙 전체 실행 (D-27 개정, AST 없이 줄 단위)
       · error(frontmatter 스키마, 첨부 참조 등)가 있으면 → 422 + violations
       · warning/info는 응답에 포함
  4. 링크 추출: [[위키 링크]], 내부 URL (정규식 기반, 코드 블록 제외)
  5. D1 batch (단일 트랜잭션):
       UPDATE pages SET ..., revision = revision + 1
         WHERE id = ? AND revision = ?       ← 0행이면 409 Conflict
       page_tags / page_links 교체, pages_fts 갱신, spaces.tree_version 증가(제목 변경 시)
  6. 200 { page, revision }
```

- **CPU 예산**: 2~4단계는 Markdown AST를 만들지 않고 frontmatter 파서 + 줄 스캔 + 정규식으로 처리한다. Cloudflare 실측(S2) 100KB 문서 중앙값 3.5ms, 최대 6ms.
- **AST 기반 파싱은 서버 금지**: remark·markdownlint는 Cloudflare 실측 10KB에 25ms 이상(S3). markdownlint 서식 규칙은 브라우저 에디터에서만 실행한다.
- **문서 크기 상한**: 본문 100KB (D-33 제안). 초과 시 413.
- 저장 응답과 `POST /api/v1/lint`(MCP `lint_markdown`)는 같은 Clavis 규칙 결과를 반환하므로, 에이전트는 저장 응답만으로 warning을 확인할 수 있다.

## 7. Lint 엔진 (`packages/shared/lint`)

```ts
interface LintRule {
  id: string;                     // 'clavis/frontmatter-required'
  severity: 'error' | 'warning' | 'info';
  blocking: boolean;              // true면 서버 저장 시에도 실행 (D-27)
  appliesTo?: DocType[];          // 문서 유형 한정 규칙
  check(ctx: LintContext): Violation[];
}
interface LintContext {
  frontmatter: Frontmatter; body: string; ast?: MdastRoot;   // ast는 비-blocking 규칙만
  resolveLink(spaceKey: string, title: string): boolean;     // 브라우저: 트리 캐시 / 서버: DB
  attachmentExists(filename: string): boolean;
}
interface Violation { ruleId: string; severity: string; message: string; line: number; column?: number; fix?: string }
```

- **markdownlint** 규칙(헤딩 증가, 코드 블록 언어 등)은 어댑터로 감싸 같은 `Violation` 형식으로 변환한다.
- 위반 항목은 `ruleId` + `params` + 영어 기본 메시지를 담는다. UI는 `ruleId`와 `params`로 한국어/영어 메시지를 만들고, API는 항상 영어 메시지를 반환한다 (D-41).
- 문서 유형별 필수 섹션 규칙은 `templates/`의 정의를 참조한다 → **템플릿과 규칙이 한 곳에서 관리됨**.

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
| Method | Path | 설명 |
|---|---|---|
| GET | `/spaces` | Space 목록 |
| POST | `/spaces` | Space 생성 (admin) |
| GET/PATCH/DELETE | `/spaces/{key}` | 조회/수정/보관 |
| GET | `/spaces/{key}/tree` | 페이지 트리 (id, shortId, title, type, status, children). `ETag = tree_version` |
| POST | `/spaces/{key}/pages` | 페이지 생성 (`template`, `parentId` 지정 가능) |
| GET | `/pages/{idOrShortId}` | 페이지 조회 (content, 메타, revision, updatedBy) |
| PUT | `/pages/{id}` | 페이지 수정 (title, content, baseRevision) |
| POST | `/pages/{id}/move` | 부모/위치 변경 (`parentId`, `after`/`before`) |
| DELETE | `/pages/{id}` | 휴지통으로 이동 (하위 포함) |
| GET | `/trash?space=` | 휴지통 목록 |
| POST | `/trash/{batchId}/restore` | 복원 |
| GET | `/pages/by-title?space=&title=` | 제목으로 조회 (에이전트용 위키 링크 해석) |
| GET | `/search?q=&space=&type=&status=` | 전문 검색 (snippet 포함) |
| POST | `/lint` | 저장 없이 전체 규칙 검사 |
| GET | `/templates` | 템플릿 목록과 필수 섹션 |
| POST | `/pages/{id}/attachments` | 첨부 업로드 (multipart) |
| GET | `/pages/{id}/attachments` | 첨부 목록 |
| DELETE | `/attachments/{id}` | 첨부 삭제 |
| GET | `/me` | 현재 actor |
| GET/POST/DELETE | `/admin/actors`, `/admin/tokens` | 사용자·에이전트·토큰 관리 (admin) |

## 9. MCP 서버 (D-12)

- **Stateless** `createMcpHandler` + Streamable HTTP, 엔드포인트 `/mcp`. Durable Objects 불필요(무료 플랜 OK).
- 도구 입력 스키마는 REST와 같은 zod 스키마를 재사용하고, 구현은 Service Layer를 직접 호출한다.
- 응답은 **토큰 효율**을 우선한다: 페이지 조회 시 JSON 대신 frontmatter 포함 Markdown 원문 + 짧은 메타 헤더를 반환.

| 도구 | 입력 | 비고 |
|---|---|---|
| `list_spaces` | – | |
| `get_space_tree` | `space`, `depth?` | 제목·shortId·type·status만 |
| `search_pages` | `query`, `space?`, `type?`, `status?`, `limit?` | snippet 포함 |
| `read_page` | `page` (shortId 또는 `KEY:제목`) | 원문 + revision |
| `create_page` | `space`, `title`, `content?`, `template?`, `parent?` | lint 결과 동봉 |
| `update_page` | `page`, `content`, `baseRevision`, `title?` | 409 시 최신 revision 안내 |
| `move_page` | `page`, `parent?`, `after?` | |
| `delete_page` | `page` | 휴지통 이동 |
| `lint_markdown` | `content`, `space?` | 전체 규칙 |
| `list_templates` | – | 필수 섹션 포함 |

- 서버 `instructions`에 Clavis 사용 규칙(“수정 전 `read_page`로 revision 확인”, “저장 전 `lint_markdown`”, “새 문서는 템플릿 사용”)을 담아 에이전트 행동을 유도한다.
- ⚠ Phase 0 검증: Hermes Agent의 MCP 클라이언트가 Streamable HTTP + `Authorization` 헤더 설정을 지원하는지 확인.

## 10. 첨부파일 & 백업 (D-20, D-30, D-31)

### 10.1 첨부
- 업로드: `POST /pages/{id}/attachments` → Worker가 R2에 `att/{pageId}/{attachmentId}`로 저장. 파일당 **최대 25MB** (앱 정책).
- 본문 참조 문법 (D-31): `![다이어그램](attachments/arch.png)`, `[명세서](attachments/spec.pdf)` — **페이지 기준 상대 경로**. 렌더러가 `/files/{attachmentId}`로 변환한다. 파일명이 곧 참조 키이므로 페이지 안에서 유일해야 한다.
- 에디터에 붙여넣기/드래그 시 업로드 후 위 문법을 자동 삽입. 이름 충돌 시 `arch-1.png`처럼 접미사 부여.
- 서빙: `/files/{id}` → 권한 확인 후 R2 스트리밍, `Cache-Control: private, max-age=86400`. R2 버킷은 비공개.

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
- 트리 조회는 `ETag`(tree_version)로 `304`를 반환해 D1 읽기를 줄인다.
- 에이전트 토큰별 분당 호출 제한: Workers Rate Limiting 바인딩 (S7, 무료 플랜 사용 가능 확인). 기본 120회/60초, 초과 시 `429` + `Retry-After`.
- 한도 초과 시 무료 플랜은 요청이 실패하므로, 대시보드 알림을 설정한다. 필요 시 Workers Paid($5/월) 전환이 유일한 비용 옵션이다.

## 12. 프론트엔드

### 12.1 라우트
| 경로 | 화면 |
|---|---|
| `/` | Space 목록 |
| `/s/:key` | Space 홈 (홈 페이지 또는 개요) |
| `/s/:key/p/:slugId` | 페이지 보기 |
| `/s/:key/p/:slugId/edit` | 편집 |
| `/s/:key/new?parent=&template=` | 새 페이지 (템플릿 선택) |
| `/s/:key/trash` | 휴지통 |
| `/search` | 검색 결과 |
| `/admin` | 사용자·에이전트·토큰·Space 관리 |

### 12.2 편집기
- **CodeMirror 6**: Markdown 모드, `@codemirror/lint`로 Violation을 밑줄·거터 아이콘으로 표시, 하단 Problems 패널.
- **미리보기**: 입력 후 150ms 디바운스로 unified 파이프라인 실행. mdast 노드의 소스 위치(`position`)를 DOM `data-line`에 기록해 **스크롤 동기화**.
- **Mermaid**: 코드 블록을 lazy-import하여 렌더링 (`securityLevel: 'strict'`). 초기 번들에서 제외.
- **Frontmatter 폼**: 폼 ↔ YAML 양방향 동기화. 원문 모드에서 YAML을 직접 편집할 수도 있다.
- **위키 링크 자동완성**: `[[` 입력 시 현재 Space 트리(캐시)에서 제목 검색.
- **충돌 처리**: 저장 시 409를 받으면 "다른 사람이 수정함" 다이얼로그 → 내 변경을 클립보드로 보존하고 최신본 불러오기.
- **이탈 방지**: 미저장 변경은 `localStorage`에 초안으로 보관.

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
