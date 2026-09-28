# Clavis — Phase 3 계획 (안전한 편집·알림·의미 검색)

> 상태: **In Progress** · 작성일: 2026-09-28 · 결정 확정: 2026-09-28 (§8 추천안 전부 채택)
> 선행 문서: [`00-concept.md`](./00-concept.md) §14 · [`01-architecture.md`](./01-architecture.md) v0.4 · [`04-phase2-plan.md`](./04-phase2-plan.md) · [`decisions.md`](./decisions.md)

---

## 1. 목표

Phase 2로 사람과 에이전트(Adam)가 같은 문서를 함께 가꾸게 됐다. 쓰는 주체가 늘면서 세 가지가 부족해졌다. Phase 3은 이 셋을 채운다.

- **잘못 고쳐도 되돌린다**: 에이전트가 문서를 크게 바꿔도, 누가 언제 무엇을 바꿨는지 보고 이전 버전으로 되돌린다. 지금은 휴지통만 있어(D-21) 수정은 되돌릴 수 없다 — 컨셉 문서 §15에서 가장 큰 리스크로 적었던 부분이다.
- **바뀐 것을 알게 된다**: 내 문서에 댓글이 달리거나, 누가 나를 부르거나, 지켜보는 문서가 바뀌면 앱 안에서 알고, 팀 Slack 채널에도 흘려보낸다. 외부 시스템은 Webhook으로 받는다.
- **말로 찾는다**: 제목·단어가 달라도 뜻이 비슷한 문서를 찾는다("환불 기준" → "부분 취소 정책"). 에이전트는 문서 전체 대신 관련 섹션만 가져온다.

## 2. 완료 조건 (Exit Criteria)

- [ ] 페이지의 **변경 기록**(버전, 작성자 🧑/🤖, 시각, 크기 변화)을 보고, 두 버전의 **차이(diff)**를 보고, 이전 버전으로 **복원**할 수 있다. 에이전트도 MCP로 기록을 읽고 복원한다
- [ ] 섹션 편집·속성 변경·제목 변경 링크 수정·복원까지 **모든 저장이 버전으로 남고**, 저장 파이프라인의 D1 호출 수는 늘지 않는다
- [ ] **앱 안 알림**: 내 문서의 새 댓글, 내 스레드의 답글, `@멘션`, 지켜보는 문서의 변경이 헤더의 알림 목록에 모이고, 읽음 처리할 수 있다
- [ ] 에이전트가 같은 문서를 여러 번 고쳐도 **알림이 한 건으로 묶인다**
- [ ] Space별 **Slack 채널**과 **Webhook**으로 페이지·댓글 이벤트를 받는다(서명 검증 가능, 실패 기록 확인 가능)
- [ ] **의미 검색**: 검색 화면과 MCP에서 뜻으로 찾고, 결과가 섹션 단위로 나온다. 저장하면 바뀐 섹션만 다시 색인된다
- [ ] 관리 화면에서 **에이전트 이름을 바꿀 수 있다**
- [ ] 운영 환경 실측: 새로 추가된 요청(저장 + 버전 기록, 버전 목록·diff, 알림 목록, 의미 검색, 색인)의 CPU가 모두 **10ms 미만**이고, 무료 한도(Workers AI·Vectorize·R2) 안에 들어간다
- [ ] `01-architecture.md` v0.5와 가이드 문서가 구현과 일치한다

## 3. 범위

### 포함 (P3)
| 영역 | 내용 |
|---|---|
| 버전 | 저장마다 버전 기록(본문은 R2, 목록은 D1), 변경 기록 화면, 두 버전 비교(diff), 복원, MCP 도구 |
| 알림 | 앱 안 알림(헤더 벨, 읽음), Watch(자동: 만든·담당·댓글 단 문서, 수동: 별도 버튼), 댓글 `@멘션`(자동완성), 에이전트 변경 묶기 |
| 외부 전달 | Space별 Slack Incoming Webhook, 일반 Webhook(JSON, HMAC 서명), 전달 기록 |
| 의미 검색 | Workers AI 임베딩 + Vectorize, 섹션 단위 청크, 바뀐 섹션만 재색인, 기존 전문 검색과 합친 결과, MCP 도구 |
| 관리 | 에이전트 이름 변경, 알림·Webhook 설정 화면 |

