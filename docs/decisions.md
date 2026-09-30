# Clavis — 결정 사항 로그

> 각 항목은 선택지와 결정 결과, 이유를 기록한다. 상태: `Open` / `Decided` / `Verify`(Phase 0 검증 필요)

## 요약

| ID | 주제 | 상태 | 결정 |
|---|---|---|---|
| D-01 | 백엔드 기술 스택 | Decided | Cloudflare Workers + TypeScript |
| D-02 | 프론트엔드 기술 스택 | Decided | React + Vite SPA |
| D-03 | 문서 저장 방식 | Decided | DB에 Markdown 원문 저장 |
| D-04 | 데이터베이스 | Decided | Cloudflare D1 |
| D-05 | 인증 & 권한 | Decided (rev. Step 3) | workers.dev + Worker 단위 Access(이메일 코드 → 추후 Google, @gmail.com), 에이전트는 Access Service Token + Clavis API Token, 전역 역할 |
| D-06 | 모바일 편집 범위 | Decided | 읽기 우선 + 간단 편집 |
| D-07 | 페이지 구조 | Decided | 페이지 트리 (Confluence 방식) |
| D-08 | 페이지 URL 형식 | Decided | `slug-shortId` |
| D-09 | Lint 위반 시 저장 정책 | Decided | error만 차단 |
| D-10 | Frontmatter | Decided | 필수 + 폼 UI |
| D-11 | 검색 | Decided (S1) | D1 FTS5 trigram, external content + 트리거, 3자 미만은 LIKE |
| D-12 | 에이전트 연동 수단 | Decided | REST API + Remote MCP (둘 다 P1) |
| D-13 | 에이전트 쓰기 정책 / Hermes | Decided | 자유 수정 + 작성자 표시 / Hermes는 MCP |
| D-14 | Markdown 확장 문법 | Decided | Mermaid, Callout, 위키 링크 |
| D-15 | 댓글·템플릿 Phase | Decided | 템플릿 P1, 댓글 P2 |
| D-16 | Import | Decided | 하지 않음 |
| D-17 | 배포 환경 | Decided | Cloudflare 무료 플랜 |
| D-18 | UI 언어 | Decided | 한국어 + 영어 (i18n) |
| D-19 | 사용 규모 | Decided | 10명 이하, 수백 건 |
| D-20 | 첨부파일 저장소 | Decided | Cloudflare R2 |
| D-21 | 편집 안전장치 | Superseded by D-54 | 휴지통만 → P3에서 버전 히스토리 추가 |
| D-22 | 한글 slug | Decided | 한글 그대로 사용 |
| D-23 | 위키 링크 해석 범위 | Decided | 현재 Space 우선, `[[KEY:제목]]`로 다른 Space |
| D-24 | DB 접근 방식 | Decided | Drizzle ORM + drizzle-kit |
| D-25 | UI 스타일링 | Decided | Tailwind + shadcn/ui |
| D-26 | REST API 정의 방식 | Decided | Hono + zod-openapi |
| D-27 | 서버측 lint 범위 | Decided (rev. S3) | 서버는 Clavis 줄 단위 규칙 전체, markdownlint 스타일 규칙은 브라우저 전용 |
| D-28 | 페이지 원문 저장 형식 | Decided | frontmatter 포함 Markdown 전체를 `content`에 저장, 메타는 파생 컬럼 |
| D-29 | 사용자 등록 방식 | Decided (rev.) | 최초 사용자는 Admin, 이후 로그인은 `pending`(승인 대기) → Admin이 역할 부여 |
| D-30 | 운영 백업 | Decided (S6) | D1 Time Travel + 야간 분할 Markdown 백업(150KB/실행, 2분 간격 60회, R2 14일 보관) |
| D-31 | 첨부 참조 문법 | Decided | `attachments/<파일명>` 상대 경로 |
| D-32 | 형제 페이지 순서 | Decided | fractional index 문자열 |
| D-33 | 문서 크기 상한 | Decided | 본문 100KB (저장 CPU 여유 확보, AI 컨텍스트 고려) |
| D-34 | Space 삭제 | Decided | 보관(archive)만, 읽기 전용으로 숨김. key 변경 불가 |
| D-35 | Space 홈 페이지 | Decided | Space 생성 시 홈 페이지(type `note`, 제목 = Space 이름) 자동 생성 |
| D-36 | 휴지통 영구 삭제 | Decided | 30일 후, 기존 백업 Cron 창에서 처리 (실행당 최대 50페이지) |
| D-37 | 편집 권한 범위 | Decided | editor는 페이지 전체 작업(삭제·복원 포함), admin은 Space 생성·보관과 사람·에이전트 관리 |
| D-38 | PR Preview 배포 | Decided | P1에서 제외 (로컬 + 테스트 + main 자동 배포) |
| D-39 | E2E 테스트 | Decided | Playwright 스모크 3~4개, CI check에 포함 |
| D-40 | 코드 하이라이트 | Decided | Shiki (언어 지연 로딩, 라이트·다크 테마) |
| D-41 | lint 메시지 언어 | Decided | `ruleId` + 파라미터 + 영어 기본 메시지, UI가 `ruleId`로 번역 |
| D-42 | 제목 변경 시 위키 링크 | Decided (rev. 2026-09-27) | 다른 문서의 `[[옛 제목]]`을 자동으로 새 제목으로 수정 (코드 블록 제외, 한 번에 50페이지·200KB까지) |
| D-43 | 동시 편집 표시 | Decided | P1은 409 감지만 |
| D-44 | 댓글 형태 | Decided | 페이지 스레드 + 답글 1단계, 섹션(헤딩) 연결 선택, 해결·다시 열기 |
| D-45 | 댓글 권한 | Decided | viewer도 작성, 수정은 작성자, 삭제는 작성자·admin, 해결은 editor 이상 |
| D-46 | lint 대시보드 | Decided | 저장 시 페이지별 요약 저장 + 150KB 단위 재검사, 링크 문제는 `page_links` 현재 상태 |
| D-47 | Space lint 설정 범위 | Decided | 규칙 심각도·유형별 필수 섹션·문서 길이 한도, `frontmatter-required`는 error 고정, admin만 |
| D-48 | 섹션 편집 충돌 판정 | Decided | 섹션 해시(읽은 섹션이 그대로면 저장), `baseRevision`을 주면 엄격 판정 |
| D-49 | 커스텀 템플릿 | Decided | Space별 + 전역, 기존 7개 유형에 연결, 템플릿도 lint |
| D-50 | 최근 본 문서 | Decided | 서버 `page_views`(`waitUntil` 기록, 사람별 50개) |
| D-51 | `.md` URL·`llms.txt` | Decided | 둘 다 포함 (Access 뒤, 외부 비공개) |
| D-52 | 댓글 알림 | Decided | 알림 없음, 홈의 미해결 댓글·페이지 배지로 대신 (알림은 P3) |
| D-53 | 에이전트 댓글 | Decided | 읽기·작성·해결 허용, 🤖 표시 |
| D-54 | 편집 안전장치 (D-21 개정) | Decided | 저장마다 전체 본문 스냅샷: 본문 R2 `rev/{pageId}/{revision}.md`, 목록 D1 `page_revisions` |
| D-55 | 버전 보관 | Decided | 전부 보관, 페이지 영구 삭제 때 함께 삭제 |
| D-56 | 복원 방식 | Decided | 옛 본문을 새 revision으로 저장 (일반 저장 파이프라인) |
| D-57 | 알림 대상 | Decided | 내 문서 새 댓글, 내 스레드 답글, `@멘션`, 지켜보는 문서 변경. 안 읽은 같은 알림은 묶음 |
| D-58 | 알림 채널 | Decided | 앱 안 알림 + Space별 Slack·Webhook, 이메일 제외 |
| D-59 | 에이전트와 알림 | Decided | 에이전트는 `@멘션`만 받고 MCP로 읽음 |
| D-60 | 외부 전달 방식 | Decided | Queues, 실패 시 최대 3회 재시도, 결과 기록 |
| D-61 | 임베딩 모델 | Decided | `@cf/baai/bge-m3` (1024차원), 재순위 모델 없음 |
| D-62 | 색인 시점 | Decided | 저장 이벤트 → Queue 소비자, 바뀐 청크만 |
| D-63 | 청크 단위 | Decided | H2 섹션 단위 (긴 섹션은 약 2,000자로 분할) |
| D-64 | 사이트 제목 저장 | Decided | D1 `settings` 키-값 테이블 (`site.title`) |
| D-65 | 사이트 제목 전달 | Decided | 별도 `GET /site`(역할 확인 없음), 5분 캐시 + `localStorage` 초기값 |
| D-66 | 표시 이름 저장 | Decided | `actors.name`을 그대로 표시 이름으로 (로그인이 덮어쓰지 않음) |
| D-67 | 표시 이름을 바꾸는 사람 | Decided | 사람은 본인만(승인 대기 포함), 에이전트는 admin만 |
| D-68 | 이름 중복 | Decided | 이름을 정할 때 대소문자 무시로 중복 거절 (인덱스 없음, 기존 중복은 둠) |

