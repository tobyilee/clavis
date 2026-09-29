# 설치 가이드 — 내 Cloudflare 계정에 Clavis 올리기

> 대상: Clavis를 자기 팀용으로 설치해 운영하려는 사람 · 작성일: 2026-09-29

Clavis는 Cloudflare Worker 하나로 돌아갑니다. 이 가이드를 따라 하면 내 Cloudflare 계정에 다음이 만들어집니다.

- Worker `clavis` — 웹 화면, REST API, MCP 서버. 주소는 `https://clavis.<서브도메인>.workers.dev`
- D1 데이터베이스(문서·사용자), R2 버킷(첨부·백업), Queue(저장 뒤 작업), Vectorize 인덱스와 Workers AI(의미 검색)
- Cloudflare Access 앱 — 로그인. Clavis에는 자체 비밀번호가 없고, Access를 통과한 사람과 에이전트만 들어옵니다.

이 문서에서 `<서브도메인>`은 내 계정의 workers.dev 서브도메인, `<팀 이름>`은 Zero Trust 팀 이름입니다.

## 0. 준비

| 필요한 것 | 비고 |
|---|---|
| Cloudflare 계정 | 무료 플랜으로 충분합니다(아래 비용) |
| Node.js 22 이상 (24 권장), pnpm 12, git | `.nvmrc`에 버전이 있습니다 |
| GitHub 계정 | 선택. push할 때 자동 배포하려면 (§8) |

