CREATE TABLE deadlines (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
    CHECK (
      length(trim(name)) > 0
      AND length(name) <= 160
      AND name = trim(name)
    ),
  deadline_workday TEXT NOT NULL
    CHECK (
      length(deadline_workday) = 10
      AND deadline_workday GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
    CHECK (completed_at IS NULL OR completed_at >= 0)
) STRICT;

CREATE INDEX deadlines_completion_date_index
  ON deadlines(completed_at, deadline_workday, id);
