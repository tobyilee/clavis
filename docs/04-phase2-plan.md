# Clavis — Phase 2 계획 (팀 생산성 & AI 연동 강화)

> 상태: **In Progress** · 작성일: 2026-09-27 · 결정 확정: 2026-09-27 (§8 추천안 전부 채택)
> 선행 문서: [`00-concept.md`](./00-concept.md) §14 · [`01-architecture.md`](./01-architecture.md) · [`03-phase1-plan.md`](./03-phase1-plan.md) · [`decisions.md`](./decisions.md)

---

## 1. 목표

Phase 1로 "읽고 쓸 수 있는 위키"가 됐다. Phase 2는 **여러 사람과 에이전트가 같은 문서를 계속 가꾸는 위키**를 목표로 한다.

- **문서 품질을 한눈에**: 어떤 문서가 깨진 링크나 규칙 위반을 안고 있는지 Space 단위로 보고, 팀에 맞게 규칙을 조정한다.
- **에이전트가 작게, 안전하게 고친다**: 100KB 문서 전체가 아니라 섹션 하나를 읽고 고친다. 사람이 다른 섹션을 편집해도 충돌하지 않는다.
- **대화는 문서 옆에서**: 사람과 에이전트가 페이지에 댓글로 검토 의견을 남기고 해결한다.
- **다시 찾기 쉽게**: 즐겨찾기, 최근 본 문서, 최근 변경(사람 🧑 / 에이전트 🤖)을 홈에서 본다.

## 2. 완료 조건 (Exit Criteria)

- [ ] 페이지 보기에서 **백링크**(이 페이지를 링크하는 문서)를 보고, Space **대시보드**에서 깨진 링크와 lint 위반 페이지 목록을 보고 해당 줄로 이동할 수 있다
- [ ] Space별 **lint 설정**(규칙 심각도, 필수 섹션, 문서 길이)을 바꾸면 편집기, 저장 API, MCP 결과에 똑같이 반영되고, 대시보드에서 재검사할 수 있다
- [ ] **커스텀 템플릿**을 만들어 UI의 새 페이지 화면과 MCP `create_page(template)`에서 쓸 수 있다
- [ ] Hermes가 MCP만으로 **섹션 하나를 읽고 교체하거나 끝에 추가**한다. 그사이 사람이 다른 섹션을 저장해도 충돌 없이 둘 다 남는다
- [ ] 사람과 에이전트가 **댓글과 답글을 달고 해결 처리**하며, 에이전트가 미해결 댓글을 읽고 문서에 반영할 수 있다
- [ ] 홈 화면에 즐겨찾기, 최근 본 문서, 최근 변경, 내 문서의 새 댓글이 나온다
- [ ] 페이지를 원본 Markdown으로 열거나(`.md` URL) "AI용 복사"로 붙여넣을 수 있다
- [ ] 모바일 폭(375px)에서 서식 툴바로 헤딩, 목록, 체크박스, 링크를 넣고, 사진을 찍어 첨부하고 저장할 수 있다
- [ ] 운영 환경 실측: 새로 추가된 요청(섹션 저장 100KB, 재검사 1회, 대시보드, 댓글, 홈)의 CPU가 모두 **10ms 미만**이다
- [ ] `01-architecture.md`와 가이드 문서가 구현과 일치한다

## 3. 범위

### 포함 (P2)
| 영역 | 내용 |
|---|---|
| 링크 | 백링크 목록, Space 깨진 링크 리포트 |
| 품질 | 페이지별 lint 요약 저장, Space lint 대시보드, 나눠서 재검사 |
| 규칙 설정 | Space별 규칙 심각도·필수 섹션·문서 길이 한도, 설정 화면 |
| 템플릿 | 커스텀 템플릿 CRUD(Space별 + 전역), 기존 문서 유형에 연결 |
| 에이전트 | 섹션 단위 읽기·교체·추가 API와 MCP 도구, 속성(status·owner·tags)만 바꾸는 API, 댓글 MCP 도구 |
| 댓글 | 페이지 스레드(답글 1단계), 섹션(헤딩) 연결 선택, 해결·다시 열기, Markdown 본문 |
| 개인화 | 즐겨찾기, 최근 본 문서, 최근 변경, 내 문서의 새 댓글 → 홈 화면 |
| AI 접근 | `.md` 원본 URL, "AI용 복사" 버튼, Space별 `llms.txt` |
| 모바일 | 키보드 위 서식 툴바, 카메라·사진 첨부, 저장 흐름 정리 (U2 불편 목록으로 조정) |