---

## 상세

### D-01 · D-04 · D-17 · D-20 — Cloudflare 기반 스택
- **결정**: Workers(TypeScript) + D1 + R2, 가능한 한 무료 플랜 안에서 운영.
- **선택지**: Spring Boot(Kotlin/Java), TypeScript(Node), Go / Docker 자체 호스팅, Kubernetes.
- **이유**: 운영 비용 최소화. 소규모 팀(D-19)이라 무료 한도로 충분할 것으로 판단.
- **영향**: 백엔드는 TypeScript로 고정 → 프론트엔드와 Markdown 파서·Lint 규칙 코드를 공유할 수 있다(장점). Workers 무료 플랜 CPU 한도(10ms/요청)를 설계 제약으로 삼는다.

### D-02 — React + Vite SPA
- **선택지**: Next.js(SSR), SvelteKit.
- **이유**: UI가 에이전트와 같은 공개 API를 사용하게 되어 API 완결성이 자연스럽게 보장된다. Workers Static Assets로 함께 배포.

### D-03 — DB에 Markdown 원문 저장
- **선택지**: Git 저장소, DB + Git 동기화.
- **이유**: 트리 이동·검색·권한·동시 편집 처리가 단순하고 MVP가 가장 빠르다. Git 내보내기는 필요 시 P3.

