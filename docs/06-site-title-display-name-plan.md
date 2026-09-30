# Clavis — 사이트 제목·표시 이름 (개발 명세·계획)

> 상태: **Done** · 작성일: 2026-09-30 · 결정 확정: 2026-09-30 (§7 추천안 전부 채택)
> 선행 문서: [`01-architecture.md`](./01-architecture.md) v0.5 · [`05-phase3-plan.md`](./05-phase3-plan.md) · [`decisions.md`](./decisions.md)

---

## 1. 목표

작은 기능 두 가지를 더한다.

- **F1 사이트 제목**: 화면 왼쪽 위에 `Clavis - {제목}`을 보여 준다. 제목은 관리자가 관리 화면에서 정한다. 팀마다 따로 설치해 쓰므로, 어느 팀의 위키인지 한눈에 알 수 있게 한다.
- **F2 표시 이름**: 각 사람이 화면에 보이는 자기 이름을 직접 바꾼다. 지금은 첫 로그인 때 Access가 준 이름이나 이메일 앞부분(예: `tobybizmatrixxlee`)으로 정해지고, 바꿀 방법이 없다.

## 2. 완료 조건 (Exit Criteria)

- [x] 관리자가 관리 → **일반** 탭에서 사이트 제목을 저장하면, 모든 사용자의 헤더 왼쪽 위와 브라우저 탭 제목이 `Clavis - {제목}`이 된다. 제목을 비우면 지금처럼 `Clavis`다
- [x] 승인 대기(pending) 사용자의 화면에도 제목이 보인다. 제목을 못 읽으면(401·오류) `Clavis`로 보이고, 화면은 깨지지 않는다
- [x] 사람은 헤더의 사용자 메뉴에서 표시 이름을 바꾼다. 역할과 관계없이, 승인 대기 중에도 된다. 폰에서도 메뉴에 닿을 수 있다
- [x] 바꾼 이름이 지난 기록을 포함해 바로 반영된다: 문서 작성자·수정자, 변경 기록, 댓글, 알림, 휴지통, 첨부, 홈, 멘션 자동완성, Slack·Webhook, MCP 출력
- [x] 다른 사람이나 에이전트가 쓰는 이름(대소문자 무시)으로는 바꿀 수 없다
- [x] 제목·이름이 길어도 폭 320·375px 헤더에 가로 넘침이 없다
- [x] 테스트(worker·web·E2E), `01-architecture.md`, 가이드가 구현과 일치한다

## 3. 범위

### 포함
| 영역 | 내용 |
|---|---|
| 사이트 제목 | `settings` 테이블, 조회·저장 API, 헤더와 브라우저 탭 제목, 관리 화면 **일반** 탭, 야간 백업 포함 |
| 표시 이름 | `PATCH /me`(사람만), 이름 규칙·중복 검사, 헤더 사용자 메뉴와 이름 바꾸기 대화상자, 지난 멘션 칩에 현재 이름 표시 |

### 제외
- 로고·파비콘·색 바꾸기
- 사이트 제목을 Slack 메시지, `llms.txt`, MCP 서버 이름, OpenAPI 제목에 넣기. 모두 `Clavis`로 둔다
- 관리자가 사람 이름을 바꾸기(D-67)
- 프로필 사진, 이름 변경 기록

## 4. 현재 구조