### 제외 (P4 이후)
이메일 알림(아래 D-58), 텍스트 선택 인라인 댓글, 사용자 정의 문서 유형(type), Space 단위 권한, Git 내보내기, 실시간 공동 편집·동시 편집 표시(D-43 유지), PR별 Preview 배포(D-38 유지), Confluence·Notion 가져오기

## 4. 진행 순서

**안전장치(버전)를 먼저** 만든다. 에이전트 쓰기가 늘어날수록 가치가 커지고, 이후 Step(알림의 "무엇이 바뀌었나", 의미 검색의 재색인)이 버전·저장 이벤트를 재사용한다.

```
Step 0          Step 1              Step 2               Step 3             Step 4                Step 5
정비             버전 히스토리          알림                  외부 전달            의미 검색               마무리
──────          ──────────          ──────────           ──────────         ──────────            ──────
A0 마이그 계획    V1 버전 기록          N1 알림 모델·API        W1 Webhook 모델·API  E1 청크·임베딩 파이프라인   Z1 E2E 추가
A1 에이전트       V2 변경 기록 API·MCP  N2 Watch               W2 전달(서명·기록)     E2 저장 시 재색인        Z2 CPU·한도 실측
   이름 변경      V3 diff·복원 UI       N3 @멘션               W3 Slack 형식         E3 백필(청크 단위)        Z3 문서 갱신
A2 저장 이벤트    V4 보관·정리           N4 알림 UI(벨)          W4 설정 화면           E4 검색 API·MCP·UI      Z4 Exit 점검
   훅·큐                              N5 묶기·에이전트 필터                         E5 품질 확인(한국어)
```

- 각 Step은 커밋 단위로 나누고, Step이 끝날 때마다 사용자 요청 시 push해 운영에서 확인한다 (Phase 1·2와 같음).
- **A2 저장 이벤트 훅·큐**: 저장 파이프라인이 끝난 뒤 "무엇이 바뀌었나"(페이지, 이전·새 revision, actor, 바뀐 섹션)를 한곳에서 넘겨받아 버전·알림·Webhook·색인이 각자 처리한다. 네 기능이 저장 코드를 각자 건드리지 않게 한다. CPU가 드는 뒤처리(색인, Webhook 전달)는 **Cloudflare Queues**로 넘겨 별도 실행으로 돌린다 — `waitUntil` 안의 CPU도 저장 요청의 10ms에 포함되기 때문이다(§7).
- Step 2(알림)와 Step 3(외부 전달)은 같은 이벤트를 쓰지만 서로 독립이다. Step 4(의미 검색)는 무료 한도 확인(E5)에 따라 범위를 줄일 수 있어 가장 뒤에 둔다.

## 5. 작업 상세

### Step 0 — 정비 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| A0 | 마이그레이션 계획 | `0008_revisions`, `0009_notifications`, `0010_webhooks`, `0011_chunks`를 Step별로 추가. 휴지통 영구 삭제(`services/trash.ts`)와 테스트 `resetDb`에 새 테이블 반영 |
| A1 | 에이전트 이름 변경 | `PATCH /admin/actors/{id}`에 `name`(에이전트만, 1~64자). 관리 화면의 에이전트 행에서 이름 수정. 이름은 조회 때 조인하므로 기존 기록에도 바로 반영 |
| A2 | 저장 이벤트 훅·큐 | `SaveEvent { page, fromRevision, toRevision, actor, changedSections, kind: create \| update \| rename \| restore \| delete }`. 저장·섹션 편집·속성 변경·링크 자동 수정·삭제·복원이 모두 같은 이벤트를 낸다. 가벼운 처리(R2 버전 쓰기)는 `waitUntil`, CPU가 드는 처리(색인, Webhook)는 Queue `clavis-events`에 메시지 1개(`send`)로 넘기고 같은 Worker의 `queue()` 소비자가 처리. 로컬·테스트는 Miniflare 큐 |