### D-05 — 인증 & 권한
- **결정**: 사람은 Cloudflare Access(SSO), 에이전트는 앱 발급 Bearer API Token. 권한은 전역 역할(Admin/Editor/Viewer)만.
- **선택지**: GitHub OAuth, Google OAuth, 이메일+비밀번호 / Space 단위 권한.
- **이유**: 인증 코드를 앱에서 제거. 10명 이하 단일 팀이라 Space 단위 권한은 불필요.
- **구현 메모**: `/api/*`, `/mcp` 경로는 Access 정책에서 bypass하고 Worker가 토큰을 검증. 웹 요청은 `Cf-Access-Jwt-Assertion` JWT를 검증.

### D-06 — 모바일
- **결정**: 읽기 최적화 우선, 편집은 에디터/미리보기 탭 전환으로 가능. 고급 편집 기능은 데스크톱 전용.

### D-07 — 페이지 트리
- **결정**: 모든 페이지가 본문과 자식을 가질 수 있는 무제한 깊이 트리.
- **선택지**: 폴더 + 페이지(파일 시스템 방식).

### D-08 · D-22 — URL
- **결정**: `/s/{SPACEKEY}/p/{slug}-{shortId}`, slug는 한글 제목을 그대로 사용.
- **선택지**: 계층 경로, id만 / 로마자 변환, 사용자 지정 slug.
- **이유**: 읽기 쉬우면서 제목 변경·이동에도 링크가 깨지지 않음. `shortId`로 조회 후 slug가 다르면 정규 URL로 리다이렉트.

### D-09 — Lint 저장 정책
- **결정**: `error`는 저장 차단(API는 `422`), `warning`/`info`는 표시만.
- **선택지**: 경고만, Space별 설정.

### D-10 — Frontmatter
- **결정**: `type`, `status`, `owner` 필수, `tags` 선택. 편집 화면에서는 폼 UI로 제공. 제목은 frontmatter가 아닌 페이지 속성.
- **선택지**: 필수 + 텍스트 직접 작성, 선택 사항.

### D-11 — 검색 (Verify)
- **결정**: D1 FTS5 + trigram tokenizer로 제목/본문 전문 검색.
- **선택지**: FTS5 + Vectorize 시맨틱 검색을 P1에 포함.
- **S1 결과 (2026-09-27, 로컬·원격 동일)**: trigram 사용 가능. `content='pages'` external content 테이블 + INSERT/UPDATE/DELETE 트리거로 동기화, `snippet()`·`bm25()`·`rebuild` 동작.
- **확정 규칙**: 검색어 3자 이상은 FTS5 MATCH, 3자 미만은 `LIKE` 대체. 띄어쓰기가 다른 표현(`부분 환불` ↔ `부분환불`)은 P1에서 미지원.
- **참고**: D1은 `sqlite_version()` 호출을 허용하지 않는다.