| 대상 | 위치 | 지금 동작 |
|---|---|---|
| 헤더 왼쪽 위 | `apps/web/src/components/app-shell.tsx:97` | `Clavis` 고정 링크(`/`) |
| 브라우저 탭 제목 | `apps/web/index.html:6` | `<title>Clavis</title>` 고정. 코드에서 바꾸는 곳이 없다 |
| 헤더와 승인 대기 | `apps/web/src/routes/__root.tsx` | `AuthGate`가 `AppShell` 안에 있다. 그래서 승인 대기·로그아웃 상태에서도 헤더가 보인다 |
| 헤더의 내 이름 | `app-shell.tsx:41` `CurrentUser` | 이름 텍스트뿐이다. `hidden sm:inline`이라 폰에서는 안 보인다 |
| 관리 탭 | `apps/web/src/routes/admin.tsx:45` | `people`·`agents`·`spaces`·`search` |
| 사람 이름 | `apps/worker/src/services/actors.ts:31` `findOrCreateHuman` | 첫 로그인 때 Access `name`, 없으면 이메일 앞부분. 다음 로그인부터는 덮어쓰지 않는다 |
| 이름 바꾸기 | `apps/worker/src/api/admin.ts:111` | 관리자가 에이전트만 바꾼다(1~64자). 사람은 400 `invalid-name` |
| 이름 표시 | `page-read`·`revisions`·`comments`·`notifications`·`trash`·`attachments`·`home`·`webhooks`·MCP | 모두 조회할 때 `actors.name`을 조인한다. 그래서 이름을 바꾸면 지난 기록에도 새 이름이 보인다 |
| 멘션 | `packages/shared/src/markdown/mentions.ts` | 저장 형태는 `@[이름](actor:ID)`(이름 1~64자, `]`·줄바꿈 불가). 공백 없는 `@이름`도 `lower(a.name)`으로 찾는다 |
| 자동 지켜보기 | `apps/worker/src/services/notifications.ts:28` | frontmatter `owner`가 이메일이나 **이름**과 같으면 담당자로 본다 |
| 멘션 자동완성 목록 | `apps/web/src/lib/notifications.ts:45` | `GET /actors`, queryKey `['actors']` |
| 설치 단위 설정 | – | 저장할 곳이 없다. 새 테이블이 필요하다(마지막 마이그레이션은 `0011_page_chunks`) |

## 5. 명세

### 5.1 F1 사이트 제목

**표시 규칙**
- 제목이 있으면 `Clavis - {제목}`, 없으면 `Clavis`다. 헤더와 `document.title`은 같은 문자열을 쓴다.
- 헤더 제목 전체가 `/`로 가는 링크 하나다. `Clavis`는 지금처럼 굵게, ` - {제목}`은 보통 굵기로 쓴다.
- 긴 제목은 말줄임(`min-w-0 truncate`)하고, 전체 문자열은 `title` 속성에 둔다. 폰(`sm` 미만)에서는 제목 자리를 위해 검색 버튼이 아이콘이 되고, 언어 선택(KO·EN)은 계정 메뉴로 들어간다.
- 새로 고침 때 `Clavis`가 `Clavis - 제목`으로 바뀌며 깜박이지 않게, 마지막으로 받은 제목을 `localStorage`(`clavis.siteTitle`)에 두고 초기값으로 쓴다. 읽기·쓰기는 try/catch로 감싼다.

**데이터**: 마이그레이션 `0012_settings`

```
settings
  key         TEXT PRIMARY KEY        -- 'site.title'
  value       TEXT NOT NULL
  updated_by  TEXT REFERENCES actors(id)
  updated_at  INTEGER NOT NULL        -- epoch ms
```

- 키-값 테이블 하나에 앞으로 생길 설치 단위 설정도 함께 둔다(D-64). 제목을 비우면 행을 지운다.

**API**
| 메서드·경로 | 권한 | 요청 | 응답 |
|---|---|---|---|
| `GET /api/v1/site` | 로그인한 모든 사람·에이전트. 승인 대기도 포함하므로 `requireRole`을 두지 않는다 | – | `200 { title: string \| null }` |
| `PUT /api/v1/admin/site` | admin(`admin.use('/admin/*')`가 자동으로 막는다) | `{ title: string }` | `200 { title: string \| null }` / `400` |

- 검증: 앞뒤 공백을 지운 뒤 0~40자. 제어 문자(`\p{Cc}`, 줄바꿈 포함)는 안 된다. 빈 문자열은 제목 없음이다.
- OpenAPI 스키마 이름은 `Site`다. 에이전트도 REST로 읽을 수 있다. MCP 도구는 추가하지 않는다.

**웹**
- `lib/site.ts`
  - `useSite()`: queryKey `['site']`, `staleTime` 5분. 401이면 재시도 없이 `null`(`useMe`와 같은 방식).
  - `formatSiteTitle(title)`: 헤더와 `document.title`이 함께 쓴다.