### 제외 (P3 이후)
알림(이메일·Slack·Webhook)과 Watch, `@멘션` 알림, 텍스트 선택 인라인 댓글, 버전 히스토리·diff, 사용자 정의 문서 유형(type), 시맨틱 검색, PR별 Preview 배포(D-38 유지), 동시 편집 표시(D-43 유지)

## 4. 진행 순서

**기존 데이터로 바로 되는 것부터**, 새 테이블이 필요한 것은 그 뒤에 쌓는다. Step 1~2는 에이전트 흐름을 먼저 개선하므로 Hermes 피드백을 일찍 받을 수 있다.

```
Step 0        Step 1              Step 2            Step 3          Step 4               Step 5             Step 6          Step 7
정비           링크·품질             섹션 편집           댓글             규칙 설정·템플릿        홈·AI 접근           모바일 편집       마무리
──────        ──────────          ─────────         ──────          ─────────────        ──────────         ─────────       ──────
A0 마이그 계획  L1 백링크 API·UI      S1 섹션 파서        C1 댓글 API      R1 lint 설정 엔진       P1 즐겨찾기          K1 서식 툴바      Z1 E2E 추가
A1 lint 설정   L2 깨진 링크 리포트     S2 섹션 REST       C2 댓글 MCP      R2 설정 API·화면        P2 최근 본·최근 변경    K2 사진 첨부      Z2 CPU 실측
   인터페이스   L3 lint 요약 저장      S3 속성 PATCH      C3 댓글 UI       R3 설정 변경 → 재검사    P3 홈 화면           K3 저장·속성 흐름  Z3 문서 갱신
              L4 재검사(청크)        S4 MCP 도구                         T1 템플릿 API·MCP      P4 .md·AI용 복사                     Z4 Exit 점검
              L5 대시보드 UI         S5 M-check(Hermes)                  T2 템플릿 관리 화면      P5 llms.txt
```

- 각 Step은 커밋 단위로 나누고, Step이 끝날 때마다 `main`에 push해 운영 환경에서 확인한다 (Phase 1과 같음).
- Step 3(댓글)과 Step 5(홈)는 서로 독립이라 순서를 바꿔도 된다. Step 4는 Step 1의 재검사(L4)를 재사용한다.

## 5. 작업 상세

### Step 0 — 정비 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| A0 | 마이그레이션 계획 | `0004_lint_summary`, `0005_comments`, `0006_space_settings_templates`, `0007_favorites_views`를 Step별로 나눠 추가. 이미 있는 페이지는 요약이 없는 상태(`NULL`)로 시작 |
| A1 | lint 설정 인터페이스 | `lint(doc, { config })`: 규칙별 심각도 덮어쓰기, 필수 섹션 목록, 문서 길이 한도를 받는다. 설정이 없으면 지금과 같은 결과인지 회귀 테스트. `frontmatter-required`는 조정 불가(D-47) |