### D-12 — 에이전트 연동 수단
- **결정**: REST API + Remote MCP 서버를 P1에 포함. CLI는 만들지 않음. 원본 `.md` URL / `llms.txt`는 P2 선택 사항.
- **이유**: Hermes가 MCP로 연결하므로(D-13) MCP가 P1에 필요. MCP는 REST를 감싼 얇은 계층으로 구현하여 중복을 줄인다.

### D-13 — 에이전트 쓰기 정책 / Hermes
- **결정**: 에이전트는 사람과 동일하게 자유롭게 수정. 작성자를 기록·표시. Hermes는 Nous Research Hermes Agent이며 MCP 클라이언트로 연결.
- **선택지**: 토큰별 scope(read / write-draft / write-all), draft만 생성.
- **리스크**: 버전 관리가 없어(D-21) 잘못된 수정을 되돌릴 수 없음 → 낙관적 잠금, lint, 작성자 표시로 완화.

### D-14 — Markdown 확장
- **결정**: GFM + Mermaid, Callout(`> [!NOTE]`), 위키 링크 `[[제목]]`.
- **제외**: 수식(KaTeX).

### D-15 · D-16 — 댓글, 템플릿, Import
- **결정**: 템플릿 P1(문서 유형별 필수 섹션과 짝을 이룸), 댓글 P2, Confluence/Notion Import는 하지 않음.

### D-18 — UI 언어
- **결정**: 한국어 + 영어, 처음부터 i18n 구조.

### D-19 — 규모
- **결정**: 10명 이하 단일 팀, 문서 수백 건. 무료 플랜 적합성 판단의 근거.

### D-21 — 편집 안전장치
- **결정**: 휴지통(삭제 페이지 복원)만 제공. 수정 되돌리기 없음.
- **선택지**: 직전 1개 버전 보관, 최근 N개 스냅샷, 정기 백업.
- **메모**: D1 Time Travel(시점 복원, 무료 플랜 7일)을 운영 매뉴얼에 최후 복구 수단으로 기록.

### D-23 — 위키 링크 해석
- **결정**: `[[제목]]`은 현재 Space에서 해석, 다른 Space는 `[[SPACEKEY:제목]]`. 페이지 제목은 Space 안에서 유일.
- **선택지**: 전체 Space에서 제목 유일.

### D-24 · D-25 · D-26 — 구현 스택 세부
- **결정**: Drizzle ORM, Tailwind + shadcn/ui, Hono + `@hono/zod-openapi`.
- **선택지**: Kysely, Raw SQL / Mantine, CSS Modules / OpenAPI 수기 작성, tRPC.
- **이유**: zod 스키마 하나로 검증·타입·OpenAPI·MCP 도구 입력을 모두 만든다. shadcn/ui는 컴포넌트 코드가 저장소에 있어 코딩 에이전트가 수정하기 쉽다.

### D-27 — 서버측 lint 범위 (S3 결과로 개정, 2026-09-27)
- **최초 결정**: 저장 시 blocking(error) 규칙만 서버에서 실행.
- **S3 결과**: AST 기반 파싱(remark, markdownlint)은 ~0.5ms/KB로 50KB에 50ms 이상 → 무료 플랜 불가. Clavis의 줄 단위 규칙은 100KB에 0.4ms.
- **개정 결정**: Clavis 규칙은 **AST 없이 줄 단위로만** 작성하고, 저장·`POST /lint`·MCP `lint_markdown`에서 **전부** 실행한다. 저장 응답에 warning/info도 포함한다. markdownlint 기반 서식 규칙은 **브라우저 에디터 전용**.
- **선택지**: Workers Paid($5/월)로 전체 서버 실행, 문서 크기 상한 조건부 전체 실행.
- **영향**: `LintRule`에 "AST 사용 금지" 제약이 생긴다. 규칙 추가 시 CPU 회귀를 막기 위해 벤치마크(`spikes/S2-S3-cpu`)를 CI 성능 테스트로 승격한다.