### Step 1 — 버전 히스토리 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| V1 | 버전 기록 | 저장 쓰기 batch에 `page_revisions`(페이지, revision, actor, 시각, 바이트 수, 제목, 종류) insert 1문장 추가 — **D1 호출 수는 그대로 2회**. 본문은 응답 뒤(`waitUntil`) R2 `rev/{pageId}/{revision}.md`에 쓴다(R2 put 1회). 제목 변경으로 고쳐진 다른 문서(최대 50개)도 각각 버전이 남는다 |
| V2 | 변경 기록 API·MCP | `GET /pages/{ref}/revisions?cursor=`(목록), `GET /pages/{ref}/revisions/{n}`(원문, `.md`도), MCP `list_revisions`·`read_revision`. Phase 3 이전 버전은 없다 — 목록 맨 끝에 "기록 시작 전" 표시 |
| V3 | diff·복원 | 웹: 페이지 메뉴의 **변경 기록** → 목록, 두 버전 선택 → 줄 단위 diff(브라우저에서 계산, 서버 CPU 없음), **이 버전으로 복원**. 복원 = 그 버전 본문을 새 revision으로 저장(일반 저장 파이프라인: lint·링크·409 가드). REST `POST /pages/{ref}/revisions/{n}/restore`, MCP `restore_revision`(editor) |
| V4 | 보관·정리 | D-55대로 보관. 페이지 영구 삭제(휴지통 30일) 때 R2 버전도 함께 지운다(백업 Cron처럼 나눠서). 야간 백업(D-30)과 역할 구분을 운영 문서에 적는다 |

### Step 2 — 알림 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| N1 | 알림 모델·API | `notifications`(받는 사람, 종류, 페이지, 댓글, 보낸 actor, 개수, 처음·마지막 시각, 읽은 시각). 저장·댓글 쓰기 batch 안에서 `json_each`로 받는 사람 전원에게 한 문장으로 upsert — D1 호출은 늘지 않는다. `GET /me/notifications`, `POST /me/notifications/read`(전부 또는 id) |
| N2 | Watch | `watches(actor, page)`. 자동: 페이지를 만들거나 담당(owner)이거나 댓글을 단 사람. 수동: 페이지의 **지켜보기** 버튼(끄기 포함). 에이전트는 Watch 알림을 받지 않고 **멘션만** 받는다(D-59) — MCP `list_notifications`로 읽고 `mark_notifications_read`로 처리 |
| N3 | @멘션 | 댓글 입력에서 `@` → 사람·에이전트 자동완성, 저장 형태는 `@[이름](actor:ID)`(이름이 바뀌어도 유지), 렌더링은 `@이름` 칩. 멘션된 사람에게 알림 |
| N4 | 알림 UI | 헤더 벨 + 안 읽은 수(홈 조회 batch에 포함, 추가 요청 없음), 목록(종류별 아이콘, 🧑/🤖), 누르면 해당 페이지·댓글·**변경 기록 diff**로 이동, 모두 읽음 |
| N5 | 묶기·필터 | 같은 사람·같은 페이지·같은 종류의 **안 읽은** 알림은 새 행 대신 개수와 마지막 시각만 올린다("Adam이 5번 수정"). 설정: 에이전트 변경 알림 끄기 |

### Step 3 — 외부 전달 🤖 (Slack 채널 준비는 사용자)