### Step 1 — 링크·품질 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| L1 | 백링크 | `GET /pages/{id}/backlinks` (다른 Space 포함, 휴지통 제외, `page_links_to` 인덱스로 쿼리 1개). 페이지 보기 하단에 목록, MCP `read_page` 결과에 백링크 수 |
| L2 | 깨진 링크 리포트 | `GET /spaces/{key}/broken-links`: `to_page_id IS NULL`인 링크를 페이지별로 묶어 반환. 이 링크 목록은 저장 시점이 아니라 **지금** 상태라 항상 정확하다 |
| L3 | lint 요약 저장 | 저장 쓰기 batch에 `page_lint`(페이지당 1행: error·warning·info 수, 위반 `ruleId`와 줄 목록, 설정 버전, 검사 시각) upsert 추가. 저장 파이프라인의 D1 호출 수는 그대로 2회 |
| L4 | 재검사(청크) | `POST /spaces/{key}/lint/recheck?cursor=`: 요약이 없거나 설정 버전이 옛날인 페이지를 **본문 합계 150KB까지** 검사해 저장하고 다음 cursor를 반환. 대시보드가 끝날 때까지 반복 호출(백업 D-30과 같은 방식). 기존 페이지 초기 채우기에도 사용 |
| L5 | 대시보드 UI | `/s/$key/health`: 요약(위반 페이지 수, 깨진 링크 수, 재검사 필요 수), 규칙별·페이지별 목록, 클릭 시 편집 화면의 해당 줄. 사이드바에 진입점 |

- 위키 링크 규칙(`wiki-link-exists`)은 다른 페이지가 생기거나 지워지면 결과가 바뀐다. 그래서 대시보드는 링크 문제를 `page_lint`가 아니라 L2의 현재 상태로 보여 준다.

### Step 2 — 섹션 편집 🤝 (Hermes 검증은 사용자)

| ID | 작업 | 완료 기준 |
|---|---|---|
| S1 | 섹션 파서 | `shared/markdown/sections`: 기존 `scanLines` 결과(코드 블록 안 헤딩 제외)로 섹션 트리를 만든다. 섹션 = 헤딩부터 같거나 높은 레벨의 다음 헤딩 전까지. 식별자는 페이지 TOC 앵커와 같은 slug(중복 시 `-1`), 섹션 해시 포함 |
| S2 | 섹션 REST | `GET /pages/{id}/sections`(목차: id, 레벨, 제목, 줄 범위, 해시), `GET /pages/{id}/sections/{sectionId}`, `PUT …/sections/{sectionId}`(`mode: replace \| append`, `baseSectionHash` 또는 `baseRevision`). 교체 후 문서 전체가 일반 저장 파이프라인(lint, 링크, 409 가드)을 그대로 거친다 |
| S3 | 속성 PATCH | `PATCH /pages/{id}/meta`: status·owner·tags만 바꾼다. 서버가 frontmatter YAML을 고쳐 저장하고, 본문은 그대로 둔다 |
| S4 | MCP 도구 | `list_sections`, `read_section`, `update_section`(replace/append), `set_page_meta`. 충돌하면 "최신 섹션 내용 + 다시 시도" 안내 텍스트를 반환. instructions에 "큰 문서는 섹션 단위로" 추가 |
| S5 | Hermes 검증 | Hermes가 회의록의 `## 액션 아이템`에 항목을 추가하는 동안 사람이 `## 논의 내용`을 저장해도 둘 다 남는다 (D-48) |

### Step 3 — 댓글 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| C1 | 댓글 API | `comments` 테이블(페이지, 루트 댓글, 작성자, Markdown 본문 ≤ 10KB, 섹션 id(선택), 해결 시각·해결자, 수정·삭제 시각). `GET/POST /pages/{id}/comments`, `PATCH/DELETE /comments/{id}`, `POST /comments/{id}/resolve \| reopen`. 페이지가 휴지통에 가면 함께 숨고, 영구 삭제 시 함께 지운다 |
| C2 | 댓글 MCP | `list_comments`(기본은 미해결만), `add_comment`(답글 포함), `resolve_comment`. `read_page` 결과에 미해결 댓글 수 |
| C3 | 댓글 UI | 페이지 하단 스레드 목록(해결된 스레드는 접기), 헤딩 옆 댓글 수 배지 → 해당 섹션 스레드, 작성자 🧑/🤖 표시, 댓글 본문 Markdown 렌더링(기존 렌더러, 위키 링크 가능) |