- `AppShell`: 로고 자리를 `SiteTitle` 컴포넌트로 바꾸고, `useEffect`로 `document.title`을 맞춘다.
- 관리 → **일반** 탭: `TABS`에 `general`을 더한다(기본 탭은 그대로 `people`). 제목 입력, 미리보기 `Clavis - {입력값}`, **저장**(`variant="primary"`). 저장하면 `['site']`를 무효화한다.
- i18n(`ko.json`·`en.json`): `admin.general`, `admin.siteTitle`, `admin.siteTitleHelp`, `admin.siteTitlePreview`, `admin.siteTitleSave`, `admin.siteTitleSaved`.

**그 밖에**
- 야간 백업 `meta.json`에 `settings` 행을 넣는다(`backup/backup.ts`의 batch에 문장 1개).
- 테스트 `resetDb`(`test/helpers.ts`) 목록에 `settings`를 넣는다. 외래 키 때문에 `actors`보다 앞에 둔다.

### 5.2 F2 표시 이름

**저장**: 새 컬럼 없이 `actors.name`을 표시 이름으로 쓴다(D-66). 로그인이 이름을 덮어쓰지 않으므로 한 번 바꾸면 유지된다. 모든 조회가 이미 `name`을 조인하므로 지난 기록에도 바로 반영된다.

**이름 규칙**: 멘션 저장 형태(`MARKUP_RE`)와 맞춘다.
- 앞뒤 공백을 지우고, 이어진 공백은 하나로 줄인다. 길이는 1~64자.
- `[`, `]`, 줄바꿈·제어 문자는 안 된다. 멘션 마크업 `@[이름](actor:ID)` 속 이름이 저장된 이름과 달라지지 않게 하기 위해서다.
- 다른 actor(사람·에이전트 모두)와 **대소문자만 다른 같은 이름도 안 된다** → `409 name-taken`(D-68).
  - 이유 1: 공백 없는 `@이름` 멘션은 `lower(a.name)`으로 찾으므로, 이름이 같으면 둘 다 알림을 받는다.
  - 이유 2: 사람이 에이전트와 같은 이름을 쓰면 헷갈린다.
  - SQLite `lower()`는 ASCII만 바꾼다. 한글은 대소문자가 없어 문제없다.
- 공백이 있는 이름도 허용한다. 대신 대화상자에 안내를 둔다: "공백 없이 쓰면 댓글에서 `@이름`으로 부를 수 있습니다(자동완성은 공백이 있어도 됩니다)."
- 이미 겹친 이름(이메일 앞부분이 같은 경우 등)은 그대로 둔다. DB 유니크 인덱스는 만들지 않고, **바꿀 때만** 검사한다.

**API**
| 메서드·경로 | 권한 | 요청 | 응답 |
|---|---|---|---|
| `PATCH /api/v1/me` | 로그인한 사람(승인 대기 포함). 에이전트는 `403 agent-rename`("Agents are renamed by an admin") | `{ name: string }` | `200 Actor` / `400 invalid-request`(다른 API와 같은 요청 검증) / `409 name-taken` |

- 중복 검사와 변경을 문장 하나로 처리해 동시 변경 경합을 없앤다(`findOrCreateHuman`과 같은 방식). 바뀐 행이 0이면 409, 자기 이름을 다시 저장하면 200이다.

  ```sql
  UPDATE actors SET name = ?1
  WHERE id = ?2
    AND NOT EXISTS (SELECT 1 FROM actors WHERE lower(name) = lower(?1) AND id != ?2)
  ```

- 관리자의 에이전트 등록과 이름 변경(`POST /admin/agents`, `PATCH /admin/actors/{id}`)에도 같은 규칙과 검사를 적용한다. `services/actors.ts`에 `validName`·`renameActor`를 두고 세 곳이 함께 쓴다.
- `me` 라우터에는 역할 가드가 없고 에이전트도 Bearer 토큰으로 `/me`를 부른다. 그래서 핸들러에서 `kind === 'agent'`를 직접 막는다.

**웹**
- 헤더 `CurrentUser` → **사용자 메뉴**(`DropdownMenu`)
  - 트리거: `sm` 이상에서는 이름, 폰에서는 `User` 아이콘 버튼(늘 보인다).
  - 메뉴: 이름·이메일 라벨, **표시 이름 바꾸기**, (관리자만) 관리, (폰에서만) 언어 선택.
- **표시 이름 바꾸기** 대화상자(`Dialog` + `Input`, 터치 화면에서 16px)
  - 현재 이름이 채워진 입력칸, 멘션 안내, 담당자 안내(아래 표), **저장**(`primary`).
  - 409면 입력칸 아래에 "이미 쓰는 이름입니다"를 보여 준다.