| ID | 작업 | 완료 기준 |
|---|---|---|
| W1 | Webhook 모델·API | `webhooks`(Space, 종류 slack \| json, URL, 비밀 키, 이벤트 목록, 켜짐), `webhook_deliveries`(최근 N건: 시각, 이벤트, 상태 코드, 오류). admin만. `GET/POST/PATCH/DELETE /spaces/{key}/webhooks` |
| W2 | 전달 | 저장·댓글 이벤트 → Queue → 소비자가 해당 Space의 Webhook마다 `fetch` 1회. JSON 본문 + `X-Clavis-Signature`(HMAC-SHA256) + `X-Clavis-Event`. 5xx·시간 초과는 큐 재시도(최대 3회, 간격을 늘림), 결과는 `webhook_deliveries`에 기록(D-60). 이벤트: `page.created`·`page.updated`(diff 링크 포함)·`page.deleted`·`comment.created`·`comment.resolved` |
| W3 | Slack 형식 | Slack Incoming Webhook용 짧은 메시지: "🤖 Adam이 *결제 API 설계*를 고쳤습니다 (+12 −3줄) · 변경 보기". 에이전트 연속 수정은 5분 안의 같은 페이지를 한 메시지로 |
| W4 | 설정 화면 | Space 설정에 **알림 채널** 탭: 추가·수정·삭제, **테스트 전송**, 최근 전달 기록 |

### Step 4 — 의미 검색 🤖

| ID | 작업 | 완료 기준 |
|---|---|---|
| E1 | 청크·임베딩 | 청크 = **H2 섹션**(Phase 2 섹션 파서 재사용, H3 이하는 H2에 포함), H2가 없거나 긴 섹션은 약 2,000자로 나누고 제목 경로("페이지 › 섹션")를 앞에 붙인다(D-63). `page_chunks`(페이지, 청크 id, 섹션 id, 해시, 바이트). 모델은 `@cf/baai/bge-m3`(1024차원, D-61). Vectorize 메타데이터 인덱스: `space`, `docType`(삽입 전에 만들어야 함) |
| E2 | 저장 시 재색인 | 저장 이벤트 → Queue → 소비자가 **해시가 바뀐 청크만** 임베딩해 Vectorize upsert, 사라진 청크는 삭제(D-62). 메시지 하나가 다루는 청크 수는 CPU 실측으로 정한다(시작값 8개, 넘으면 다음 메시지로 이어서). 삭제·휴지통·복원도 반영. Vectorize 반영은 몇 초 늦을 수 있다(비동기) |
| E3 | 백필 | 기존 페이지는 관리 화면의 **색인 만들기**가 페이지마다 큐 메시지를 넣어 소비자가 차례로 처리(재검사 L4처럼 진행률 표시). 지금 운영 문서(수십 개)는 수십만 토큰 이하로 Workers AI 하루 무료량(약 900만 토큰)의 몇 %뿐이다(§7) |
| E4 | 검색 API·MCP·UI | `GET /search?mode=semantic\|hybrid`: 질의 임베딩 1회 + Vectorize 조회 1회 + D1에서 페이지·섹션 정보 1회. hybrid는 전문 검색 결과와 순위를 합친다(RRF, 재순위 모델 없음 — 한국어 reranker가 없다). MCP `semantic_search`(결과 = 페이지·섹션 id·요약 — 에이전트가 `read_section`으로 이어 읽음). 검색 화면에 **뜻으로 찾기** 토글 |
| E5 | 품질 확인 | 운영 문서로 한국어 질의 10개 정도의 결과를 사용자와 같이 보고, 청크 크기·hybrid 가중치를 조정 |

### Step 5 — 마무리 🤝