### D-28, D-31, D-32, D-33 — 아키텍처 결정 (2026-09-27 확정)
상세는 [`01-architecture.md`](./01-architecture.md) §5, §6, §10 참고.
- **D-28**: frontmatter 포함 Markdown 전체를 `pages.content`에 저장, `doc_type`·`status`·`owner`·`page_tags`는 저장 시 추출하는 파생 데이터. (대안: 메타·본문 분리 저장)
- **D-31**: 첨부는 `attachments/<파일명>` 상대 경로로 참조, 파일명은 페이지 안에서 유일. (대안: 첨부 ID 참조)
- **D-32**: 형제 순서는 fractional index 문자열, 이동 시 한 행만 갱신. (대안: 정수 순번)
- **D-33**: 본문 100KB 상한, 초과 시 413. Cloudflare 실측 100KB 저장 CPU 3.5ms. (대안: 200KB, 상한 없음)

### D-30 — 운영 백업 (S6 결과로 확정, 2026-09-27)
- **결정**: D1 Time Travel(7일) + 야간 **분할** Markdown 백업. Cron `*/2 17-18 * * *`(02:00~03:58 KST, 최대 60회)마다 다음 ~150KB 분량의 페이지를 `backup/{date}/part-NNN.tar`로 저장하고, 커서를 `state.json`에 기록, 마지막 실행에서 `meta.json` 작성. 14일 보관.
- **선택지**: 단일 실행 유지 후 모니터링, 변경분만 백업, Workers Paid.
- **이유**: 단일 실행은 500페이지에 CPU 106ms(명목 10ms)로 플랫폼 관용에 의존. 분할 시 실행당 중앙값 5.5ms, 최대 9ms.
- **용량**: 60회 × 150KB ≈ 9MB/일. 문서 약 800건(10KB 기준)까지 하룻밤에 완료. 초과 시 창을 늘리거나 유료 플랜 검토.
- **주의**: Cron 스케줄 변경은 적용까지 수 분~30분 이상 걸릴 수 있다. 실행 여부는 `state.json`과 Workers 로그로 확인.

### D-05 — 인증 구성 개정 (Phase 0 Step 3, 2026-09-27)
- **결정**: 커스텀 도메인 없이 `clavis.crawl-proxy.workers.dev`를 유지하고, **Worker 단위 Access**(one-click, All traffic)로 Worker 전체를 보호한다. 로그인은 **Access One-time PIN(이메일 코드)으로 시작하고 Google은 나중에 추가**, 허용 대상은 `@gmail.com`. Zero Trust 팀: `red-voice-3160`.
- **이메일/비밀번호 방식을 택하지 않은 이유**: 안전한 비밀번호 해시(PBKDF2 60만 회 등)는 요청당 CPU 수백 ms로 무료 플랜 10ms 한도를 넘고, 가입·재설정·세션·무차별 대입 방어가 추가로 필요하다. Access 이메일 코드는 코드 변경 없이 동작하며 Google 추가 시에도 Worker 코드는 그대로다 (`ctx.access.getIdentity()`가 로그인 방식과 무관하게 이메일을 준다).
- **에이전트**: Access **Service Token**(헤더 `CF-Access-Client-Id`/`CF-Access-Client-Secret`)으로 엣지를 통과하고, Clavis **API Token**(`Authorization: Bearer clv_…`)으로 에이전트 신원을 식별한다. 두 자격 증명이 모두 있어야 한다.
- **Worker 측**: 사람의 신원은 `ctx.access.getIdentity()`를 우선 사용하되, **실제로는 이 Worker에서 `ctx.access`가 채워지지 않았다**(S4 진단, 2026-09-27: `hasCtxAccess=false`, JWT 헤더에는 email 존재). 그래서 `Cf-Access-Jwt-Assertion` JWT를 `jose`로 검증하는 폴백을 둔다 — 서명(팀 JWKS `…/cdn-cgi/access/certs`), `iss`=`https://red-voice-3160.cloudflareaccess.com`, `aud`=Access 앱 AUD(`wrangler.jsonc` vars), 만료. email 없는 JWT(서비스 토큰)는 사람으로 인정하지 않는다. Bearer가 있으면 Access 신원보다 우선한다.
- **AUD 변경 시**: Worker의 Access를 껐다 켜거나 앱을 다시 만들면 AUD가 바뀐다 → `ACCESS_AUD`를 갱신해야 로그인이 된다.
- **선택지**: `playcoin.game` 하위 도메인 + 경로 bypass, 새 도메인 추가.
- **이유**: 도메인 없이 바로 운영 가능. Worker 단위 Access는 경로별 bypass가 없으므로 service token으로 에이전트를 통과시킨다.
- **대가**: 에이전트 자격 증명이 두 곳(Cloudflare 대시보드, Clavis)에서 관리된다.