- 저장 뒤 `queryClient.invalidateQueries()`로 모두 다시 받는다. 이름이 문서·댓글·알림 등 여러 캐시에 조인되어 있고, 이름 변경은 드물어 비용이 작다.
- **지난 멘션 칩에 현재 이름**: 댓글 속 `@[옛 이름](actor:ID)`에는 쓸 때의 이름이 저장돼 있다. `markdown/link.tsx`의 `MarkdownLink`가 `#mention-{ID}` 링크를 `['actors']` 캐시의 현재 이름으로 보여 준다. 캐시에 없으면 저장된 이름을 쓴다. MCP `list_comments`는 원문 그대로 둔다(ID가 기준).
- i18n(`ko.json`·`en.json`): `user.menu`, `user.rename`, `user.renameTitle`, `user.renameHelp`, `user.renameMentionHint`, `user.renameOwnerHint`, `user.nameTaken`, `user.save`, `user.language.ko`·`user.language.en`.

**이름을 바꿀 때 영향**
| 대상 | 영향 | 처리 |
|---|---|---|
| 작성자·수정자, 변경 기록, 댓글, 알림, 휴지통, 첨부, 홈 | 조회할 때 조인 → 새 이름 | 없음 |
| Slack·Webhook | 전달할 때 이름을 읽음 → 이후 메시지부터 새 이름 | 없음 |
| 지난 댓글의 멘션 칩 | 옛 이름이 저장돼 있음 | 웹에서 현재 이름으로 표시(위) |
| 공백 없는 `@옛이름`(바꾼 뒤 새로 쓴 댓글) | 그 사람을 더는 찾지 못함 | 자동완성을 쓰라고 안내 |
| frontmatter `owner: 옛 이름` | 담당자 자동 지켜보기가 풀림 | 대화상자에 안내: "담당자에 이름 대신 이메일을 쓰면 이름을 바꿔도 유지됩니다." 문서를 자동으로 고치지는 않는다(저장·버전이 한꺼번에 생기므로) |
| 야간 백업 | `actors.name`은 이미 `meta.json`에 있음 | 없음 |

### 5.3 무료 플랜 예산

`GET /site`, `PUT /admin/site`, `PATCH /me` 모두 D1 1회, CPU 3ms 미만으로 예상한다. 앱을 열 때 `GET /site` 요청이 하나 늘어난다(이후 5분 캐시). 무료 한도에는 영향이 없다.

## 6. 작업 계획

Phase 1~3처럼 Step마다 커밋하고, 사용자가 요청하면 push해 운영에서 확인한다. Step 1과 Step 2는 서로 독립이다.

```
Step 1 사이트 제목             Step 2 표시 이름                 Step 3 마무리
──────────────────           ──────────────────              ──────────────
T1 settings 테이블·API        N1 이름 규칙·PATCH /me            Z1 E2E
T2 헤더·브라우저 탭 제목        N2 사용자 메뉴·이름 대화상자        Z2 문서 갱신
T3 관리 → 일반 탭             N3 멘션 칩에 현재 이름              Z3 Exit 점검
```

🤖 Claude가 진행 · 🤝 사용자 확인 후 Claude가 진행

### Step 1 — 사이트 제목 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| T1 | `settings` 테이블·API | `schema.ts`에 `settings` → `pnpm --filter @clavis/worker db:generate --name settings`(`0012_settings`). `api/site.ts`(`GET /site`), `api/admin.ts`(`PUT /admin/site`), `buildApi()`에 등록, OpenAPI 재생성. 백업 `meta.json`과 `resetDb`에 `settings`. worker 테스트: 기본값 `null`, 관리자 저장·비우기, editor `403`, 승인 대기도 `GET` 가능, 41자·줄바꿈 `400` |
| T2 | 헤더·브라우저 탭 제목 | `lib/site.ts`(`useSite`, `formatSiteTitle`, `localStorage` 초기값), `AppShell`의 `SiteTitle`, `document.title`. 401·오류면 `Clavis`. web 단위 테스트: `formatSiteTitle` |
| T3 | 관리 → 일반 탭 | 입력·미리보기·저장, i18n 두 언어 |

