import { mkdirSync } from "fs";
import path from "path";
// node:sqlite ships with Node 22.13+ and Node 24 (no native build step).
import { DatabaseSync } from "node:sqlite";

/**
 * Part F: data model. Raw observations (ai_run, check_result evidence) are stored separately from
 * results and labels. Immutability is enforced in the database with triggers:
 * - fact_list rows, ai_run rows and check_result rows are never updated or deleted;
 * - a FROZEN question_set and its questions are never updated;
 * - labels are append-only (a new human label is a new row).
 */
export const SCHEMA_VERSION = 1;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS business (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  current_fact_list_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_list (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  UNIQUE (business_id, version)
);
CREATE TRIGGER IF NOT EXISTS fact_list_no_update BEFORE UPDATE ON fact_list BEGIN SELECT RAISE(ABORT, 'fact_list versions are immutable; create a new version'); END;
CREATE TRIGGER IF NOT EXISTS fact_list_no_delete BEFORE DELETE ON fact_list BEGIN SELECT RAISE(ABORT, 'fact_list versions are immutable'); END;

CREATE TABLE IF NOT EXISTS site_check_run (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  fact_list_version INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  check_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','DONE','ERROR')),
  config TEXT NOT NULL,
  meta TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS check_result (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES site_check_run(id),
  check_id TEXT NOT NULL,
  page_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('PASS','FAIL','NOT_ASSESSED','NOT_APPLICABLE')),
  reason TEXT NOT NULL,
  evidence TEXT NOT NULL,
  next_step TEXT,
  check_version TEXT NOT NULL,
  position INTEGER NOT NULL,
  CHECK (status NOT IN ('NOT_ASSESSED','NOT_APPLICABLE') OR (length(reason) > 0 AND next_step IS NOT NULL AND length(next_step) > 0))
);
CREATE INDEX IF NOT EXISTS check_result_run ON check_result(run_id);
CREATE TRIGGER IF NOT EXISTS check_result_no_update BEFORE UPDATE ON check_result BEGIN SELECT RAISE(ABORT, 'check results are immutable'); END;

CREATE TABLE IF NOT EXISTS question_set (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  version TEXT,
  version_no INTEGER,
  status TEXT NOT NULL CHECK (status IN ('CANDIDATE','APPROVED','FROZEN')),
  created_at TEXT NOT NULL,
  frozen_at TEXT,
  frozen_by TEXT,
  parent_set_id TEXT REFERENCES question_set(id),
  fact_list_version INTEGER NOT NULL,
  generation TEXT,
  UNIQUE (business_id, version_no)
);
CREATE TRIGGER IF NOT EXISTS question_set_frozen_immutable BEFORE UPDATE ON question_set WHEN OLD.status = 'FROZEN'
BEGIN SELECT RAISE(ABORT, 'frozen question sets are immutable; changes create a new version'); END;

CREATE TABLE IF NOT EXISTS question (
  id TEXT PRIMARY KEY,
  question_set_id TEXT NOT NULL REFERENCES question_set(id),
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('RECOMMEND','COMPARE','PRICE','HOWTO','PROBLEM')),
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CANDIDATE','APPROVED','REMOVED')),
  approved_by TEXT,
  approved_at TEXT,
  edited_by TEXT,
  edited_at TEXT,
  original_text TEXT NOT NULL,
  copied_from_question_id TEXT
);
CREATE INDEX IF NOT EXISTS question_set_idx ON question(question_set_id);
CREATE TRIGGER IF NOT EXISTS question_frozen_immutable BEFORE UPDATE ON question
WHEN (SELECT status FROM question_set WHERE id = OLD.question_set_id) = 'FROZEN'
BEGIN SELECT RAISE(ABORT, 'questions in a frozen set are immutable; changes create a new version'); END;
CREATE TRIGGER IF NOT EXISTS question_frozen_no_insert BEFORE INSERT ON question
WHEN (SELECT status FROM question_set WHERE id = NEW.question_set_id) = 'FROZEN'
BEGIN SELECT RAISE(ABORT, 'cannot add questions to a frozen set; changes create a new version'); END;

CREATE TABLE IF NOT EXISTS ai_run_batch (
  id TEXT PRIMARY KEY,
  question_set_id TEXT NOT NULL REFERENCES question_set(id),
  fact_list_version INTEGER NOT NULL,
  providers TEXT NOT NULL,
  settings TEXT NOT NULL,
  runs_per_question INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','DONE','ERROR')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS ai_run (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ai_run_batch(id),
  question_id TEXT NOT NULL REFERENCES question(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  settings TEXT NOT NULL,
  run_no INTEGER NOT NULL,
  attempt_no INTEGER NOT NULL,
  is_final INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('VALID','REFUSAL','ERROR','TIMEOUT')),
  http_status INTEGER,
  raw_response TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  finish_reason TEXT,
  error TEXT,
  needs_review INTEGER NOT NULL,
  review_reason TEXT,
  refusal_rules_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_run_batch_idx ON ai_run(batch_id);
CREATE TRIGGER IF NOT EXISTS ai_run_no_update BEFORE UPDATE ON ai_run BEGIN SELECT RAISE(ABORT, 'raw AI runs are immutable'); END;
CREATE TRIGGER IF NOT EXISTS ai_run_no_delete BEFORE DELETE ON ai_run BEGIN SELECT RAISE(ABORT, 'raw AI runs are immutable'); END;

CREATE TABLE IF NOT EXISTS ai_label (
  id TEXT PRIMARY KEY,
  ai_run_id TEXT NOT NULL REFERENCES ai_run(id),
  kind TEXT NOT NULL CHECK (kind IN ('auto','human')),
  mentioned TEXT NOT NULL CHECK (mentioned IN ('MENTIONED','NOT_MENTIONED','AMBIGUOUS')),
  recommended TEXT CHECK (recommended IN ('RECOMMENDED','NOT_RECOMMENDED')),
  accuracy TEXT CHECK (accuracy IN ('CORRECT','INCORRECT','UNVERIFIABLE')),
  rule_version TEXT NOT NULL,
  labeled_by TEXT NOT NULL,
  labeled_at TEXT NOT NULL,
  needs_review INTEGER NOT NULL,
  details TEXT NOT NULL,
  note TEXT,
  CHECK (kind = 'auto' OR mentioned <> 'AMBIGUOUS')
);
CREATE INDEX IF NOT EXISTS ai_label_run ON ai_label(ai_run_id);
CREATE TRIGGER IF NOT EXISTS ai_label_no_update BEFORE UPDATE ON ai_label BEGIN SELECT RAISE(ABORT, 'labels are append-only'); END;

CREATE TABLE IF NOT EXISTS change_event (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business(id),
  description TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  before_run_ids TEXT NOT NULL,
  after_run_ids TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT
);
`;

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  db.prepare("INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
  return db;
}

/** Runs fn inside a transaction. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
