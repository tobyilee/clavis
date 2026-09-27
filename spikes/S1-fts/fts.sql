-- S1: FTS5 trigram for Korean, external-content table synced by triggers.
DROP TABLE IF EXISTS s1_pages;
DROP TABLE IF EXISTS s1_fts;
CREATE TABLE s1_pages (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, deleted_at INTEGER);
CREATE VIRTUAL TABLE s1_fts USING fts5(title, content, content='s1_pages', content_rowid='rowid', tokenize='trigram');
CREATE TRIGGER s1_ai AFTER INSERT ON s1_pages BEGIN
  INSERT INTO s1_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
CREATE TRIGGER s1_ad AFTER DELETE ON s1_pages BEGIN
  INSERT INTO s1_fts(s1_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
END;
CREATE TRIGGER s1_au AFTER UPDATE OF title, content ON s1_pages BEGIN
  INSERT INTO s1_fts(s1_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
  INSERT INTO s1_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

INSERT INTO s1_pages (id, title, content) VALUES
 ('p1', '결제 API 설계', '---\ntype: spec\nstatus: approved\nowner: toby\n---\n## 개요\n결제 승인과 취소를 처리하는 REST API를 설계한다. PG사 연동은 비동기로 처리한다.'),
 ('p2', '환불 정책', '---\ntype: prd\nstatus: draft\nowner: kim\n---\n## 배경\n고객이 결제 후 7일 이내 환불을 요청하면 전액 환불한다. 부분환불은 지원하지 않는다.'),
 ('p3', 'ADR-001 데이터베이스 선택', '## Context\nPostgreSQL과 SQLite를 비교했다.\n## Decision\nCloudflare D1을 사용한다.'),
 ('p4', '회의록 2026-09-20', '## 참석자\n토비, 김개발\n## 결정 사항\n결제모듈 리팩터링은 다음 스프린트에 진행한다.');