### Step 2 — 표시 이름 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| N1 | 이름 규칙·API | `services/actors.ts`에 `validName`·`renameActor`(조건부 UPDATE 한 문장). `PATCH /me`(사람만). 에이전트 등록·이름 변경도 같은 검사. worker 테스트: 바꾼 이름이 문서·댓글·변경 기록 조회에 반영, 에이전트 `403`, 다른 사람·에이전트와 대소문자만 다른 이름 `409`, 자기 이름 다시 저장 `200`, 65자·`]`·줄바꿈 `400`, 승인 대기도 가능, 새 이름의 공백 없는 `@이름` 멘션이 알림으로 감 |
| N2 | 사용자 메뉴·대화상자 | 헤더 사용자 메뉴(폰에서도 보임), 이름 바꾸기 대화상자(안내 2개, 409 표시), 저장 뒤 전체 무효화, i18n 두 언어 |
| N3 | 멘션 칩에 현재 이름 | `#mention-{ID}` 링크를 `['actors']` 캐시의 현재 이름으로 표시. 캐시에 없으면 저장된 이름 |

### Step 3 — 마무리 🤝

| ID | 작업 | 완료 기준 |
|---|---|---|
| Z1 | E2E | 기존 테스트에 합쳐 전체 9개를 유지한다. 관리자가 제목 저장 → 헤더와 `document.title` 확인. 이름 바꾸기 → 헤더와 문서 작성자 표시 확인. 모바일 테스트에서 40자 제목으로 320·375px 헤더에 가로 넘침이 없는지 확인 |
| Z2 | 문서 갱신 | `01-architecture.md`(§5.1 `settings`, §8 엔드포인트 3개), `guides/writing.md`(표시 이름), `guides/install.md`(설치 후 사이트 제목 정하기), `CHANGELOG.md`(추가 2줄, 업데이트할 때 할 일: D1 마이그레이션 `0012` — CI 배포는 자동), `decisions.md`(§7 확정분), `handoff.md` |
| Z3 | Exit 점검 | §2 체크리스트, 사용자와 운영에서 한 번 써 보기 |

## 7. 결정 사항

아래 추천안을 모두 채택했다 (2026-09-30, [`decisions.md`](./decisions.md) D-64~D-68).

| ID | 주제 | 추천안 | 대안 |
|---|---|---|---|
| D-64 | 사이트 제목 저장 | **D1 `settings` 키-값 테이블**. 관리 화면에서 바로 바뀌고, 앞으로 생길 설치 단위 설정도 같은 곳에 둔다 | `wrangler.jsonc` 변수(바꾸려면 재배포 — 관리 화면에서 정한다는 요구와 맞지 않음) / 한 행짜리 `site` 테이블(설정이 늘 때마다 컬럼 마이그레이션) |
| D-65 | 제목 전달 | **별도 `GET /site`**(역할 가드 없음, 5분 캐시 + `localStorage` 초기값) | `GET /me` 응답에 포함(요청 1회 절약, 대신 actor 응답에 설치 정보가 섞임) / Worker가 `index.html`에 주입(HTML 요청마다 D1 조회, `run_worker_first` 범위 확대) |
| D-66 | 표시 이름 저장 | **`actors.name`을 그대로 표시 이름으로**. 모든 조회가 이미 `name`을 조인하고, 로그인이 덮어쓰지 않는다 | `display_name` 컬럼 추가, 비었으면 `name`(조회 10여 곳 수정, 로그인 이름 보존) |
| D-67 | 누가 바꾸나 | **사람은 본인만**(승인 대기 포함 — 관리자가 승인할 때 실제 이름을 보게). 에이전트는 지금처럼 관리자만. 관리자는 사람 이름을 바꾸지 못한다 | 관리자도 사람 이름을 바꿀 수 있게(부적절한 이름 정리용) |
| D-68 | 이름 중복 | **바꿀 때 대소문자 무시로 중복 거절**(사람·에이전트 모두 대상, 기존 중복은 둠) | 중복 허용(멘션 알림이 둘 다에게 감) / DB 유니크 인덱스(기존 중복이 있으면 마이그레이션 실패) |

## 8. 열린 질문

