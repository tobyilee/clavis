# AI 에이전트 연결 가이드 (MCP)

> 대상: Hermes Agent, Claude Code 등 MCP 클라이언트 · 작성일: 2026-09-27

## 1. 필요한 자격 증명 (세 가지 헤더)

| 헤더 | 값 | 확인 주체 |
|---|---|---|
| `CF-Access-Client-Id` | Cloudflare Access 서비스 토큰 `clavis-agent`의 Client ID | Cloudflare Access (엣지) |
| `CF-Access-Client-Secret` | 같은 토큰의 Client Secret | Cloudflare Access (엣지) |
| `Authorization` | `Bearer clv_…` — 에이전트별 Clavis API 토큰 | Clavis Worker |

- 서비스 토큰은 Access를 통과시키는 **출입증**, Clavis 토큰은 **어느 에이전트인지** 식별한다. 둘 다 있어야 한다.
- 에이전트 등록·토큰 발급: `pnpm --filter @clavis/worker agent:create --name <이름>` → 저장소 루트 `.agent.env`에 기록 (출력되지 않음).
- `.agent.env`는 쉘로 `source`하지 않는다. `eval "$(python3 scripts/agent-env.py)"`로 읽는다.

## 2. 엔드포인트

- URL: `https://clavis.crawl-proxy.workers.dev/mcp`
- 전송 방식: Streamable HTTP (Stateless)
- 도구: §5 참고 (읽기 6개, 쓰기 4개)

## 3. Hermes Agent 설정

`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  clavis:
    url: "https://clavis.crawl-proxy.workers.dev/mcp"
    headers:
      CF-Access-Client-Id: "${CLAVIS_CF_ACCESS_CLIENT_ID}"
      CF-Access-Client-Secret: "${CLAVIS_CF_ACCESS_CLIENT_SECRET}"
      Authorization: "Bearer ${CLAVIS_TOKEN}"
```

`~/.hermes/.env` (값은 `.agent.env`에서 복사, 따옴표·공백 없이):

```
CLAVIS_CF_ACCESS_CLIENT_ID=...
CLAVIS_CF_ACCESS_CLIENT_SECRET=...
CLAVIS_TOKEN=clv_...
```

확인:

```bash
hermes mcp test clavis     # 서버 응답·HTTP 상태 진단
hermes mcp catalog         # 등록된 서버 목록
```

Hermes 실행 중이라면 `/reload-mcp`로 다시 읽는다.

## 4. Claude Code 설정 (예시)

```bash
claude mcp add --transport http clavis https://clavis.crawl-proxy.workers.dev/mcp \
  --header "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  --header "Authorization: Bearer $CLAVIS_TOKEN_CLAUDE_CODE"
```

에이전트마다 별도 Clavis 토큰을 발급해 작성자 표시와 호출 한도(120회/분)가 분리되게 한다.

## 5. 도구 목록

| 도구 | 권한 | 용도 |
|---|---|---|
| `list_spaces` · `get_space_tree` | viewer | Space와 페이지 트리 탐색 |
| `search_pages` | viewer | 제목·본문 전문 검색 (3글자 이상은 색인, 짧으면 부분 일치) |
| `read_page` | viewer | frontmatter 포함 원문 + `revision` |
| `list_templates` · `lint_markdown` | viewer | 템플릿 필수 섹션 확인, 저장 전 검사 |
| `create_page` | editor | 새 페이지 (`template`으로 시작하면 필수 섹션이 채워짐) |
| `update_page` | editor | 원문 전체 교체. `baseRevision` 필수 |
| `move_page` · `delete_page` | editor | 이동, 휴지통으로 이동 (30일 내 복원 가능) |

viewer 역할 에이전트에게는 쓰기 도구가 목록에 나타나지 않습니다.

### 쓰기 흐름 예시 (회의록)

```
list_templates                                 → meeting의 필수 섹션 확인
create_page  space=TEAM title="주간 회의 2026-09-27" template=meeting
                                               → "Created TEAM/k3x9q1 … revision=1" + 페이지 URL
read_page    page=k3x9q1                       → 원문 + revision=1
update_page  page=k3x9q1 content=<수정한 원문 전체> baseRevision=1
                                               → "Updated … revision=2", 경고가 있으면 줄 번호와 함께
```

- **충돌**: 그사이 다른 사람이 저장했다면 `update_page`가 "Current revision is N"과 함께 실패합니다. `read_page`로 다시 읽고 변경을 다시 적용하세요.
- **검사 오류**: frontmatter 누락, 없는 첨부 참조 같은 오류는 저장을 막고 `- L2 error clavis/frontmatter-required: …` 형식으로 알려 줍니다. 경고는 저장된 뒤 함께 표시됩니다.
- **제목**: 페이지 제목은 `title` 인자로 정합니다. 본문에 `# 제목`(H1)을 쓰지 않습니다.
- **링크**: `[[페이지 제목]]`, 다른 Space는 `[[KEY:페이지 제목]]`. 제목을 바꾸면 옛 제목으로 된 링크는 깨진 링크가 됩니다(자동으로 고치지 않음).

## 6. REST API

MCP와 같은 기능을 REST로도 쓸 수 있습니다. 명세는 `/api/v1/openapi.json`, 문서는 `/api/v1/docs`에 있습니다. 인증 헤더는 MCP와 같습니다. 페이지 원문만 받으려면 `Accept: text/markdown`을 보냅니다.

**첨부 파일 업로드** (MCP 도구에는 없음, 파일당 25MB): 파일 내용을 그대로 본문으로 보냅니다(multipart 아님). 응답의 `filename`(이름이 겹치면 `-1`이 붙음)으로 본문에서 `![설명](attachments/<filename>)`처럼 참조합니다.

```bash
curl -X POST "https://clavis.crawl-proxy.workers.dev/api/v1/pages/<shortId>/attachments?filename=arch.png" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $CLAVIS_TOKEN" -H "Content-Type: image/png" \
  --data-binary @arch.png
```

## 7. 문제 해결

| 증상 | 원인 |
|---|---|
| 302 (Access 로그인 페이지로 이동) | 서비스 토큰 누락·오류, 또는 Access 정책의 Action이 `Service Auth`가 아님 |
| 401 `unauthenticated` | Clavis 토큰(`Authorization`) 누락 |
| 401 `invalid-token` | Clavis 토큰이 틀렸거나 폐기됨 |
| 403 `approval-pending` / `forbidden` | 역할 부족 (에이전트는 editor/viewer) |
| 429 | 호출 한도 초과, `Retry-After` 초 후 재시도 |