### Step 4 — 규칙 설정·템플릿 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| R1 | lint 설정 엔진 | `spaces.lint_config`(JSON)와 `lint_config_version`. 저장 읽기 batch가 이미 Space 행을 읽으므로 D1 호출은 늘지 않는다. 에디터는 Space 조회 결과로 같은 설정을 쓴다 |
| R2 | 설정 API·화면 | `GET/PUT /spaces/{key}/lint-config` (admin). 화면: 규칙별 심각도 선택(off·info·warning·error), 유형별 필수 섹션 편집, 문서 길이 한도. "이 설정이면 위반이 생기는 페이지 N개" 미리보기는 저장 후 재검사로 대신한다 |
| R3 | 설정 변경 → 재검사 | 설정 버전이 바뀌면 대시보드가 "재검사 필요"를 보여 주고 L4를 반복 호출한다. 규칙을 `error`로 올려도 이미 있는 페이지는 지워지지 않고, 다음 저장 때 고치도록 막힌다(설정 화면에 경고) |
| T1 | 템플릿 API·MCP | `templates` 테이블(Space별, 또는 전역 = `space_id NULL`, 이름, 설명, 유형, 본문). 기본 7종은 코드에 두고 목록에 함께 보여 준다. 템플릿 저장 시 그 Space 규칙으로 lint(error면 거부). `GET /templates?space=`, `POST/PUT/DELETE`, MCP `list_templates`와 `create_page(template)` 확장 |
| T2 | 템플릿 관리 화면 | Space 설정의 "템플릿" 탭: 목록, 편집(기존 에디터 재사용), 새 페이지 화면에서 커스텀 템플릿 선택 |

### Step 5 — 홈·AI 접근 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| P1 | 즐겨찾기 | `favorites(actor, page)`, 별 버튼(페이지 보기, 트리 메뉴), 사이드바 상단 즐겨찾기 목록 |
| P2 | 최근 본·최근 변경 | 페이지 조회 시 `ctx.waitUntil`로 `page_views` upsert(응답 지연 없음, 사람별 최근 50개 유지, D-50). 최근 변경은 `pages.updated_at` 인덱스로 조회(새 테이블 없음), 🧑/🤖 필터 |
| P3 | 홈 화면 | `/`: 즐겨찾기, 최근 본 문서, 최근 변경(팀 전체), **내가 담당·작성한 문서의 미해결 댓글**. `GET /me/home` 쿼리 batch 1회 |
| P4 | `.md`·AI용 복사 | `/s/{KEY}/p/{slugId}.md` → `text/markdown` 원문(frontmatter 포함). 페이지 메뉴의 "AI용 복사": 제목, URL, 원문을 클립보드에 |
| P5 | `llms.txt` | `/s/{KEY}/llms.txt`: Space 설명과 페이지 목록(제목, 유형, 상태, `.md` 링크). 트리 캐시(`tree_json`)로 만들어 CPU가 거의 들지 않는다 (D-51) |

### Step 6 — 모바일 편집 🤝 (불편 목록은 사용자)

| ID | 작업 | 완료 기준 |
|---|---|---|
| K1 | 서식 툴바 | 모바일에서 키보드 위에 고정: 헤딩, 굵게, 목록, 체크박스, 링크, `[[` 위키 링크, 코드. 선택 영역 감싸기 |
| K2 | 사진 첨부 | 툴바의 카메라 버튼(`accept="image/*" capture`) → 기존 업로드 흐름. 큰 사진은 브라우저에서 긴 변 2000px로 줄여 올린다 |
| K3 | 저장·속성 흐름 | 저장 버튼 위치 고정, 속성(frontmatter) 편집을 아래 시트로, lint 문제 수 배지 → 시트. U2 목록에 따라 조정 |

### Step 7 — 마무리 🤝

| ID | 작업 | 완료 기준 |
|---|---|---|
| Z1 | E2E 추가 | 댓글 작성·해결, 섹션 추가(REST), 대시보드 → 문제 줄 이동, 모바일 툴바. CI check에 포함, 전체 6~8개 유지 |
| Z2 | CPU 실측 | Phase 1 H2와 같은 방식(`wrangler tail`, 워밍업 후 5~10회). 섹션 저장(100KB), 재검사 1회, 대시보드, 댓글 목록, 홈, 백링크 → §9에 기록 |
| Z3 | 문서 갱신 | `01-architecture.md` v0.4(스키마, API, MCP 도구, 화면), `guides/agent-connection.md`(섹션·댓글 도구), `guides/writing.md`(댓글·대시보드·설정) |
| Z4 | Exit 점검 | §2 체크리스트 확인, 사용자와 실제 문서로 한 번 써 보기 |

