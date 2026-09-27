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
- 도구 (Phase 0): `list_spaces`, `get_space_tree`, `read_page` — 모두 읽기 전용

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

## 5. 문제 해결

| 증상 | 원인 |
|---|---|
| 302 (Access 로그인 페이지로 이동) | 서비스 토큰 누락·오류, 또는 Access 정책의 Action이 `Service Auth`가 아님 |
| 401 `unauthenticated` | Clavis 토큰(`Authorization`) 누락 |
| 401 `invalid-token` | Clavis 토큰이 틀렸거나 폐기됨 |
| 403 `approval-pending` / `forbidden` | 역할 부족 (에이전트는 editor/viewer) |
| 429 | 호출 한도 초과, `Retry-After` 초 후 재시도 |
