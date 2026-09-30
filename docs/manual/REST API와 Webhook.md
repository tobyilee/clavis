---
type: guide
status: approved
owner: admin
tags: [매뉴얼]
---

MCP 대신 HTTP로 Clavis를 쓰는 방법(REST API)과, Clavis 소식을 다른 시스템이 받는 방법(Webhook)입니다. 상위 문서: [[Clavis 사용 매뉴얼]]

## REST API

MCP 도구와 같은 기능을 REST로도 쓸 수 있습니다. 스크립트, CI, 사내 도구에서 씁니다.

| 항목 | 값 |
|---|---|
| 기본 주소 | `https://clavis.crawl-proxy.workers.dev/api/v1` |
| 명세 | `/api/v1/openapi.json` (OpenAPI 3.1) |
| 문서 화면 | `/api/v1/docs` — 모든 엔드포인트와 요청·응답 형식 |
| 인증 | MCP와 같은 헤더 세 개 ([[AI 에이전트 연결 (MCP)]]) |
| 오류 형식 | `application/problem+json` (RFC 9457), 규칙 위반은 `violations` 배열 |
| 호출 한도 | 에이전트 토큰당 1분 120번, 넘으면 429 + `Retry-After` |

### 자주 쓰는 엔드포인트

| 요청 | 설명 |
|---|---|
| `GET /spaces` | Space 목록 |
| `GET /spaces/{key}/tree` | 페이지 트리 |
| `GET /pages/{ref}` | 페이지 (`Accept: text/markdown`이면 원문 + `X-Clavis-Revision` 헤더) |
| `POST /spaces/{key}/pages` | 페이지 만들기 (`title`, `content` 또는 `template`, `parent`) |
| `PUT /pages/{ref}` | 페이지 고치기 (`content`, `baseRevision`, `title?`) |
| `GET /pages/{ref}/sections` · `PUT /pages/{ref}/sections/{section}` | 섹션 목록 · 섹션 교체/추가 |
| `PATCH /pages/{ref}/meta` | 상태·담당·태그만 |
| `GET /search?q=&mode=text\|semantic\|hybrid` | 검색. 응답의 `mode`는 실제로 실행된 방식 |
| `GET /pages/{ref}/revisions` · `POST /pages/{ref}/revisions/{n}/restore` | 변경 기록 · 복원 |
| `GET /pages/{ref}/comments` · `POST /pages/{ref}/comments` | 댓글 |
| `GET /me/notifications` | 내 알림 |

`{ref}`는 페이지 id, 짧은 id, 또는 `KEY:제목`(URL 인코딩)입니다.

### 예: 원문 읽기와 고치기

```sh
H=(-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
   -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
   -H "Authorization: Bearer $CLAVIS_TOKEN")
BASE=https://clavis.crawl-proxy.workers.dev/api/v1

# 원문과 revision
curl -s "${H[@]}" -H "Accept: text/markdown" -D - "$BASE/pages/a1b2c3"

# 섹션 끝에 항목 추가 (revision 불필요)
curl -s "${H[@]}" -X PUT -H "Content-Type: application/json" \
  -d '{"mode":"append","content":"- [ ] 환불 정책 초안"}' \
  "$BASE/pages/a1b2c3/sections/%EC%95%A1%EC%85%98-%EC%95%84%EC%9D%B4%ED%85%9C"
```

### 첨부 파일 올리기

MCP 도구에는 없고 REST로만 올립니다. 파일 내용을 그대로 본문으로 보냅니다 (multipart 아님, 파일당 25MB).

```sh
curl -X POST "$BASE/pages/a1b2c3/attachments?filename=arch.png" "${H[@]}" \
  -H "Content-Type: image/png" --data-binary @arch.png
```

응답의 `filename`(이름이 겹치면 `-1`이 붙음)으로 본문에서 `![설명](attachments/<filename>)`처럼 참조합니다.

### 원본 Markdown과 llms.txt

- 페이지 주소 끝에 `.md`를 붙이면 속성 포함 원문이 옵니다.
- `/llms.txt`는 Space 목록, `/s/{KEY}/llms.txt`는 그 Space의 페이지 목록(각 항목이 `.md` 링크)입니다. AI 도구가 Space 전체를 훑을 때 씁니다.
- 모두 같은 인증 헤더가 필요합니다.

## Webhook 받기

[[Space 설정]]의 **알림 채널**에서 **Webhook (JSON)**으로 https 주소를 추가하면, 고른 소식이 생길 때마다 그 주소로 `POST`합니다.

### 요청 형식

```http
POST <등록한 URL>
Content-Type: application/json
User-Agent: Clavis-Webhook/1
X-Clavis-Event: page.updated
X-Clavis-Delivery: 01K…
X-Clavis-Signature: sha256=<hex>
```

```json
{
  "event": "page.updated",
  "deliveryId": "01K…",
  "at": 1790000000000,
  "space": { "key": "PAY", "name": "결제" },
  "page": { "id": "01J…", "shortId": "a1b2c3", "title": "결제 API 설계", "url": "https://clavis.crawl-proxy.workers.dev/s/PAY/p/…" },
  "actor": { "id": "01J…", "name": "Adam", "kind": "agent" },
  "revision": 5,
  "changesUrl": "https://clavis.crawl-proxy.workers.dev/s/PAY/p/…/history?r=5&base=4"
}
```

| 필드 | 언제 |
|---|---|
| `event` | `page.created` · `page.updated` · `page.deleted` · `page.restored` · `comment.created` · `comment.resolved` · `ping`(테스트 전송) |
| `revision`, `changesUrl` | 문서 만들기·수정 (`changesUrl`은 바로 이전 버전과의 차이 화면) |
| `comment` | 댓글 소식: `id`, `threadId`, `body`(1,000자까지), `url` |
| `pageCount` | 휴지통 이동·복원: 하위 문서 포함 개수 |

### 서명 확인

카드에 보이는 **서명 키**로 **받은 본문 그대로**의 HMAC-SHA256을 계산해 `X-Clavis-Signature`와 비교합니다. JSON을 파싱했다가 다시 직렬화하면 값이 달라지니 원래 바이트를 씁니다.

```js
import crypto from 'node:crypto';

function verify(rawBody, header, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return header?.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}
```

### 응답과 재시도

- **5초 안에 2xx**를 돌려주세요. 무거운 처리는 받은 뒤 따로 합니다.
- 5xx, 429, 시간 초과, 연결 실패는 30초 · 2분 · 10분 뒤에 다시 보냅니다 (최대 3번). 4xx(429 제외)는 다시 보내지 않습니다.
- 재시도는 새 `X-Clavis-Delivery` id를 씁니다. 중복을 거르려면 이벤트 내용(`event`·`page.id`·`revision`·`at`)을 기준으로 합니다.
- 결과는 카드의 **최근 전달**(✓/✗, 상태 코드, 오류)에서 확인합니다.