| ID | 작업 | 완료 기준 |
|---|---|---|
| Z1 | E2E 추가 | 변경 기록 → diff → 복원, 알림(댓글·멘션 → 벨 → 이동), Webhook 설정·테스트 전송(로컬 수신 서버). 기존 테스트에 합쳐 전체 9~10개 유지 |
| Z2 | CPU·한도 실측 | Phase 2 Z2와 같은 방식 + Workers AI·Vectorize·R2 사용량 확인 → §9에 기록 |
| Z3 | 문서 갱신 | `01-architecture.md` v0.5, `guides/writing.md`(변경 기록·알림·의미 검색), `guides/agent-connection.md`(새 도구, Webhook 수신 방법) |
| Z4 | Exit 점검 | §2 체크리스트, 사용자와 실제로 한 번 써 보기 |

## 6. 역할 분담

| 표시 | 의미 |
|---|---|
| 🤖 | Claude가 진행 |
| 👤 | 사용자 작업 |
| 🤝 | 사용자 확인 후 Claude가 진행 |

| # | 사용자 작업 | 시점 |
|---|---|---|
| U1 | §8 결정 사항 검토 | 시작 전 |
| U2 | Adam으로 문서를 크게 고친 뒤 변경 기록에서 비교·복원해 보기 | Step 1 후 |
| U3 | Slack 채널에 Incoming Webhook 만들기(URL은 설정 화면에 직접 입력 — 채팅에 붙이지 않음) | Step 3 전 |
| U4 | 의미 검색 품질 확인용 질의 10개 정도 준비 (E5) | Step 4 중 |

## 7. 무료 플랜 예산

한도는 2026-09-28 Cloudflare 공식 문서로 확인했다. 요청 1회(또는 큐 메시지 1개) 기준:

| 요청 | D1·R2·AI·외부 호출 | CPU 목표 | 비고 |
|---|---|---|---|
| 페이지·섹션 저장 + 버전 기록 | D1 2 (그대로) + R2 put 1 + Queue send 1 | < 8 / < 9ms (100KB) | 버전 메타는 쓰기 batch의 문장 1개, 본문 R2 쓰기는 `waitUntil`(이미 메모리에 있는 문자열) |
| 버전 목록 | D1 1 | < 3ms | |
| 버전 원문 | D1 1 + R2 get 1 | < 3ms (100KB) | diff는 브라우저에서 계산 |
| 복원 | R2 get 1 + 일반 저장 | < 9ms | |
| 알림 목록 · 안 읽은 수 | D1 1 (홈 batch에 포함) | < 3ms | |
| 댓글 작성 + 알림 | D1 (그대로) + Queue send 1 | < 4ms | 받는 사람 전원을 `json_each` 한 문장으로 |
| Webhook 전달 (큐 메시지 1개) | D1 1~2 + fetch Webhook 수 | < 5ms | 외부 fetch는 요청당 50개까지 |
| 색인 (큐 메시지 1개, 청크 ≤ 8) | D1 1~2 + AI 1 + Vectorize 1~2 | < 8ms | **가장 빠듯한 처리** — 벡터 JSON(1024개 숫자 × 청크) 처리가 CPU를 쓴다. Z2에서 청크 수 조정 |
| 의미 검색 | AI 1 + Vectorize 1 + D1 1 | < 5ms | topK 20, 값(values)은 받지 않음 |

**`waitUntil`도 공짜가 아니다**: 응답 뒤 작업의 CPU도 같은 요청의 10ms에 들어간다(네트워크 대기만 빠짐). 그래서 저장 요청에는 R2 쓰기와 큐 전송처럼 CPU가 거의 들지 않는 일만 남기고, 나머지는 큐 소비자가 **별도 실행**(각자 10ms)으로 처리한다.

하루·한 달 한도:

| 서비스 | 무료 한도 | 예상 사용 (10명, 문서 500건) | 판단 |
|---|---|---|---|
| Workers AI | 10,000 neurons/일 (넘으면 오류, 과금 없음) | bge-m3 = 1M 토큰당 1,075 neurons → 하루 약 900만 토큰. 백필 500건 × 10KB(한국어 약 2,000~3,000토큰) ≈ 100~150만 토큰(하루 안), 평소 저장·검색은 수만 토큰 | 충분. 백필이 한도에 걸리면 다음 날 이어서 |
| Vectorize 저장 | 500만 차원 = 1024차원 벡터 약 **4,880개** | 500페이지 × H2 섹션 평균 6~8개 ≈ 3,000~4,000개 | **가장 빠듯함**. H2 단위 청크(D-63)로 수를 억제, 80%를 넘으면 관리 화면에 경고 |
| Vectorize 조회 | 3,000만 차원/월 = 약 29,000회 | 하루 수백 회 | 충분 |
| Queues | 10,000 작업/일 (메시지 1개 ≈ 3작업), 보관 24시간 | 저장 200회 × (색인 1 + Webhook 1~2) ≈ 600~900 메시지/일 ≈ 2,000~2,700작업 | 충분. 백필은 하루 ~2,000페이지까지 |
| R2 | 저장 10GB, 쓰기(Class A) 100만/월 | 버전: 저장 200회/일 × 평균 10KB = 2MB/일 ≈ 0.7GB/년 | 충분 |
| 이메일 | 임의 수신자 발송은 **유료 전용** (계정의 확인된 주소로만 무료) | – | 제외 (D-58) |
| Cron | 계정당 5개 (1개 사용 중) | 버전 정리는 기존 야간 Cron에 합침 | 추가 없음 |

- 한도를 넘으면 무료 플랜은 과금 대신 **실패**한다. 의미 검색이 실패하면 전문 검색으로 자동 대체하고, 색인 실패는 큐 재시도 후 "색인 대기"로 남겨 다음 날 이어서 처리한다.
- 유료 전환($5/월) 기준: Vectorize 벡터 4,000개(80%)를 넘거나, 팀이 이메일 알림을 원할 때.

## 8. 결정 사항

아래 추천안을 모두 채택했다 (2026-09-28, [`decisions.md`](./decisions.md) D-54~D-63).

| ID | 주제 | 추천안 | 대안 |
|---|---|---|---|
| D-54 | 편집 안전장치 (D-21 개정) | **저장마다 전체 본문 스냅샷**: 본문은 R2 `rev/{pageId}/{revision}.md`, 목록은 D1 `page_revisions`. 복원·비교가 단순하고 D1 500MB를 쓰지 않는다 | D1에 본문 저장(용량 압박) / diff만 저장(복원할 때 CPU·복잡도) / 지금처럼 휴지통 + 야간 백업(하루 단위, 14일)만 |
| D-55 | 버전 보관 | **전부 보관**, 페이지 영구 삭제 때 함께 삭제. 예상 0.7GB/년으로 R2 무료 10GB 안 | 최근 100개 / 1년 지난 버전 정리 |
| D-56 | 복원 방식 | **복원 = 옛 본문을 새 revision으로 저장** (기록이 남고, lint·링크·409 가드를 그대로 거침) | 되감기(이후 버전 삭제) |
| D-57 | 알림 대상 | **내 문서(만든·담당) 새 댓글, 내 스레드 답글, `@멘션`, 지켜보는 문서의 변경**. 같은 사람·페이지·종류의 안 읽은 알림은 한 건으로 묶음 | 멘션과 답글만(Watch 없음) / 모든 변경을 개별 알림 |
| D-58 | 알림 채널 | **앱 안 알림 + Space별 Slack·Webhook**. 이메일은 제외(무료 플랜은 확인된 주소로만 발송 가능) | 확인된 주소(관리자 본인)로만 이메일 요약 / Workers Paid로 전환해 이메일 |
| D-59 | 에이전트와 알림 | **에이전트는 `@멘션`만 받고 MCP `list_notifications`로 읽는다** ("@Adam 이 섹션 정리해 줘" → Adam이 확인 후 처리). Watch 알림은 받지 않음 | 에이전트는 알림 없음(댓글만) / 사람과 똑같이 |
| D-60 | 외부 전달 방식 | **Queues로 전달, 실패 시 최대 3회 재시도, 결과 기록**. 무료 한도 안(§7) | `waitUntil`에서 1회만(재시도 없음, 저장 요청 CPU 사용) |
| D-61 | 임베딩 모델 | **`@cf/baai/bge-m3`** — 다국어(한국어), 1024차원, 긴 입력(60k 토큰), 가장 싼 축. 재순위 모델은 쓰지 않음(유일한 reranker가 영어·중국어용) | `@cf/qwen/qwen3-embedding-0.6b`(같은 가격, 8k 토큰) / `embeddinggemma-300m`(beta) |
| D-62 | 색인 시점 | **저장 이벤트 → Queue 소비자**가 바뀐 청크만 색인 (저장 요청 CPU와 분리, 몇 초 뒤 검색에 반영) | 저장 요청의 `waitUntil`(CPU 10ms 초과 위험) / 야간 Cron만(하루 늦음) |
| D-63 | 청크 단위 | **H2 섹션 단위**(긴 섹션·H2 없는 문서는 약 2,000자로 분할) — 벡터 수를 무료 한도(약 4,880개) 안에 두면서 `read_section`과 이어진다 | H3까지 세분(정확도↑, 벡터 수 2~3배) / 문서 하나당 벡터 1개(수↓, 긴 문서 검색 품질↓) |

