# Clavis — Phase 1 계획 (MVP)

> 상태: **In Progress** · 작성일: 2026-09-27 · 결정 확정: 2026-09-27 (§8 추천안 전부 채택)
> 선행 문서: [`00-concept.md`](./00-concept.md) · [`01-architecture.md`](./01-architecture.md) · [`02-phase0-plan.md`](./02-phase0-plan.md) · [`decisions.md`](./decisions.md)

---

## 1. 목표

**"사람과 AI가 함께 읽고 쓰는 위키"**의 최소 완성본을 만든다. Phase 1이 끝나면 팀이 실제 스펙·설계 문서를 Clavis로 옮겨 쓰기 시작할 수 있어야 한다.

- 사람: 브라우저(데스크톱·모바일)에서 Space를 만들고, 페이지를 트리로 정리하고, Markdown으로 편집하고, 검색한다.
- 에이전트: REST 또는 MCP로 같은 일을 한다. Hermes가 회의록을 템플릿으로 만들고, 코딩 에이전트가 스펙을 읽고 갱신한다.
- 문서 품질: 편집기와 저장 API가 같은 규칙으로 문서를 검사하고, `error`는 저장을 막는다.

## 2. 완료 조건 (Exit Criteria)

- [ ] 사람이 브라우저에서 Space 생성 → 템플릿으로 페이지 생성 → 편집(미리보기·lint 확인) → 이미지 붙여넣기 → 저장 → 검색으로 다시 찾기까지 끊김 없이 할 수 있다 (데스크톱 E2E 통과)
- [ ] 모바일 폭(375px)에서 트리 탐색·읽기·간단 편집·저장이 된다
- [ ] Hermes가 MCP만으로 `search_pages` → `read_page` → `update_page`(baseRevision) → `create_page`(template) 흐름을 수행하고, 결과가 UI에 `🤖 hermes`로 표시된다
- [ ] 동시 편집 시 나중 저장이 `409`를 받고, UI에서 내 변경을 잃지 않는다
- [ ] 삭제한 페이지(하위 포함)를 휴지통에서 복원할 수 있다
- [ ] 운영 환경 실측: 저장·트리·검색·첨부 요청의 CPU가 모두 **10ms 미만**(100KB 문서, 500페이지 Space 기준)
- [ ] 모든 REST 엔드포인트가 `/api/v1/openapi.json`에 나타나고, `/api/v1/docs`에서 볼 수 있다
- [ ] `01-architecture.md`가 실제 구현과 일치한다 (인증 구조 등 Phase 0 개정 사항 반영)

## 3. 범위

### 포함 (P1)
| 영역 | 내용 |
|---|---|
| Space | 생성·수정·보관, Space별 URL(`/s/{KEY}`), 홈 페이지 |
| Page | 트리 CRUD, 이동·순서 변경(드래그), 사이드바, breadcrumb, 휴지통·복원, slug-shortId URL과 정규 URL 리다이렉트 |
| 편집 | CodeMirror 6 + 분할 미리보기(스크롤 동기화), frontmatter 폼, 낙관적 잠금, 초안 자동 보관, 위키 링크 자동완성 |
| Markdown | GFM, Shiki 코드 하이라이트, Mermaid(지연 로딩), Callout, 위키 링크, TOC |
| 첨부 | 드래그&드롭·붙여넣기·파일 선택 업로드 → R2, `/files/{id}` 서빙 |
| Lint | 규칙 추가(필수 섹션, alt, 코드 언어, 문서 길이), 에디터 진단, 저장 시 서버 검사, markdownlint(브라우저 전용) |
| 템플릿 | prd, spec, adr, architecture, meeting (+ guide, note 빈 템플릿) |
| 검색 | FTS5 전문 검색(3자 미만 LIKE), type·status·Space 필터, ⌘K 빠른 이동 |
| 에이전트 | REST 전체 + OpenAPI/Scalar, MCP 쓰기 도구 7종 |
| 관리 | 사람 승인·역할 변경, 에이전트 등록·토큰 발급/폐기, Space 관리 화면 |
| UI | 반응형, 한국어/영어 |

