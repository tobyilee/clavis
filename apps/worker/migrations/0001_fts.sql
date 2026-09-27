-- Full-text search (D-11, spike S1). An external-content FTS5 table: the text lives only in
-- `pages`, and triggers keep the index in sync. The trigram tokenizer gives Korean substring
-- matching for queries of 3+ characters; shorter queries fall back to LIKE in the service.
-- Trashed pages stay indexed and are filtered by `deleted_at` at query time, so restoring a
-- page needs no reindexing. The index is derived data: backups skip it and a restore runs
-- INSERT INTO pages_fts(pages_fts) VALUES ('rebuild').
CREATE VIRTUAL TABLE `pages_fts` USING fts5(
	title, content,
	content='pages', content_rowid='rowid',
	tokenize='trigram'
);
--> statement-breakpoint
CREATE TRIGGER `pages_fts_ai` AFTER INSERT ON `pages` BEGIN
	INSERT INTO pages_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
--> statement-breakpoint
CREATE TRIGGER `pages_fts_ad` AFTER DELETE ON `pages` BEGIN
	INSERT INTO pages_fts(pages_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
END;
--> statement-breakpoint
CREATE TRIGGER `pages_fts_au` AFTER UPDATE OF title, content ON `pages` BEGIN
	INSERT INTO pages_fts(pages_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
	INSERT INTO pages_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
--> statement-breakpoint
INSERT INTO pages_fts(pages_fts) VALUES ('rebuild');
