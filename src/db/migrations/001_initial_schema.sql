CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(trim(name)) > 0 AND name = trim(name)),
  created_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
    CHECK (archived IN (0, 1))
) STRICT;

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
) STRICT;

CREATE INDEX sessions_category_id_index
  ON sessions(category_id);

CREATE INDEX sessions_started_at_index
  ON sessions(started_at);

CREATE UNIQUE INDEX sessions_one_active_index
  ON sessions((1))
  WHERE ended_at IS NULL;

CREATE TRIGGER sessions_reject_archived_category_insert
BEFORE INSERT ON sessions
WHEN (
  SELECT archived
  FROM categories
  WHERE id = NEW.category_id
) = 1
BEGIN
  SELECT RAISE(ABORT, 'cannot create a session for an archived category');
END;

CREATE TRIGGER sessions_reject_archived_category_update
BEFORE UPDATE OF category_id ON sessions
WHEN (
  SELECT archived
  FROM categories
  WHERE id = NEW.category_id
) = 1
BEGIN
  SELECT RAISE(ABORT, 'cannot assign a session to an archived category');
END;