### 제외 (P2 이후)
댓글, 백링크·깨진 링크 리포트, Space별 lint 설정, 섹션 단위 편집 API, 즐겨찾기·최근 문서, `.md` URL·`llms.txt`, 제목 변경 시 위키 링크 자동 치환, PR별 Preview 배포(§8 D-38)

## 4. 진행 순서

**API 먼저, UI는 그 위에** 쌓는다. Step 2가 끝나면 UI가 없어도 Hermes가 문서를 쓸 수 있으므로, 에이전트 쪽 피드백을 일찍 받을 수 있다.

```
Step 0        Step 1                 Step 2          Step 3              Step 4            Step 5              Step 6
정비          도메인 API              MCP 쓰기         읽기 UI              편집기             첨부·검색·관리 UI     마무리
──────        ─────────────          ─────────       ─────────           ─────────         ──────────────      ──────────
A0 문서정비    B1 Space API           M1 쓰기 도구     R1 라우트·레이아웃     E1 CodeMirror     F1 첨부 API·/files   H1 E2E
A1 FTS 마이그  B2 Page 조회·트리        M2 instructions  R2 사이드바 트리       E2 미리보기·동기화   F2 첨부 UI           H2 CPU 실측
A2 공유 스키마 B3 저장 파이프라인         M3 Hermes 검증   R3 렌더링 파이프라인   E3 frontmatter 폼  F3 검색 UI·⌘K        H3 문서 갱신
A3 템플릿     B4 이동·삭제·휴지통                       R4 페이지 보기·TOC     E4 lint 진단       F4 휴지통 UI         H4 Exit 점검
A4 lint 규칙  B5 검색 API                             R5 모바일 읽기         E5 저장·충돌·초안   F5 관리 UI
              B6 lint·템플릿 API                                           E6 위키 링크 완성   F6 Space 관리 UI
              B7 OpenAPI 문서                                              E7 새 페이지·트리 편집
```

- 각 Step은 **커밋 단위로 나누고**, Step이 끝날 때마다 `main`에 push해 자동 배포로 운영 환경에서 확인한다.
- Step 3~5는 서로 독립적인 부분이 많아 순서를 바꿔도 된다. 단, E(편집기)는 R3(렌더링)에 의존한다.

## 5. 작업 상세

### Step 0 — 정비 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| A0 | 문서 정비 | `01-architecture.md` §3·§4·§12를 실제 구조로 수정 (Worker 단위 Access, 서비스 토큰 + Bearer, `ctx.access` 대신 JWT 검증). `00-concept.md` §12 그림도 동일하게 |
| A1 | FTS 마이그레이션 | `migrations/0001_fts.sql`: `pages_fts`(trigram, external content) + INSERT/UPDATE/DELETE 트리거 (S1 검증 SQL 재사용). 삭제된 페이지(`deleted_at`)는 검색 쿼리에서 제외. 로컬·원격 적용, 백업이 FTS 테이블을 건드리지 않음을 테스트로 확인 |
| A2 | 공유 스키마 | `@clavis/shared/schema`에 API DTO 추가: `Space`, `PageSummary`, `Page`, `TreeNode`, `SaveResult`(page + violations), `SearchHit`, `Template`, `Attachment`. REST(zod-openapi)와 MCP 입력이 같은 스키마를 쓴다 |
| A3 | 템플릿 정의 | `packages/shared/src/templates/`: 유형별 frontmatter 기본값 + 필수 H2 섹션 + 안내 문구. `REQUIRED_SECTIONS`를 lint 규칙과 공유 (템플릿 = 규칙의 모범 답안) |
| A4 | lint 규칙 추가 | 줄 단위 규칙: `clavis/required-sections`(warning, 유형별), `clavis/image-alt`(info), `clavis/code-lang`(info), `clavis/doc-length`(info, 예: 50KB 초과). 모두 AST 없이. 규칙 메시지 구조 정리(§8 D-41). 100KB 문서 기준 서버 lint 시간 회귀 테스트 |