설치 전에 내 컴퓨터에서 먼저 써 보려면 [README의 로컬 개발](../../README.md#로컬-개발)를 봅니다. 로컬 실행에는 Cloudflare 계정이 필요 없습니다.

### 비용

10명 안팎의 팀, 문서 수백 건이면 무료 한도 안에서 돌아갑니다(추정치는 [`01-architecture.md`](../01-architecture.md) §11).

| 서비스 | 무료 한도 (요약) | 넘으면 |
|---|---|---|
| Workers | 하루 요청 10만, 요청당 CPU 10ms | 그날 요청 실패 |
| D1 | DB 500MB, 하루 읽기 500만 행·쓰기 10만 행 | 실패 |
| R2 | 저장 10GB | **사용량만큼 청구** |
| Queues | 하루 1만 작업 | 알림·색인 지연·실패 |
| Workers AI | 하루 1만 neurons (약 900만 토큰 색인) | 그날 의미 검색 대신 글자 검색 |
| Vectorize | 1024차원 벡터 약 4,880개 | 새 섹션 색인 실패 |
| Zero Trust (Access) | 50명 | — |

- R2를 처음 켜거나 Zero Trust 조직을 만들 때 결제 수단 등록을 요구할 수 있습니다.
- 한도와 가격은 Cloudflare 정책에 따라 바뀝니다. 대시보드에서 사용량 알림을 켜 두세요.

## 1. 코드 받기와 Cloudflare 로그인

```sh
git clone https://github.com/<내 계정>/clavis.git && cd clavis   # 자동 배포를 쓰려면 먼저 fork
pnpm install
cd apps/worker                          # 이 문서의 wrangler 명령은 모두 여기서 실행
pnpm exec wrangler login                # 브라우저에서 Cloudflare 로그인
pnpm exec wrangler whoami               # 계정 확인
```

계정이 여러 개면 `wrangler.jsonc`에 `"account_id": "<계정 ID>"`를 넣거나 환경 변수 `CLOUDFLARE_ACCOUNT_ID`를 둡니다.

## 2. 리소스 만들기

```sh
pnpm exec wrangler d1 create clavis
pnpm exec wrangler r2 bucket create clavis-files
pnpm exec wrangler queues create clavis-events
pnpm exec wrangler vectorize create clavis-chunks --dimensions=1024 --metric=cosine
pnpm exec wrangler vectorize create-metadata-index clavis-chunks --propertyName=space --type=string
pnpm exec wrangler vectorize create-metadata-index clavis-chunks --propertyName=docType --type=string
```

- `d1 create`가 출력하는 `database_id`를 적어 둡니다(§3).
- wrangler가 설정 파일에 바인딩을 추가할지 물으면 **No**. `wrangler.jsonc`에 바인딩이 이미 있습니다.
- Vectorize **메타데이터 인덱스는 벡터보다 먼저** 만들어야 합니다(나중에 만들면 그 전에 들어간 벡터는 Space·유형으로 거를 수 없음). 위 순서대로 첫 배포 전에 만듭니다.
- 이름을 바꾸고 싶다면 `wrangler.jsonc`의 같은 이름도 바꿉니다.
- Workers AI와 호출 한도(Rate Limiting)는 만들 것이 없습니다.

## 3. 설정 파일 고치기 (첫 배포 전)

`apps/worker/wrangler.jsonc`에는 이 저장소를 만든 팀의 값이 들어 있습니다. 내 값으로 바꿉니다.

| 항목 | 지금 할 일 |
|---|---|
| `d1_databases[0].database_id` | §2에서 받은 값 |
| `vars.APP_ORIGIN` | 일단 그대로 두고 §6에서 바꿈 (Slack·Webhook 메시지의 링크 주소) |
| `vars.ACCESS_TEAM_DOMAIN` | `""`로 비움 → §5에서 채움 |
| `vars.ACCESS_AUD` | `""`로 비움 → §5에서 채움 |

- `ACCESS_*`가 비어 있는 동안에는 아무도 로그인하지 못합니다(401). 설정 전에 다른 곳의 로그인이 통하지 않게 하려는 것이니 그대로 두세요.
- 그 밖에 바꿀 수 있는 값:

| 항목 | 설명 |
|---|---|
| `name` | Worker 이름이자 주소 앞부분(`<name>.<서브도메인>.workers.dev`). 바꾸면 Access 앱 이름과 주소도 바뀝니다 |
| `triggers.crons` | 야간 백업 시각(UTC). 기본 `*/2 17-18 * * *`은 한국 시간 새벽 2~4시. Cron은 계정당 5개까지 |
| `ratelimits[].namespace_id` | 계정 안에서 겹치지 않는 숫자. 다른 Worker가 같은 번호를 쓰지 않으면 그대로 |

## 4. 데이터베이스 준비와 첫 배포

```sh
pnpm exec wrangler d1 migrations apply DB --remote   # 테이블 만들기
pnpm -w run build                                   # 웹 화면 빌드 (apps/web/dist)
pnpm exec wrangler deploy
```

배포 출력의 주소(`https://clavis.<서브도메인>.workers.dev`)를 적어 둡니다. 아직 Access가 없으므로 화면은 열리지만 로그인이 안 되고 API는 401입니다.

## 5. Cloudflare Access 설정 (로그인)

메뉴 이름은 Cloudflare 대시보드 버전에 따라 조금 다를 수 있습니다.

1. **Zero Trust 조직**: 처음이라면 대시보드의 Zero Trust에서 팀 이름을 정하고 Free 플랜을 고릅니다. 팀 도메인은 `https://<팀 이름>.cloudflareaccess.com`입니다.
2. **Worker에 Access 켜기**: Workers & Pages → `clavis` → Settings → **Domains & Routes** → `workers.dev` 행에서 **Enable Cloudflare Access**. `clavis - Cloudflare Workers`라는 Access 앱이 생깁니다.
   - **Preview URLs**도 켜져 있다면 같은 화면에서 Access를 켜거나 Preview URLs를 끕니다. 그대로 두면 그 주소는 Access 없이 열립니다(데이터는 401로 막히지만 화면 껍데기와 API 명세가 보임).
3. **사람 로그인 정책**: Zero Trust → Access → Applications → `clavis - Cloudflare Workers` → Policies에서 기본 정책(Action `Allow`)의 Include를 정합니다.
   - 특정 사람: **Emails**에 주소를 하나씩
   - 회사 전체: **Emails ending in**에 `@회사.com`
   - 로그인 방식: One-time PIN(이메일로 받은 코드)이 기본입니다. Google 등은 Zero Trust 설정의 **Authentication → Login methods**에서 추가합니다.
4. **값 두 개 확인**
   - `ACCESS_TEAM_DOMAIN`: `https://<팀 이름>.cloudflareaccess.com`
   - `ACCESS_AUD`: 같은 Access 앱의 개요(Basic information)에 있는 **Application Audience (AUD) Tag** — 64자리 16진수

> [!IMPORTANT]
> Access를 껐다 켜거나 앱을 다시 만들면 AUD가 바뀝니다. 그러면 `ACCESS_AUD`를 고쳐 다시 배포해야 로그인됩니다.

## 6. 설정 채우고 다시 배포

`wrangler.jsonc`의 `vars`:

```jsonc
"APP_ORIGIN": "https://clavis.<서브도메인>.workers.dev",
"ACCESS_TEAM_DOMAIN": "https://<팀 이름>.cloudflareaccess.com",
"ACCESS_AUD": "<AUD 태그>"
```

```sh
pnpm exec wrangler deploy
```

이 세 값은 비밀이 아닙니다(AUD는 Access가 발급하는 모든 로그인 토큰에 들어 있는 공개 식별자). fork 저장소에 커밋해도 됩니다.

## 7. 첫 로그인과 초기 설정

> [!WARNING]
> **처음 로그인한 사람이 관리자**가 됩니다. 주소를 다른 사람에게 알리기 전에 설치한 사람이 먼저 로그인하세요. 그다음부터 로그인하는 사람은 **승인 대기** 상태로 시작합니다.

1. 브라우저에서 `https://clavis.<서브도메인>.workers.dev`를 열고 Access로 로그인 → Clavis 홈이 나오면 성공입니다.
2. 확인: 로그인한 브라우저로 `/api/v1/health`를 열면 `{"status":"ok", …}`. 로그인하지 않은 터미널에서는 302(Access 로그인으로 이동)가 정상입니다.

   ```sh
   curl -sS -o /dev/null -w '%{http_code}\n' https://clavis.<서브도메인>.workers.dev/api/v1/health   # 302
   ```

3. **Space 만들기**: 헤더의 **관리** → **Space** → **새 Space**. 키(영문 대문자로 시작하는 대문자·숫자 2~10자, 예: `PAY`)는 URL과 위키 링크에 쓰여 나중에 바꿀 수 없습니다.
4. **사람 초대**: Access 정책(§5-3)에 그 사람을 넣고 주소를 알려 줍니다. 그 사람이 로그인하면 **관리 → 사람**에서 역할(읽기·편집·관리자)을 줘서 승인합니다.
5. **AI 에이전트 연결**: 에이전트는 Access **서비스 토큰**과 Clavis 토큰, 두 가지로 들어옵니다. Access 앱에 Action **Service Auth** 정책을 하나 더 만들고(Include: Service Token), 에이전트를 등록합니다. 순서는 [agent-connection.md](./agent-connection.md) §1.
6. **의미 검색**: 문서를 저장하면 몇 초 안에 자동으로 색인됩니다. **관리 → 의미 검색**에서 상태를 보고, 색인이 빠진 문서가 있으면 **색인 만들기**를 누릅니다.

사용법은 [문서 작성 가이드](./writing.md)에 있습니다.

## 8. GitHub Actions로 자동 배포 (선택)

저장소의 [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)은 `main`에 push하면 검사(Biome·typecheck·테스트·E2E) 후 **D1 마이그레이션 → 빌드 → 배포 → 헬스 체크**를 합니다. fork에서 쓰려면:

1. fork 저장소의 Actions를 켭니다(fork는 기본으로 꺼져 있음).
2. **Settings → Secrets and variables → Actions**에 secrets 두 개:
   - `CLOUDFLARE_ACCOUNT_ID`: 대시보드 계정 홈에 있는 계정 ID
   - `CLOUDFLARE_API_TOKEN`: My Profile → API Tokens → **Edit Cloudflare Workers** 템플릿으로 만들고, 계정 권한 **D1 Edit**와 **Queues Edit**를 추가
3. `ci.yml`의 주소 두 곳(`environment.url`, 헬스 체크 `curl`)을 내 주소로 바꿉니다.
4. §3·§6에서 고친 `wrangler.jsonc`와 함께 커밋해 push합니다.

## 9. 업데이트

원래 저장소의 새 버전을 받을 때:

```sh
git remote add upstream https://github.com/tobyilee/clavis.git   # 처음 한 번
git fetch upstream && git merge upstream/main
```

- `wrangler.jsonc`·`ci.yml`이 충돌하면 **내 값**(database_id, vars, 주소)을 남기고 새로 생긴 항목만 받아들입니다. 새 바인딩(새 Queue·인덱스 등)이 생겼다면 §2처럼 리소스를 만듭니다.
- 자동 배포를 쓰면 push로 끝입니다. 직접 배포할 때는 **마이그레이션을 먼저** 합니다:

  ```sh
  cd apps/worker
  pnpm exec wrangler d1 migrations apply DB --remote
  pnpm -w run build && pnpm exec wrangler deploy
  ```

## 10. 백업과 복구

| 수단 | 내용 | 복구 |
|---|---|---|
| D1 Time Travel | DB 전체, 최근 7일 (무료 플랜, 자동) | `pnpm exec wrangler d1 time-travel restore clavis --timestamp=<시각>` — DB 전체를 그 시점으로 |
| 야간 Markdown 백업 | 매일 밤 모든 페이지를 R2 `clavis-files`의 `backup/<날짜>/`에 tar로 (14일 보관) | 모든 `part-*.tar`를 한 폴더에 풀면 Space·페이지 트리의 `.md` 파일 |
| 버전 기록 | 문서마다 모든 저장 | 화면의 변경 기록에서 문서 하나씩 되돌리기 |

## 11. 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| 로그인했는데 "Authentication required"(401) | `ACCESS_TEAM_DOMAIN`·`ACCESS_AUD`가 비었거나 틀림, 또는 고친 뒤 다시 배포하지 않음. Access를 껐다 켰다면 AUD가 바뀜 |
| 로그인하면 "승인 대기" | 첫 사용자가 아님. 관리자가 **관리 → 사람**에서 역할을 줌 |
| 로그인 화면이 안 뜨고 바로 열림 | Access가 꺼져 있거나 다른 주소(Preview URL, 커스텀 도메인)로 들어옴 → §5-2 |
| 로그인 화면에서 "허용되지 않음" | Access 정책 Include에 그 이메일이 없음 → §5-3 |
| 배포 오류: Queue·버킷·인덱스를 찾을 수 없음 | §2의 리소스가 없거나 이름이 `wrangler.jsonc`와 다름 |
| 검색 화면에 "글자로 찾은 결과입니다" | 의미 검색을 쓸 수 없음(Workers AI 하루 한도, Vectorize 인덱스 없음) — 글자 검색은 정상 |
| Slack·Webhook 링크가 다른 주소로 감 | `APP_ORIGIN` 확인 → §6 |
| CI 배포에서 인증·권한 오류 | API 토큰 권한(§8-2)과 `CLOUDFLARE_ACCOUNT_ID` 확인 |
| 에이전트가 302 | 서비스 토큰 누락·오류, 또는 Access 정책의 Action이 `Service Auth`가 아님 → [agent-connection.md](./agent-connection.md) §9 |