### D-29 — 사용자 등록 (개정, 2026-09-27)
- **결정**: 최초 로그인 사용자는 Admin. 이후 새 사용자는 `pending` 역할로 생성되어 `/me` 외 모든 API가 `403 approval-pending`, 화면은 "승인 대기"만 표시. Admin이 역할을 부여해야 문서를 볼 수 있다.
- **이유**: Access가 모든 `@gmail.com` 주소를 허용하므로, 자동 Viewer는 사실상 공개와 같다.
- **구현 메모**: 최초 Admin 판정은 단일 INSERT … SELECT 문으로 처리해 동시 첫 로그인 경합을 막는다. Admin은 자기 자신의 역할을 바꿀 수 없다(잠김 방지). 에이전트는 editor/viewer만 가능.

### D-05 보충 — 운영 설정에서 얻은 교훈 (S4, 2026-09-27)
- **서비스 토큰 정책의 Action은 반드시 `Service Auth`**. `Allow`로 두면 Access가 서비스 토큰을 평가하지 않고(`service_token_status=false`) 사람 로그인을 요구한다. Worker 화면에서 만든 `clavis - Cloudflare Workers` 앱에서도 Service Auth 정책은 정상 동작한다 — 경로별 앱 분리는 필요 없었다.
- **자격 증명 파일은 쉘로 source하지 않는다**. `KEY= value`처럼 공백이 있으면 값이 명령으로 실행되어 오류 메시지에 노출된다. `scripts/agent-env.py`로 읽는다 (공백·따옴표·`CF-Access-Client-Id:` 접두어 허용). 이 문제로 서비스 토큰 시크릿이 한 번 노출되어 교체했다.
- `ACCESS_AUD`는 쉼표로 여러 AUD를 받을 수 있다 (앱을 추가할 경우 대비).

### D-34 ~ D-43 — Phase 1 결정 (2026-09-27 확정)
- [`03-phase1-plan.md`](./03-phase1-plan.md) §8의 추천안을 모두 채택했다.
- **D-34**: Space는 보관만 한다. 보관된 Space는 목록에서 숨기고 읽기 전용이다. key는 URL·위키 링크의 일부이므로 생성 후 바꿀 수 없다.
- **D-36**: 휴지통 영구 삭제는 Cron을 추가하지 않고 백업 Cron 창에서 처리한다 (계정당 Cron 5개 제한). 구현 시 "첫 실행"이 아니라 매 실행 앞부분에서 최대 50페이지씩 지우도록 했다 — 대상이 없으면 D1 조회 1회뿐이고, 한 번에 많을 때도 CPU·서브리퀘스트 한도를 넘지 않는다.
- **D-38**: 10명 이하 팀에서는 PR별 미리보기 환경(별도 D1, Access 설정)의 비용이 효과보다 크다.
- **D-41**: 에이전트가 읽는 API 메시지는 영어로 고정하고, 사람 UI는 `ruleId`와 `params`로 번역한다. `01-architecture.md` §7의 Accept-Language 방식을 대체한다.

### D-42 — 제목 변경 시 위키 링크 (개정, 2026-09-27)
- **결정**: 페이지 제목을 바꾸면 그 페이지를 링크하는 다른 문서의 `[[옛 제목]]`을 `[[새 제목]]`으로 **자동 수정**한다. 별칭(`[[옛 제목|별칭]]`)과 `KEY:` 접두사는 유지하고, 다른 Space에서는 `[[KEY:옛 제목]]`만 고친다(D-23). 코드 블록과 인라인 코드 안은 건드리지 않는다.
- **이유**: 실제 사용 테스트에서 제목을 바꾸면 링크가 깨지는 것이 불편했다(사용자 요청). 위키 링크를 저장할 때마다 `page_links`에 기록하므로 고칠 페이지를 바로 찾을 수 있다.
- **방식**: 이름을 바꾸는 저장 요청 하나 안에서 처리한다. 참조 페이지 본문을 Worker가 읽어 정확히 고치므로 CPU(10ms)를 위해 **한 번에 50페이지·합계 200KB까지**로 제한하고, 넘는 페이지·보관된 Space의 페이지·그사이 다른 사람이 저장한 페이지는 예전처럼 깨진 링크로 남긴다(저장 응답 `linksToOldTitle`). 고친 페이지는 revision이 올라가고 제목을 바꾼 사람이 수정자로 기록된다. D1 쿼리 수 제한(요청당 50) 때문에 페이지 수와 상관없이 문장 3개(`json_each`)로 처리한다.
- **선택지**: 편집 화면에서 선택(체크박스) / 수정 안 함(원래 D-42) / D1 SQL `replace()`만(CPU는 들지 않지만 코드 블록 안도 바뀜).