### Step 1 — 도메인 API 🤖

모든 서비스는 `src/services/`에 두고 REST와 MCP가 공유한다. **한 요청의 D1 호출은 `DB.batch()`로 묶어 5회 이하**를 목표로 한다 (§7).

| ID | 작업 | 완료 기준 |
|---|---|---|
| B1 | Space API | `GET/POST /spaces`, `GET/PATCH/DELETE /spaces/{key}`. key는 대문자 2~10자, 생성 후 변경 불가. 생성 시 홈 페이지를 함께 만든다(D-35). DELETE는 보관(`archived_at`, D-34), 보관된 Space는 목록에서 숨기고 읽기 전용. 생성·수정·보관은 admin |
| B2 | Page 조회·트리 | `GET /spaces/{key}/tree`(`ETag = tree_version`, `If-None-Match` → 304), `GET /pages/{idOrShortId}`(JSON 또는 `Accept: text/markdown`), `GET /pages/by-title?space=&title=`, breadcrumb용 조상 경로 포함 |
| B3 | 저장 파이프라인 | `POST /spaces/{key}/pages`(template, parentId, after), `PUT /pages/{id}`(title, content, baseRevision). 순서: 크기 검사(100KB 초과 413) → frontmatter 파싱 → 링크·첨부 이름 조회(batch 1회) → 서버 lint(error면 422 + violations) → 쓰기 batch 1회(pages, page_tags, page_links 교체, 이 제목을 가리키던 깨진 링크 재연결, tree_version 증가) → 200 + warnings. `revision` 불일치 시 409 + 현재 revision. 제목 중복 409. shortId(base36 6자, 충돌 시 재시도)·slug(한글 유지) 생성 |
| B4 | 이동·삭제·휴지통 | `POST /pages/{id}/move`(parentId, after/before → fractional index, 자기 자손 아래로 이동 금지), `DELETE /pages/{id}`(하위 트리 전체에 같은 `deleted_batch`), `GET /trash?space=`, `POST /trash/{batchId}/restore`(부모가 없으면 Space 루트로, 제목 충돌 시 `제목 (복원됨)`). 휴지통 30일 후 영구 삭제(첨부 R2 포함, D-36) |
| B5 | 검색 API | `GET /search?q=&space=&type=&status=&limit=&cursor=`. 3자 이상 FTS5 `MATCH` + `bm25` + `snippet`, 3자 미만 `LIKE`. 제목 일치 가중치. 검색어의 FTS 특수문자 이스케이프 |
| B6 | lint·템플릿 API | `POST /lint`(content, space → 저장 없이 전체 서버 규칙), `GET /templates` |
| B7 | OpenAPI 문서 | `/api/v1/docs`에 Scalar UI (CDN 스크립트, 정적 HTML 한 장). `openapi.json`에 모든 엔드포인트·에러 응답 스키마 |

**테스트**: 엔드포인트별 Worker 테스트(권한별 200/403, 422·409·413 경로, 휴지통 왕복, 검색 한국어 3자·2자), 서비스 단위 테스트(fractional index, 링크 재연결).

### Step 2 — MCP 쓰기 도구 🤝 (Hermes 검증은 사용자)

| ID | 작업 | 완료 기준 |
|---|---|---|
| M1 | 도구 추가 | `search_pages`, `create_page`, `update_page`, `move_page`, `delete_page`, `lint_markdown`, `list_templates`. 쓰기 도구는 editor 이상만 목록에 노출. 결과는 토큰 효율 우선: 저장 결과는 `revision` + violations 요약 한 줄씩, 409는 "최신 revision N, read_page로 다시 읽을 것" 안내 |
| M2 | 서버 instructions | "수정 전 `read_page`로 revision 확인", "새 문서는 `list_templates` 후 template 지정", "warning도 가능하면 고칠 것", "제목은 frontmatter가 아니라 title 인자" |
| M3 | Hermes 검증 | 사용자가 Hermes로 회의록 생성·수정 시나리오 실행. `docs/guides/agent-connection.md`에 쓰기 도구 사용 예 추가 |