## 9. 결과 기록

| 항목 | 상태 | 결과 | 날짜 |
|---|---|---|---|
| Step 0 | ✅ 완료 | **A0** 마이그레이션은 Step별로 추가(Step 0은 스키마 변경 없음). **A1** `PATCH /admin/actors/{id}`에 `name`(에이전트만 — 사람은 400 `invalid-name`), 관리 화면 에이전트 행의 연필 버튼으로 이름 변경. **A2** `src/events`: 서비스가 `PageEvent`(`page.saved` — `create`·`update`·`link-rewrite`, `page.trashed`, `page.restored`)를 내고, 요청은 `eventSink`로 받아 응답 뒤 Queue `clavis-events`에 본문 없는 메시지를 보낸다. 쓰기 서비스의 마지막 인자는 `{ now, emit }`(섹션 편집·속성 변경은 `emit`을 `updatePage`로 넘김). 제목 변경으로 실제 고쳐진 문서마다 `link-rewrite` 이벤트(`countRewritten` → `rewrittenIds`). 실패한 쓰기는 이벤트 없음, 큐 전송 실패는 로그만(쓰기는 성공). 소비자 `consumeEvents`는 등록된 처리기(`EVENT_HANDLERS`, 지금은 비어 있음)를 메시지마다 실행하고 실패한 메시지만 재시도(최대 3회). REST·MCP 모든 쓰기 경로 연결(이동은 이벤트 없음). Worker 테스트 115개(이벤트 4개 추가), E2E 9개(`wrangler dev`에서 큐 바인딩 동작) | 2026-09-28 |
| Step 1 | ✅ 완료 | `0008_revisions`(`page_revisions`: 페이지·revision·actor·시각·제목·바이트·종류·`restored_from`). **V1** 생성·수정의 쓰기 batch에 버전 행 문장 추가(D1 호출은 그대로 2회), 본문은 응답 뒤 `eventSink`가 R2 `rev/{pageId}/{revision}.md`에 쓴다. 기록이 없던 페이지(Phase 3 이전)는 다음 저장 때 읽기 batch가 옛 본문을 한 번 가져와 `baseline` 버전으로 남긴다 — 별도 백필 불필요. 제목 변경으로 고쳐진 문서도 `baseline`·`link-rewrite` 버전. **V2** `GET /pages/{ref}/revisions?before=&limit=`(`historyStart`로 기록 시작 표시), `GET …/revisions/{n}`(현재 버전은 페이지 행에서 — R2 쓰기 전에도 읽힘), MCP `list_revisions`·`read_revision`, instructions에 되돌리기 안내. **V3** `POST …/revisions/{n}/restore`(`baseRevision` 선택, 현재 버전이면 400, 옛 본문이 지금 규칙에 걸리면 422), MCP `restore_revision`. 웹: 페이지 메뉴 **변경 기록** → `/s/$key/p/$slugId/history`(버전 목록·🧑/🤖·종류, 선택한 버전과 이전 버전의 줄 diff를 브라우저에서 계산(`diff` 패키지, 변경 없는 줄 접기), 비교 대상 선택, 복원 확인 대화상자). **V4** 휴지통 영구 삭제 때 버전 행과 R2 본문도 삭제(키는 D1 행에서 계산, 1,000개씩). 덤: 1분 미만 상대 시각이 "현재 분"으로 나오던 것을 "지금"으로. Worker 테스트 121개(버전 5개 + MCP 1개), web 27개, E2E 9개(충돌 테스트에 변경 기록 → diff → 복원 추가) | 2026-09-28 |
| Step 2 | ✅ 완료 (배포 대기) | **계획과 다른 점**: 알림 행을 저장·댓글 쓰기 batch가 아니라 **큐 소비자**가 만든다(`services/notifications.ts`의 `notifyOnEvent`, `events/handlers.ts`에 등록) — 받는 사람 계산이 저장 요청의 CPU·D1을 쓰지 않고, 몇 초 늦는 대신 저장 코드를 건드리지 않는다. `0009_notifications`(`notifications`, `watches`, `actors.mute_agent_edits`). **N1** 받는 사람 계산과 upsert가 SQL 한 문장: 안 읽은 알림은 부분 유니크 인덱스(`recipient, kind, page WHERE read_at IS NULL`) + `ON CONFLICT DO UPDATE`로 한 행에 묶여 개수·마지막 actor·to_revision만 오른다(**N5**). 읽은 알림은 30일 뒤 야간 Cron이 지우고, 휴지통 영구 삭제 때 함께 삭제, 휴지통의 페이지 알림은 목록에서 숨김. `GET /me/notifications`(`unread`·`kind`·`limit`), `POST /me/notifications/read`, `PUT /me/notifications/settings`(에이전트 수정 알림 끄기). **N2** 자동 지켜보기는 저장하지 않고 계산(만든 사람, frontmatter `owner`의 이메일·이름, 댓글 단 사람), `watches`에는 명시적 지켜보기·끄기만. `GET/PUT /pages/{ref}/watch`, 페이지 메뉴에 지켜보는 이유와 지켜보기·알림 끄기·다시 받기. **N3** `@[이름](actor:ID)`(이름 바뀌어도 유지) + 손으로 쓴 `@이름`도 이름으로 인정(`shared/markdown/mentions`), 멘션된 사람은 같은 댓글을 '새 댓글'로 또 받지 않음, 댓글 입력의 `@` 자동완성(`GET /actors`), 멘션 칩 표시. 에이전트는 멘션만 받는다(D-59): MCP `list_notifications`·`mark_notifications_read`, instructions에 "멘션 → 처리 → 답글 → 읽음" 흐름. **N4** 헤더 벨(안 읽은 수, 60초마다 갱신), 알림 → 문서 수정은 변경 기록 diff(`?r=&base=`), 댓글·멘션은 페이지 댓글로. 댓글도 이벤트를 낸다(`comment.created`·`resolved`·`reopened`, Step 3 Webhook이 쓴다). 덤: 변경 기록 화면의 이중 여백 수정. shared 63 · web 27 · worker 126(알림 5개), E2E 9개(댓글 테스트에 멘션 자동완성·칩, 에이전트 수정 → 벨 → diff 추가 — 로컬 큐 소비자로 실제 동작 확인) | 2026-09-28 |
| Step 3 | – | | |
| Step 4 | – | | |
| Step 5 | – | | |