- 사이트 제목 최대 40자로 충분한가? → 40자로 시작한다. 폰 320px에서도 말줄임으로 들어간다.
- 이름을 바꿀 때 담당자(`owner`)에 옛 이름이 적힌 문서 수를 대화상자에 보여 줄까? → 하지 않는다. 대화상자의 안내 문구(이메일을 쓰면 유지)만 둔다.

## 9. 결과 기록

| 항목 | 상태 | 결과 | 날짜 |
|---|---|---|---|
| Step 1 | ✅ 완료 | `0012_settings`(`settings`: key·value·updated_by·updated_at). **T1** `services/settings.ts`(`getSetting`·`putSetting` — 빈 값은 행 삭제), `api/site.ts`(`GET /site`, 역할 확인 없음), `api/admin.ts`(`PUT /admin/site`, 0~40자·제어 문자 불가, 앞뒤 공백 제거), 야간 백업 `meta.json`에 `settings`, `resetDb`에 `settings`. **T2** `lib/site.ts`(`useSite` — 5분 캐시, 401은 재시도 없음, 마지막 제목을 `localStorage` `clavis.siteTitle`에 두고 `placeholderData`로 / `formatSiteTitle` / `useSaveSiteTitle`), 헤더 `SiteTitle`(링크 하나, `Clavis` 굵게, 말줄임, `document.title`). **T3** 관리 → **일반** 탭(입력·미리 보기·저장, 저장하면 캐시 바로 갱신). **계획과 다른 점**: 폰 헤더에 긴 제목을 넣으니 "Clavi..."까지 잘려서, `max-w-[40vw]` 대신 폰에서는 검색 버튼을 아이콘으로, 언어 선택을 계정 메뉴로 옮겼다(320px에서 "Clavis - 결제팀 ..."). | 2026-09-30 |
| Step 2 | ✅ 완료 | **N1** `services/actors.ts`: `renameActor`(조건부 `UPDATE … WHERE NOT EXISTS(대소문자 무시 같은 이름)` 한 문장, 이어진 공백은 하나로), `createAgent`도 조건부 `INSERT … SELECT` 한 문장으로 바꿔 등록 때도 중복 거절. 이름 규칙은 zod `ActorName`(1~64자, `[`·`]`·제어 문자 불가 — `api/me.ts`)을 `PATCH /me`·`POST /admin/agents`·`PATCH /admin/actors/{id}`가 함께 쓴다. `PATCH /me`는 에이전트면 403 `agent-rename`, 겹치면 409 `name-taken`, 승인 대기도 가능. 관리자의 에이전트 이름 변경은 이름을 먼저 바꿔, 겹치면 역할 등 다른 변경도 적용하지 않는다. **계획과 다른 점**: 잘못된 이름은 `invalid-name`이 아니라 다른 API와 같은 요청 검증 400 `invalid-request`. **N2** `components/user-menu.tsx`: 헤더 계정 메뉴(`sm` 이상은 이름, 폰은 사람 아이콘) — 이름·이메일, 표시 이름 바꾸기, 관리, 폰에서는 언어. 이름 대화상자(멘션·담당자 안내, 409는 "이미 쓰는 이름"), 저장 뒤 모든 쿼리 무효화. 관리 → 에이전트에 등록·이름 변경 실패(409 등) 표시 추가. **N3** `MarkdownLink`가 `#mention-{ID}`를 `['actors']`(`GET /actors`) 캐시의 지금 이름으로 표시. worker 테스트 +9(`site` 3, `names` 5, 새 이름 멘션 1), web +1(`formatSiteTitle`) | 2026-09-30 |
| Step 3 | ✅ 완료 (운영 확인은 배포 후 사용자) | **Z1** E2E 9개 유지: 홈 테스트에 관리 → 일반 → 헤더·`document.title`, 계정 메뉴 → 이름 바꾸기 → 헤더·문서 작성자·새로 고침 확인. 모바일 테스트에 40자 제목으로 375·320px 가로 넘침 없음과 계정 메뉴 보임. **Z2** `01-architecture.md` v0.6(§5.1 `settings`·`actors.name`, §5.2 표시 이름, §8.5 엔드포인트, 화면), `guides/writing.md` §13, `guides/install.md` §7, `CHANGELOG.md`, `decisions.md` D-64~D-68, `handoff.md`. 테스트: shared 66 · web 28 · worker 148 · E2E 9 | 2026-09-30 |