## 6. 역할 분담

| 표시 | 의미 |
|---|---|
| 🤖 | Claude가 진행 |
| 👤 | 사용자 작업 |
| 🤝 | 사용자 확인 후 Claude가 진행 |

| # | 사용자 작업 | 시점 |
|---|---|---|
| U1 | §8 결정 사항 검토 | 시작 전 |
| U2 | 휴대폰으로 편집할 때 불편했던 점 목록 (Step 6 범위 조정) | Step 5 전까지 |
| U3 | Hermes로 섹션 추가·댓글 확인 시나리오 실행 (S5, C2) | Step 2·3 후 |
| U4 | 팀 규칙에 맞게 lint 설정과 커스텀 템플릿 1~2개 만들어 보기 | Step 4 후 |

## 7. 무료 플랜 예산 (요청 1회 기준)

| 요청 | D1·R2 호출(서브리퀘스트) | CPU 목표 | 비고 |
|---|---|---|---|
| 페이지 저장 (lint 요약 포함) | 2 (그대로) | < 8ms (100KB) | 요약 upsert는 쓰기 batch 안의 문장 1개 |
| 섹션 읽기 | 1 | < 3ms (100KB) | 줄 스캔만, 파싱 결과 공유 |
| 섹션 저장 | 2 | < 9ms (100KB) | 섹션 교체 + 일반 저장. **가장 빠듯한 요청**, Z2에서 우선 측정 |
| 재검사 1회 | 2 (읽기 1 + 쓰기 1) | < 8ms | 본문 합계 150KB까지, 부족하면 줄인다 |
| 대시보드 / 깨진 링크 | 1 | < 3ms | 요약 테이블만 조회, 본문 안 읽음 |
| 백링크 | 1 | < 2ms | |
| 댓글 목록·작성 | 1 | < 3ms | 렌더링은 브라우저 |
| 홈 | 1 (batch) | < 3ms | |
| 페이지 조회 + 최근 본 기록 | 1 + 1(`waitUntil`) | < 2ms | 기록은 응답 뒤에 처리 |
| `.md`·`llms.txt` | 1 | < 2ms | `llms.txt`는 트리 캐시 재사용 |

- D1 쓰기가 늘어난다(조회마다 최근 본 기록). 10명 기준 하루 수천 건으로, 무료 한도 100k/일에 비해 작다.
- 요청당 D1 쿼리 50개 제한: 재검사의 요약 저장은 Phase 1처럼 `json_each(?)` 한 문장으로 쓴다.

## 8. 결정 사항

아래 추천안을 모두 채택했다 (2026-09-27, [`decisions.md`](./decisions.md) D-44~D-53).