### Step 3 — 읽기 UI 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| R1 | 라우트·레이아웃 | `/`, `/s/$key`, `/s/$key/p/$slugId`, `/s/$key/trash`, `/search`, `/admin`. slug가 다르면 정규 URL로 `replace`. 404·403·pending 화면 |
| R2 | 사이드바 트리 | 트리 API + TanStack Query 캐시(ETag), 펼침 상태 기억, 현재 페이지 강조, type·status 뱃지. Space 전환 드롭다운 |
| R3 | 렌더링 파이프라인 | `apps/web/src/markdown/`: unified(remark-parse, remark-gfm, 위키 링크·Callout·첨부 경로 플러그인, rehype-sanitize, 헤딩 id) → React. Shiki는 fine-grained + 언어 지연 로딩, Mermaid는 코드 블록이 있을 때만 import(`securityLevel: 'strict'`). 각 블록에 `data-line`(스크롤 동기화용) |
| R4 | 페이지 보기 | breadcrumb, 제목, 메타(type·status·owner·tags), `🤖 hermes · 3분 전` 작성자 표시, 본문, TOC(스크롤 위치 강조), 깨진 위키 링크는 빨간 점선 |
| R5 | 모바일 읽기 | 사이드바 Drawer, TOC 상단 접이식, 표·코드 가로 스크롤, 375px에서 가로 스크롤 없음 |

### Step 4 — 편집기 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| E1 | CodeMirror 6 | `/edit` 라우트, `@codemirror/lang-markdown`(코드 블록 언어별 하이라이트), 한국어 IME 정상 입력, 편집기 번들은 편집 화면에서만 로드 |
| E2 | 미리보기 | 150ms 디바운스로 R3 파이프라인 재사용, `data-line` 기반 양방향 스크롤 동기화. 모바일은 [편집 \| 미리보기] 탭 |
| E3 | frontmatter 폼 | 제목 입력 + type·status 선택, owner, tags 칩. 폼 ↔ YAML 양방향 동기화, "원문 보기"에서 YAML 직접 편집. type 변경 시 누락된 필수 섹션 추가 제안 |
| E4 | lint 진단 | `@codemirror/lint`로 밑줄·거터, 하단 Problems 패널(클릭 시 해당 줄 이동). Clavis 규칙 + markdownlint 어댑터(브라우저 전용). `resolveLink`는 트리 캐시로 |
| E5 | 저장·충돌·초안 | ⌘S 저장, 422는 Problems 패널에 표시, 409는 다이얼로그(내 변경 복사 → 최신본 불러오기), 미저장 변경은 `localStorage` 초안으로 보관 후 재진입 시 복구 제안, 이탈 경고 |
| E6 | 위키 링크 자동완성 | `[[` 입력 시 현재 Space 제목 검색, `KEY:` 입력 시 다른 Space. 첨부 `](attachments/` 자동완성 |
| E7 | 새 페이지·트리 편집 | 사이드바 "+ 새 페이지"(부모 지정) → 템플릿 선택 → 편집 화면. 사이드바 드래그로 이동·순서 변경(데스크톱), 메뉴의 "이동…" 대화상자(모바일), 삭제 확인 |

### Step 5 — 첨부·검색·관리 UI 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| F1 | 첨부 API | `POST /pages/{id}/attachments`(원본 바이트 본문 + `?filename=`, 25MB, 이름 충돌 시 `-1` 접미사), `GET /pages/{id}/attachments`, `DELETE /attachments/{id}`, `GET /files/{id}`(권한 확인 후 R2 스트리밍, `Cache-Control: private, max-age=86400`, SVG·HTML은 `Content-Disposition: attachment`). 업로드는 스트리밍으로 R2에 바로 넣어 CPU를 쓰지 않는다 |
| F2 | 첨부 UI | 편집기에 드래그&드롭·붙여넣기 → 업로드 → `![](attachments/name.png)` 삽입(업로드 중 자리표시), 모바일은 파일 선택 버튼, 페이지의 첨부 목록 패널 |
| F3 | 검색 UI | `/search` 결과(snippet 강조, 필터), 헤더 ⌘K 명령 팔레트(제목 빠른 이동은 트리 캐시, 본문은 검색 API) |
| F4 | 휴지통 UI | Space별 휴지통 목록(삭제자·시간·하위 페이지 수), 복원 |
| F5 | 관리 UI | `/admin`: 승인 대기 사람 목록·역할 변경, 에이전트 등록, 토큰 발급(1회 표시 + 복사), 폐기, 마지막 사용 시각 |
| F6 | Space 관리 UI | Space 목록 대시보드, 생성·이름/설명 수정·보관(admin) |

