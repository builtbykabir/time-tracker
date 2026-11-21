CREATE TABLE todos (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
    CHECK (
      length(trim(name)) > 0
      AND length(name) <= 160
      AND name = trim(name)
    ),
  description TEXT
    CHECK (
      description IS NULL
      OR (
        length(description) <= 5000
        AND description = trim(description)
      )
    ),
  due_at INTEGER
    CHECK (due_at IS NULL OR due_at >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
    CHECK (done IN (0, 1)),
  category_id INTEGER,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX todos_category_id_index
  ON todos(category_id);

CREATE INDEX todos_done_due_at_index
  ON todos(done, due_at);

CREATE TRIGGER todos_reject_archived_category_insert
BEFORE INSERT ON todos
WHEN NEW.category_id IS NOT NULL AND (
  SELECT archived
  FROM categories
  WHERE id = NEW.category_id
) = 1
BEGIN
  SELECT RAISE(ABORT, 'cannot assign a todo to an archived category');
END;

CREATE TRIGGER todos_reject_archived_category_update
BEFORE UPDATE OF category_id ON todos
WHEN NEW.category_id IS NOT NULL AND (
  SELECT archived
  FROM categories
  WHERE id = NEW.category_id
) = 1
BEGIN
  SELECT RAISE(ABORT, 'cannot assign a todo to an archived category');
END;