| ID | 주제 | 추천안 | 대안 |
|---|---|---|---|
| D-44 | 댓글 형태 | **페이지 스레드 + 답글 1단계**, 선택적으로 섹션(헤딩)에 연결, 해결·다시 열기 | 텍스트 선택 인라인 댓글(편집하면 위치 유지가 어려움) / 답글 없는 평면 목록 |
| D-45 | 댓글 권한 | **viewer도 댓글 작성 가능**(검토 역할). 수정은 작성자 본인, 삭제는 작성자와 admin, 해결은 editor 이상 | 댓글은 editor 이상만 |
| D-46 | lint 대시보드 방식 | **저장할 때 페이지별 요약 저장** + 설정이 바뀌거나 요약이 없으면 **150KB 단위 재검사를 대시보드에서 반복 호출**. 링크 문제는 `page_links`의 현재 상태로 표시 | 대시보드를 열 때마다 브라우저가 모든 본문을 받아 검사(데이터가 많고 느림) / Cron으로 재검사(실행당 CPU 10ms라 느리게 진행) |
| D-47 | Space lint 설정 범위 | **규칙 심각도(off·info·warning·error), 유형별 필수 섹션, 문서 길이 한도**. `frontmatter-required`는 error 고정(유형·상태 컬럼이 frontmatter에서 나오므로). admin만 변경 | 규칙 on/off만 / 사용자 정의 규칙(정규식) 추가 |
| D-48 | 섹션 편집의 충돌 판정 | **섹션 해시**: 읽은 섹션이 그대로면 다른 섹션이 바뀌었어도 저장한다. `baseRevision`을 주면 기존처럼 엄격하게 판정 | 항상 `baseRevision`(다른 섹션이 바뀌어도 409) |
| D-49 | 커스텀 템플릿 범위 | **Space별 + 전역(admin)**, 기존 7개 유형 중 하나에 연결. 템플릿도 그 Space 규칙으로 lint | 사용자 정의 유형(type) 추가 허용 → P3 |
| D-50 | 최근 본 문서 저장 위치 | **서버**(`page_views`, `waitUntil`로 기록, 사람별 50개): 휴대폰과 PC에서 같은 목록 | 브라우저 localStorage(쓰기 0, 기기마다 다름) |
| D-51 | `.md` URL·`llms.txt` | **둘 다 포함**. 비용이 거의 없고 사람이 AI 채팅에 붙여넣기 쉽다. Access 뒤에 있으므로 외부에는 공개되지 않는다(에이전트는 서비스 토큰 필요) | `.md`와 AI용 복사만 / 제외 |
| D-52 | 댓글 알림 | **알림 없음**. 홈의 "내 문서의 미해결 댓글"과 페이지 배지로 대신한다. 이메일·Slack은 P3 | 이메일 알림(무료 플랜에서 발송 수단을 따로 마련해야 함) |
| D-53 | 에이전트의 댓글 사용 | **읽기·작성·해결 모두 허용**, 작성자는 🤖로 표시. instructions에 "사람이 남긴 미해결 댓글을 반영하면 답글을 달고 해결" 흐름 안내 | 에이전트는 읽기만 |

## 9. 결과 기록