### Step 6 — 마무리 🤝

| ID | 작업 | 완료 기준 |
|---|---|---|
| H1 | E2E | Playwright 스모크(로컬 `wrangler dev` 대상): Exit 조건 첫 두 줄 시나리오 + 409 충돌. CI check 잡에 추가(D-39) |
| H2 | CPU 실측 | 운영 환경에 500페이지 샘플 Space를 임시로 만들고 `wrangler tail`로 저장(100KB)·트리·검색·첨부 CPU 측정 → 결과를 이 문서 §9에 기록, 샘플 삭제 |
| H3 | 문서 갱신 | `00-concept.md`·`01-architecture.md`를 구현과 맞추고, 사용자 가이드(`docs/guides/`)에 편집·lint 규칙 목록 추가 |
| H4 | Exit 점검 | §2 체크리스트 전부 확인, 사용자와 함께 실제 문서 몇 개를 옮겨 보기 |

## 6. 역할 분담

| 표시 | 의미 |
|---|---|
| 🤖 | Claude가 진행 |
| 👤 | 사용자 작업 |
| 🤝 | 사용자 확인 후 Claude가 진행 |

| # | 사용자 작업 | 시점 |
|---|---|---|
| U1 | §8 결정 사항 검토 | 시작 전 |
| U2 | Hermes로 MCP 쓰기 시나리오 실행 (M3) | Step 2 후 |
| U3 | 브라우저에서 편집 흐름 사용해 보기 (데스크톱·휴대폰) | Step 4·5 후 |
| U4 | 옮겨 올 실제 문서 몇 개 준비 (H4) | Step 6 |

## 7. 무료 플랜 예산 (요청 1회 기준)

| 요청 | D1·R2 호출(서브리퀘스트) | CPU 목표 | 비고 |
|---|---|---|---|
| 인증 (공통) | 1 (토큰 또는 actor 조회) + `last_used_at` 갱신은 1시간에 1번 | < 1ms | JWT 검증은 JWKS 캐시 |
| 페이지 저장 | 2 (조회 batch 1 + 쓰기 batch 1) | < 6ms (100KB) | S2 실측 3.5ms 중앙값 |
| 트리 조회 | 1, 변경 없으면 304 | < 3ms (500페이지) | content 컬럼 제외 조회 |
| 검색 | 1 | < 3ms | snippet은 D1이 계산 |
| 첨부 업로드 | 2 (D1 1 + R2 put 1) | < 2ms | 스트리밍, 본문을 메모리에 읽지 않음 |
| 휴지통 영구 삭제 (Cron) | D1 2 + R2 delete 1 (최대 1000개 키) | < 5ms | 백업 Cron의 매 실행 앞부분, 실행당 최대 50페이지 |

## 8. 결정 사항

아래 추천안을 모두 채택했다 (2026-09-27, [`decisions.md`](./decisions.md) D-34~D-43).

