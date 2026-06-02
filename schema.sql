PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recurrences (
    id          TEXT    PRIMARY KEY,
    freq        TEXT    NOT NULL CHECK (freq IN ('daily', 'weekly', 'monthly')),
    interval    INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
    end_date    TEXT,
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
    id              TEXT    PRIMARY KEY,
    text            TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'wip', 'done')),
    priority        TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    date            TEXT,
    time            TEXT,
    memo            TEXT,
    done_at         TEXT,
    recurrence_id   TEXT    REFERENCES recurrences(id) ON DELETE SET NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_date     ON todos(date);
CREATE INDEX IF NOT EXISTS idx_todos_status   ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);

CREATE TABLE IF NOT EXISTS tags (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    color       TEXT    NOT NULL DEFAULT '#888888',
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id     TEXT    NOT NULL REFERENCES todos(id)  ON DELETE CASCADE,
    tag_id      TEXT    NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_todo_tags_tag ON todo_tags(tag_id);

CREATE TRIGGER IF NOT EXISTS trg_todos_updated_at
    AFTER UPDATE ON todos FOR EACH ROW
BEGIN
    UPDATE todos SET updated_at = CAST(strftime('%s','now') * 1000 AS INTEGER) WHERE id = OLD.id;
END;