| 항목 | 상태 | 결과 | 날짜 |
|---|---|---|---|
| Step 0 | ✅ 완료 | `LintConfigSchema`(규칙별 off·info·warning·error, 유형별 필수 섹션, 문서 길이 한도, `frontmatter-required`는 조정 불가), `lint(doc, { config })`에서 엔진이 심각도를 적용 — `error`로 올린 규칙은 서버·에디터에서 똑같이 저장을 막는다. 규칙의 `blocking` 플래그는 실제 심각도로 대체해 제거. 설정이 없으면 기존과 같은 결과(회귀 테스트). 마이그레이션은 각 Step에서 추가 | 2026-09-27 |
| Step 1 | ✅ 완료 | `0004_lint_summary`(`page_lint`, `spaces.lint_config`·`lint_config_version`). 저장 쓰기 batch에 요약 upsert 추가(D1 호출 2회 그대로), 요약은 `{규칙: 심각도·개수·첫 줄}`만 저장하고 위키 링크 규칙은 제외. 저장·`/lint`가 Space 설정을 읽어 적용. `GET /pages/{ref}/backlinks`, `GET /spaces/{key}/health`(요약·규칙별 집계는 D1 `json_each`, 깨진 링크는 `page_links` 현재 상태 — 계획의 별도 broken-links 엔드포인트 대신 여기에 포함), `POST /spaces/{key}/lint/recheck`(cursor 없이 '요약 없음 또는 옛 설정 버전' 조건으로 다음 묶음 선택, **예산은 150KB → 100KB로 낮춤**, 그사이 저장된 페이지는 revision 조건으로 건너뜀). MCP `get_backlinks`·`get_space_health`. 웹: 페이지 하단 백링크, `/s/$key/health` 대시보드(열면 자동 재검사, 위반 클릭 → 편집 화면 `?line=N`), 사이드바 '문서 상태'. Worker 테스트 80개, E2E에 대시보드 시나리오 추가(5개) | 2026-09-27 |
| Step 2 | ✅ 완료 (S5 대기) | `shared/markdown/sections`: 섹션 = 헤딩부터 같거나 높은 레벨의 다음 헤딩 전까지(하위 섹션 포함), id는 github-slugger로 렌더링된 TOC 앵커와 동일(웹 렌더러와 비교 테스트), 해시는 FNV-1a. 섹션은 id 또는 헤딩 텍스트로 찾고, 같은 제목이 여럿이면 409로 id 목록 안내. `replace`는 첫 줄이 같은 레벨 헤딩이면 헤딩도 교체, `append`는 목록·표는 이어 붙이고 문단은 빈 줄로 구분. REST `GET /pages/{ref}/sections[/{section}]`, `PUT …/sections/{section}`, `PATCH /pages/{ref}/meta`(frontmatter 주석·키 순서 유지 — 웹의 `updateFrontmatter`를 shared로 이동). 서버는 읽고 → 고치고 → 일반 저장 파이프라인으로 저장하며, revision을 고정하지 않았으면 경합 시 한 번 다시 적용(섹션 해시가 계속 보호). base 없는 `replace`는 400. MCP `list_sections`·`read_section`·`update_section`·`set_page_meta`, instructions에 섹션 우선 안내. Worker 테스트 90개. **S5(Hermes 실사용)는 배포 후 사용자 진행** | 2026-09-27 |
| Step 3 | ✅ 완료 | `0005_comments`(스레드 = 루트 + 답글 1단계, 루트에 섹션 id·해결 정보, 열린 스레드 부분 인덱스). 답글이 있는 루트는 삭제 대신 해결(409 `has-replies`)로 정해 삭제는 행 삭제만 — 계획의 `deleted_at` 불필요. 페이지가 휴지통에 가면 숨고 복원되면 돌아오며, 영구 삭제 때 함께 삭제. REST `GET/POST /pages/{ref}/comments`, `PATCH/DELETE /comments/{id}`, `POST /comments/{id}/resolve \| reopen`(스레드의 어느 댓글 id든 가능). 권한은 D-45대로(viewer 작성, 작성자 수정, 작성자·admin 삭제, editor 해결). MCP `list_comments`·`add_comment`(viewer도)·`resolve_comment`, `read_page` 헤더에 `open_comments=N`, instructions에 반영 흐름(D-53). 웹: 페이지 하단 스레드(해결된 것은 접기, Markdown 렌더링, 섹션 선택, 답글·수정·삭제·해결), 헤딩 옆 열린 댓글 배지(렌더러 h2/h3 컴포넌트 + context) → 스레드로 스크롤. Worker 테스트 96개, E2E 6개 | 2026-09-27 |
| Step 4 | ✅ 완료 | Space 응답에 `lintConfig`·`lintConfigVersion`, `PUT /spaces/{key}/lint-config`(admin, 저장하면 버전이 올라 대시보드가 재검사). 에디터도 같은 설정으로 검사하고 '필수 섹션 추가'도 Space 목록을 씀. `0006_templates` + `GET/POST/PUT/DELETE /templates`: 커스텀 템플릿이 먼저, 기본 7종은 Space의 필수 섹션으로 렌더링. 커스텀 템플릿은 `{{title}}`·`{{owner}}`·`{{date}}`를 채운 샘플로 그 Space 규칙 lint(error면 422) — 그래서 frontmatter에 `owner: {{owner}}`를 그대로 쓸 수 있음. 전역 템플릿은 admin, Space 템플릿은 editor. `create_page`의 `template`은 문서 유형 또는 템플릿 id(다른 Space 템플릿은 400). MCP `list_templates(space)`. 웹: `/s/$key/settings`(문서 규칙·템플릿 탭, viewer·editor는 규칙 읽기 전용), 새 페이지 화면이 서버 템플릿 목록 사용. **추가 수정**: E2E가 늘자 사람 계정이 분당 120회 한도에 걸려 화면이 비는 문제를 발견 — 사람은 별도 한도 600회/분(`HUMAN_RATE_LIMITER`), 에이전트는 120회 유지, 429면 안내와 '다시 시도'. Worker 테스트 103개, E2E 7개(3회 연속 통과) | 2026-09-28 |
| Step 5 | ✅ 완료 | `0007_home`(`favorites`, `page_views`, `pages_updated` 부분 인덱스). 즐겨찾기 `PUT/DELETE /pages/{ref}/favorite`, `GET /me/favorites`. 사람이 페이지를 읽으면 응답 뒤(`waitUntil`) 조회 기록, 사람별 최신 50개만 유지 — 에이전트는 기록하지 않음(D-50). `GET /me/home`(D1 1회): 즐겨찾기, 최근 본 문서, 최근 변경(🧑/🤖 필터), 내가 담당·작성한 문서의 열린 댓글(D-52). `.md` 원본(`/s/{KEY}/p/{slugId}.md`, `X-Clavis-Revision`), `/s/{KEY}/llms.txt`(트리 캐시로 생성, 링크는 `.md`), `/llms.txt`(Space 목록) — `run_worker_first`에 `/s/*.md`·`/s/*/llms.txt`·`/llms.txt`를 추가하고 `wrangler dev` E2E로 실제 라우팅 확인. 웹: 홈 대시보드, 페이지 별표(viewer도), 사이드바 즐겨찾기, 페이지 메뉴의 'AI용 복사'(제목·URL·원문)와 '원본 Markdown 열기' — 페이지 메뉴는 이제 viewer에게도 보이고 편집 항목만 editor 전용. Worker 테스트 109개, E2E 8개 | 2026-09-28 |
| Step 6 | ✅ 완료 (실기기 확인 대기) | U2로 받은 불편: 아이폰에서 편집 화면이 폰보다 넓어져 저장 버튼이 안 보임 → 원인은 레이아웃이 아니라 iOS Safari가 16px 미만 입력칸을 누르면 확대하고 되돌리지 않는 동작(에디터 14px, 태그 입력 12px). 터치 화면에서는 에디터·입력칸을 16px로(`pointer-coarse`, 데스크톱은 14px 유지), 먼저 `c8c470f`로 배포. **K3**: 폰(768px 미만)에서 편집 화면이 앱을 덮고 `visualViewport`(키보드 위 보이는 영역)에 맞춰 고정 — iOS는 키보드가 떠도 `100dvh`·fixed 요소가 줄지 않고 캐럿을 보이려고 페이지를 스크롤하므로, `--vv-top`·`--vv-height`를 `<html>`에 두고 따라간다. 제목·저장은 항상 위, 툴바는 키보드 바로 위. 속성 폼과 lint 문제 목록은 탭 줄의 '속성'·문제 수 배지 → 아래 시트(시트도 키보드 위로 올라옴, 문제를 누르면 그 줄로 이동). CodeMirror 툴팁(자동완성·lint)은 에디터 영역 안에서만 열려 툴바를 가리거나 키보드 뒤로 가지 않는다. **K1**: 헤딩(##→###→해제, 목록 줄은 헤딩으로 바뀜)·굵게·목록·체크박스·링크·`[[`(자동완성 열림)·코드(여러 줄이면 펜스). 선택 영역을 감싸고 다시 누르면 풀림, 누를 때 에디터 포커스(키보드)를 유지. **K2**: 사진 버튼은 `accept="image/*"`만 — 계획의 `capture`는 카메라만 열어 사진 보관함을 고를 수 없으므로 뺐다. 업로드 전에 JPEG·HEIC의 긴 변을 2000px로 줄여 JPEG(품질 0.85, EXIF 회전 반영)로 올리고, HEIC는 작아도 JPEG로 바꾼다(Safari만 표시 가능). PNG 등은 그대로. 붙여넣기·첨부 버튼에도 같이 적용. 검증: 가짜 `visualViewport`로 키보드를 흉내 내 Chromium·WebKit 320·390px에서 저장·툴바·시트 위치 확인(실제 iOS 키보드는 자동화 불가 → 사용자 확인). web 테스트 23개(서식 명령, 사진 크기), E2E 9개(모바일에 툴바·사진·시트 추가) | 2026-09-28 |
| Step 7 | – | | |