| ID | 주제 | 추천안 | 대안 |
|---|---|---|---|
| D-34 | Space 삭제 | **보관(archive)만**, 읽기 전용으로 숨김. 영구 삭제는 P1 제외. key는 변경 불가 | 영구 삭제 제공 / key 변경 허용(링크 깨짐) |
| D-35 | Space 홈 페이지 | Space 생성 시 **홈 페이지(type `note`, 제목 = Space 이름)를 자동 생성**하고 `home_page_id`로 지정 | 홈 페이지 없이 트리·최근 변경 개요 화면 |
| D-36 | 휴지통 영구 삭제 | **30일 후**, 기존 백업 Cron 창의 첫 실행에서 처리 (Cron 추가 없음) | 영구 삭제 안 함 / 관리자가 수동 비우기 |
| D-37 | 편집 권한 범위 | editor는 모든 페이지 생성·수정·이동·삭제·복원, admin만 Space 생성·보관과 사람·에이전트 관리 | 삭제·복원은 admin 전용 |
| D-38 | PR Preview 배포 (Phase 0 T11) | **P1에서도 제외**. 로컬 개발 + 테스트 + `main` 자동 배포로 충분 (10명 이하 팀, 별도 D1·Access 설정 비용 대비 효과 작음) | 별도 D1 `clavis-preview` + `wrangler versions upload` |
| D-39 | E2E 테스트 | **Playwright 스모크 3~4개**만, CI check에 포함 | E2E 없이 단위·Worker 테스트만 / 폭넓은 E2E |
| D-40 | 코드 하이라이트 | **Shiki**(언어 지연 로딩, 테마 라이트·다크 2개) | highlight.js·Prism(더 가볍지만 품질 낮음) |
| D-41 | lint 메시지 언어 | 위반 항목에 `ruleId` + 파라미터 + **영어 기본 메시지**를 담고, UI는 `ruleId`로 번역. API는 항상 영어 (Accept-Language 처리 안 함) | `01-architecture.md` §7의 Accept-Language 방식 |
| D-42 | 제목 변경 시 위키 링크 | (기존 방침 유지) 자동 치환 없음 → 깨진 링크 warning. 대신 저장 응답에 "이 제목을 가리키던 페이지 N개" 알림 | P1에서 자동 치환 |
| D-43 | 동시 편집 표시 | P1은 409 감지만 (편집 중 표시 없음) | 편집 화면 진입 시 "최근 5분 내 다른 사람이 수정함" 표시 |

## 9. 결과 기록