### D-44 ~ D-53 — Phase 2 결정 (2026-09-27 확정)
- [`04-phase2-plan.md`](./04-phase2-plan.md) §8의 추천안을 모두 채택했다.
- **D-46**: 대시보드를 열 때마다 Space 전체를 검사하면 요청당 CPU 10ms를 넘는다. 저장 시점의 결과를 쓰고, 설정이 바뀌면 백업(D-30)처럼 cursor로 나눠 재검사한다. `wiki-link-exists`는 다른 페이지 변화로 결과가 바뀌므로 요약 대신 `page_links`를 본다.
- **D-47**: `type`·`status` 컬럼이 frontmatter에서 나오므로 `frontmatter-required`는 끌 수 없다. 규칙을 `error`로 올리면 기존 페이지는 그대로 두고 다음 저장 때 막는다.
- **D-48**: 에이전트가 문서 일부만 고칠 때 관련 없는 수정 때문에 409가 나지 않도록 한다. 해시가 다르면 409와 최신 섹션 내용을 돌려준다.

### D-54 ~ D-63 — Phase 3 결정 (2026-09-28 확정)
- [`05-phase3-plan.md`](./05-phase3-plan.md) §8의 추천안을 모두 채택했다.
- **D-54**: D-21(휴지통만)을 뒤집는다. 에이전트(Adam)가 실제로 문서를 쓰기 시작하면서 "잘못된 수정을 되돌릴 수 없다"(컨셉 §15)는 리스크가 현실이 됐다. 본문은 R2에 두어 D1 500MB를 쓰지 않고, 버전 메타는 저장 쓰기 batch의 문장 하나라 D1 호출 수가 늘지 않는다. 야간 백업(D-30)은 운영용 전체 복구 수단으로 그대로 둔다.
- **D-58**: Cloudflare Email Service는 무료 플랜에서 계정의 확인된 주소로만 보낼 수 있다(임의 수신자는 유료). 필요해지면 유료 전환과 함께 다시 본다.
- **D-60 · D-62**: `ctx.waitUntil` 안의 CPU도 같은 요청의 10ms에 포함된다. 그래서 CPU가 드는 뒤처리(색인, Webhook)는 Queues 소비자(별도 실행, 각자 10ms)로 넘긴다. Queues는 무료 플랜에서 하루 10,000작업, 보관 24시간.
- **D-61 · D-63**: Vectorize 무료 저장량(500만 차원 = 1024차원 벡터 약 4,880개)이 가장 빠듯하다. H2 단위 청크로 벡터 수를 억제하고 80%를 넘으면 경고한다. Workers AI에 한국어를 지원하는 reranker가 없어(`bge-reranker-base`는 영어·중국어) 전문 검색과 RRF로 합친다.

### D-64 ~ D-68 — 사이트 제목·표시 이름 결정 (2026-09-30 확정)
- [`06-site-title-display-name-plan.md`](./06-site-title-display-name-plan.md) §7의 추천안을 모두 채택했다.
- **D-65**: 헤더는 승인 대기·로그아웃 상태에서도 보이므로(`AuthGate`가 `AppShell` 안) 제목 조회에 역할 확인을 두지 않는다. `/me`에 합치지 않은 것은 actor 응답에 설치 정보를 섞지 않기 위해서다.
- **D-66**: 모든 조회가 이미 `actors.name`을 조인한다. 새 컬럼을 두면 조회 10여 곳을 고쳐야 한다.
- **D-68**: 공백 없는 `@이름` 멘션이 `lower(name)`으로 찾으므로 이름이 같으면 둘 다 알림을 받는다. 이메일 앞부분에서 온 기존 이름이 이미 겹칠 수 있어 유니크 인덱스(마이그레이션 실패 위험) 대신 조건부 INSERT·UPDATE 한 문장으로 검사한다.