| 항목 | 상태 | 결과 | 날짜 |
|---|---|---|---|
| Step 0 | ✅ 완료 | 설계 문서를 실제 인증 구조로 수정, `0001_fts`(trigram + 트리거 + rebuild)·`0002_page_deleted_by` 마이그레이션, 공용 API 스키마(`schema/wiki.ts`, `schema/url.ts`), 템플릿 7종(`@clavis/shared/templates`, 한/영 섹션명), lint 규칙 4개 추가(required-sections, image-alt, code-lang, doc-length). 100KB 전체 lint가 Node에서 5ms 미만인지 회귀 테스트 | 2026-09-27 |
| Step 1 | ✅ 완료 | REST: Space(생성 시 홈 페이지, 보관), 트리(ETag·304), 페이지 CRUD(JSON·`text/markdown`, `KEY:제목` 참조), 이동(fractional index, 자기 하위로 이동 금지), 휴지통·복원(제목 충돌 시 ` (restored)`), 검색(FTS/LIKE, 필터, 커서), `/lint`, `/templates`, `/docs`(Scalar). 저장은 D1 호출 2회(읽기 batch + 쓰기 batch, 쓰기 batch 첫 문장이 revision 가드). 휴지통 영구 삭제는 Cron 실행마다 최대 50페이지. Worker 테스트 56개 | 2026-09-27 |
| Step 2 | ✅ 완료 (M3 대기) | MCP 도구 10개(읽기 6 + 쓰기 4, viewer에게는 쓰기 도구 비노출), 서버 instructions에 작성 규칙, 저장 결과·충돌·검사 오류를 에이전트가 바로 고칠 수 있는 텍스트로 반환(줄 번호, 다음 행동), 페이지 URL 포함. 가이드에 도구 목록·쓰기 흐름 추가. **M3(Hermes 실사용 검증)은 push·배포 후 사용자 진행** | 2026-09-27 |
| Step 3 | ✅ 완료 | 라우트(`/`, `/s/$key` → 홈 페이지, `/s/$key/p/$slugId` + 정규 URL 리다이렉트, `/s/$key/w/$title` 위키 링크 해석), 사이드바(Space 전환, 트리 ETag 캐시·펼침 기억·현재 페이지 조상 자동 펼침), 렌더링(unified + GFM + 위키 링크·Callout·첨부 플러그인, sanitize, `data-line`, 헤딩 id), Shiki·Mermaid 지연 로딩(해당 블록이 있을 때만), 페이지 보기(breadcrumb, 유형·상태·담당·태그, 🤖/사람 작성자 표시, TOC 현재 위치 강조), 모바일(Drawer, 접이식 TOC, 375px 가로 스크롤 없음 확인). `/search`·`/admin` 라우트는 기능과 함께 Step 5에서. 초기 번들 157KB(gzip), 페이지 렌더러 청크 85KB | 2026-09-27 |
| Step 4 | ✅ 완료 | CodeMirror 6 에디터(frontmatter 영역 인식, 코드 블록 언어별 하이라이트, ⌘S), 150ms 디바운스 미리보기 + `data-line` 양방향 스크롤 동기화, frontmatter 폼 ↔ YAML(주석·키 순서 보존), 필수 섹션 누락 시 "끝에 추가", 서버와 같은 Clavis 규칙 + 브라우저 전용 markdownlint(Clavis 규칙과 겹치는 MD001·MD040·MD045, 위키에 맞지 않는 MD013·MD028·MD041·MD060 등 제외) → 밑줄·Problems 패널(클릭 시 해당 줄), 409 충돌 다이얼로그(내 내용 복사 후 최신본), 초안 자동 보관·복구, 이탈 경고, `[[` 위키 링크·`KEY:` 다른 Space 자동완성, 새 페이지(템플릿 선택 → 편집), 페이지 메뉴(하위 추가·이동·삭제), 트리 드래그 이동(위/안/아래)과 `+` 버튼, 모바일 [편집 \| 미리보기] 탭과 접이식 속성. 로컬 브라우저에서 저장·충돌·초안·자동완성·새 페이지 흐름 확인. 편집 화면 청크 374KB(편집 시에만 로드) | 2026-09-27 |
| Step 5 | ✅ 완료 | 첨부 API(원본 바이트를 본문으로 받아 R2로 스트리밍 — multipart 파싱 CPU를 피하려고 계획에서 변경, 25MB, 이름 정리·`-1` 접미사, 삭제), `/files/{id}`(권한 확인, 휴지통 페이지 파일 숨김, `sandbox` CSP·nosniff, SVG/HTML은 다운로드, ETag 304), 에디터 붙여넣기·드롭·파일 선택 업로드(자리표시 → 참조 삽입), 페이지 첨부 목록, 검색 화면(필터·더 보기·하이라이트), ⌘K 팔레트(현재 Space 제목 즉시 + 전문 검색), 휴지통 화면(복원·영구 삭제 예정일), 관리 화면(사람 승인·역할·중지, 에이전트 추가·토큰 1회 표시·폐기, Space 생성·수정·보관), Space 목록에 새 Space. Worker 테스트 66개 | 2026-09-27 |
| Step 6 | 🔶 진행 중 | **H1 ✅** Playwright 스모크 4개(명세 작성→미리보기·lint→저장→검색, 오류 시 저장 차단·409 충돌, 이미지 첨부, 모바일 편집·Drawer·가로 스크롤 없음)를 빈 로컬 D1의 `wrangler dev`로 실행, CI check 잡에 추가. 테스트로 찾은 버그 2건 수정(모바일 저장 버튼 접근성 이름 없음, 한글 첨부 이름이 퍼센트 인코딩되어 삽입됨). **H3 ✅** `01-architecture.md` v0.3(저장 파이프라인·lint 규칙·API·MCP·첨부·화면을 구현과 일치), `guides/writing.md`(작성·문법·규칙). **H2·H4·M3 대기**: push·배포 후 진행 | 2026-09-27 |
| H2 CPU 실측 | – | | |
| Exit 점검 | – | | |
