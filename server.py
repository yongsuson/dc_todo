"""
My Todo — 로컬 API 서버
실행: python server.py
접속: http://localhost:8000
"""

import json
import sqlite3
import uuid
import time
import shutil
import glob
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote
import os

# Windows 기본 콘솔(cp949) 등에서도 이모지/한글 print가 서버를 죽이지 않도록 UTF-8 강제
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "todo.db")
BACKUP_DIR = os.path.join(BASE_DIR, "backups")
BACKUP_KEEP = 14  # 자동 백업 보관 개수 (오래된 것부터 삭제)
PORT = int(os.environ.get("PORT", 8000))  # 환경변수로 포트 변경 가능


# ── 백업 ─────────────────────────────────────────────
def _checkpoint_db():
    """WAL 내용을 본 DB 파일에 합쳐 백업본이 최신 상태가 되도록 함."""
    try:
        con = sqlite3.connect(DB_PATH)
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        con.close()
    except Exception as e:
        print(f"  ⚠️  체크포인트 실패: {e}")


def auto_backup():
    """서버 시작 시 날짜별 자동 백업 (같은 날은 1개, 오래된 백업 정리)."""
    if not os.path.exists(DB_PATH):
        return
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        _checkpoint_db()
        stamp = datetime.now().strftime("%Y%m%d")
        dest = os.path.join(BACKUP_DIR, f"todo_backup_{stamp}.db")
        shutil.copy2(DB_PATH, dest)
        # 오래된 백업 정리 (최근 BACKUP_KEEP개만 유지)
        backups = sorted(glob.glob(os.path.join(BACKUP_DIR, "todo_backup_*.db")))
        for old in backups[:-BACKUP_KEEP]:
            os.remove(old)
        print(f"  💾 자동 백업: {os.path.basename(dest)} (보관 {len(backups[-BACKUP_KEEP:])}개)")
    except Exception as e:
        print(f"  ⚠️  자동 백업 실패: {e}")


# ── DB 연결 ──────────────────────────────────────────
def get_db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA foreign_keys = ON")
    _ensure_extra_tables(con)
    return con


def _ensure_extra_tables(con):
    # 핵심 테이블(todos 등)이 없으면 schema.sql 적용 (새 PC 첫 실행 시)
    row = con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='todos'"
    ).fetchone()
    if row is None:
        schema_path = os.path.join(BASE_DIR, "schema.sql")
        with open(schema_path, encoding="utf-8") as f:
            con.executescript(f.read())
        con.commit()
    con.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id          TEXT    PRIMARY KEY,
            name        TEXT    NOT NULL,
            org         TEXT,
            title       TEXT,
            email       TEXT,
            phone       TEXT,
            memo        TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS mail_templates (
            id          TEXT    PRIMARY KEY,
            title       TEXT    NOT NULL,
            recipients  TEXT,
            subject     TEXT,
            body        TEXT,
            memo        TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS clients (
            id          TEXT    PRIMARY KEY,
            name        TEXT    NOT NULL UNIQUE,
            color       TEXT    NOT NULL DEFAULT '#888888',
            created_at  INTEGER NOT NULL
        )
    """)
    # todos에 client_id 컬럼 추가 (없을 경우에만)
    try:
        con.execute("ALTER TABLE todos ADD COLUMN client_id TEXT REFERENCES clients(id)")
        con.commit()
    except Exception:
        pass
    # daily_tasks에 client_id 컬럼 추가 (없을 경우에만)
    try:
        con.execute("ALTER TABLE daily_tasks ADD COLUMN client_id TEXT REFERENCES clients(id)")
        con.commit()
    except Exception:
        pass
    # 고객사는 사용자가 직접 추가 (고객사 관리 모달)
    con.execute("""
        CREATE TABLE IF NOT EXISTS daily_tasks (
            id          TEXT    PRIMARY KEY,
            text        TEXT    NOT NULL,
            checked     INTEGER NOT NULL DEFAULT 0,
            checked_date TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        )
    """)
    # 일일 업무 완료 히스토리 (리포트 집계용).
    # text·client_id를 함께 저장해 원본 일일 업무가 수정·삭제돼도 기록이 남음.
    con.execute("""
        CREATE TABLE IF NOT EXISTS daily_task_log (
            task_id     TEXT    NOT NULL,
            date        TEXT    NOT NULL,
            text        TEXT    NOT NULL,
            client_id   TEXT,
            done_at     INTEGER NOT NULL,
            PRIMARY KEY (task_id, date)
        )
    """)
    con.execute("CREATE INDEX IF NOT EXISTS idx_daily_log_date ON daily_task_log(date)")
    con.execute("""
        CREATE TABLE IF NOT EXISTS vacations (
            id          TEXT    PRIMARY KEY,
            date        TEXT    NOT NULL UNIQUE,
            memo        TEXT,
            created_at  INTEGER NOT NULL
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS procedures (
            id          TEXT    PRIMARY KEY,
            title       TEXT    NOT NULL,
            category    TEXT,
            steps       TEXT    NOT NULL DEFAULT '[]',
            memo        TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        )
    """)
    con.commit()


def now_ms():
    return int(time.time() * 1000)


def today_str():
    return time.strftime("%Y-%m-%d")


def new_id():
    return str(uuid.uuid4())


# ── 핸들러 ───────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        print(f"  {args[0]} {args[1]}")

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, msg, status=400):
        self.send_json({"error": msg}, status)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ── 정적 파일 서빙 ──
    def serve_static(self, path):
        if path == "/" or path == "":
            path = "/todo.html"
        # 한글 등 퍼센트 인코딩된 파일명(예: 퇴근.jpg) 디코딩
        path = unquote(path)
        file_path = os.path.dirname(__file__) + path
        if not os.path.exists(file_path):
            self.send_response(404)
            self.end_headers()
            return
        ext = os.path.splitext(file_path)[1].lower()
        mime = {
            ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
            ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
            ".ico": "image/x-icon",
        }.get(ext, "text/plain")
        # 텍스트 계열에만 charset을 붙이고, 이미지 등 바이너리는 그대로 전송
        content_type = mime + "; charset=utf-8" if mime.startswith("text/") else mime
        with open(file_path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        # ── 정적 파일 ──
        if not path.startswith("/api/"):
            self.serve_static(path)
            return

        # ── API ──
        try:
            if path == "/api/backup":
                self.download_backup()
            elif path == "/api/todos":
                self.get_todos(qs)
            elif path.startswith("/api/todos/"):
                tid = path.split("/")[3]
                self.get_todo(tid)
            elif path == "/api/tags":
                self.get_tags()
            elif path == "/api/contacts":
                self.get_contacts(qs)
            elif path.startswith("/api/contacts/"):
                cid = path.split("/")[3]
                self.get_contact(cid)
            elif path == "/api/mail-templates":
                self.get_mail_templates(qs)
            elif path.startswith("/api/mail-templates/"):
                mid = path.split("/")[3]
                self.get_mail_template(mid)
            elif path == "/api/procedures":
                self.get_procedures(qs)
            elif path.startswith("/api/procedures/"):
                pid = path.split("/")[3]
                self.get_procedure(pid)
            elif path == "/api/vacations":
                self.get_vacations(qs)
            elif path == "/api/daily-tasks":
                self.get_daily_tasks()
            elif path == "/api/daily-task-log":
                self.get_daily_task_log()
            elif path == "/api/clients":
                self.get_clients()
            else:
                self.send_error_json("Not found", 404)
        except Exception as e:
            self.send_error_json(str(e), 500)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self.read_body()
            if path == "/api/todos":
                self.create_todo(body)
            elif path == "/api/tags":
                self.create_tag(body)
            elif path == "/api/contacts":
                self.create_contact(body)
            elif path == "/api/mail-templates":
                self.create_mail_template(body)
            elif path == "/api/procedures":
                self.create_procedure(body)
            elif path == "/api/vacations":
                self.create_vacation(body)
            elif path == "/api/daily-tasks":
                self.create_daily_task(body)
            elif path == "/api/clients":
                self.create_client(body)
            else:
                self.send_error_json("Not found", 404)
        except Exception as e:
            self.send_error_json(str(e), 500)

    def do_PUT(self):
        path = urlparse(self.path).path
        try:
            body = self.read_body()
            if path.startswith("/api/todos/"):
                tid = path.split("/")[3]
                self.update_todo(tid, body)
            elif path.startswith("/api/tags/"):
                tag_id = path.split("/")[3]
                self.update_tag(tag_id, body)
            elif path.startswith("/api/contacts/"):
                cid = path.split("/")[3]
                self.update_contact(cid, body)
            elif path.startswith("/api/mail-templates/"):
                mid = path.split("/")[3]
                self.update_mail_template(mid, body)
            elif path.startswith("/api/procedures/"):
                pid = path.split("/")[3]
                self.update_procedure(pid, body)
            elif path.startswith("/api/daily-tasks/"):
                did = path.split("/")[3]
                self.update_daily_task(did, body)
            elif path.startswith("/api/clients/"):
                cid = path.split("/")[3]
                self.update_client(cid, body)
            else:
                self.send_error_json("Not found", 404)
        except Exception as e:
            self.send_error_json(str(e), 500)

    def do_DELETE(self):
        path = urlparse(self.path).path
        try:
            if path.startswith("/api/todos/"):
                tid = path.split("/")[3]
                self.delete_todo(tid)
            elif path.startswith("/api/tags/"):
                tag_id = path.split("/")[3]
                self.delete_tag(tag_id)
            elif path.startswith("/api/contacts/"):
                cid = path.split("/")[3]
                self.delete_contact(cid)
            elif path.startswith("/api/mail-templates/"):
                mid = path.split("/")[3]
                self.delete_mail_template(mid)
            elif path.startswith("/api/procedures/"):
                pid = path.split("/")[3]
                self.delete_procedure(pid)
            elif path.startswith("/api/vacations/"):
                date = path.split("/")[3]
                self.delete_vacation(date)
            elif path.startswith("/api/daily-tasks/"):
                did = path.split("/")[3]
                self.delete_daily_task(did)
            elif path.startswith("/api/clients/"):
                cid = path.split("/")[3]
                self.delete_client(cid)
            else:
                self.send_error_json("Not found", 404)
        except Exception as e:
            self.send_error_json(str(e), 500)

    # ── TODOS ────────────────────────────────────────

    def get_todos(self, qs):
        con = get_db()
        try:
            where, params = [], []
            if "date" in qs:
                where.append("t.date = ?")
                params.append(qs["date"][0])
            if "status" in qs:
                where.append("t.status = ?")
                params.append(qs["status"][0])
            if "q" in qs:
                where.append("(t.text LIKE ? OR t.memo LIKE ?)")
                q = f"%{qs['q'][0]}%"
                params += [q, q]

            sql = """
                SELECT t.*,
                       GROUP_CONCAT(tg.id || ':' || tg.name || ':' || tg.color) AS tags_raw,
                       c.name  AS client_name,
                       c.color AS client_color
                  FROM todos t
                  LEFT JOIN todo_tags tt ON tt.todo_id = t.id
                  LEFT JOIN tags tg      ON tg.id = tt.tag_id
                  LEFT JOIN clients c    ON c.id = t.client_id
            """
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += """
                 GROUP BY t.id
                 ORDER BY CASE t.priority WHEN 'high' THEN 1
                                          WHEN 'medium' THEN 2
                                          ELSE 3 END,
                          t.date ASC, t.time ASC
            """
            rows = con.execute(sql, params).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d["tags"] = parse_tags(d.pop("tags_raw", None))
                result.append(d)
            self.send_json(result)
        finally:
            con.close()

    def get_todo(self, tid):
        con = get_db()
        try:
            row = con.execute(
                """SELECT t.*, GROUP_CONCAT(tg.id || ':' || tg.name || ':' || tg.color) AS tags_raw
                     FROM todos t
                     LEFT JOIN todo_tags tt ON tt.todo_id = t.id
                     LEFT JOIN tags tg      ON tg.id = tt.tag_id
                    WHERE t.id = ? GROUP BY t.id""", [tid]
            ).fetchone()
            if not row:
                return self.send_error_json("Not found", 404)
            d = dict(row)
            d["tags"] = parse_tags(d.pop("tags_raw", None))
            self.send_json(d)
        finally:
            con.close()

    def create_todo(self, body):
        if not body.get("text", "").strip():
            return self.send_error_json("text is required")
        tid = new_id()
        ts = now_ms()
        con = get_db()
        try:
            con.execute(
                """INSERT INTO todos (id, text, status, priority, date, time, memo, done_at, recurrence_id, client_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [tid,
                 body["text"].strip(),
                 body.get("status", "todo"),
                 body.get("priority", "medium"),
                 body.get("date"),
                 body.get("time"),
                 body.get("memo"),
                 body.get("done_at"),
                 body.get("recurrence_id"),
                 body.get("client_id"),
                 ts, ts]
            )
            # 태그 연결
            for tag_id in body.get("tag_ids", []):
                con.execute("INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)", [tid, tag_id])
            con.commit()
            self.get_todo(tid)
        finally:
            con.close()

    def update_todo(self, tid, body):
        con = get_db()
        try:
            row = con.execute("SELECT id FROM todos WHERE id = ?", [tid]).fetchone()
            if not row:
                return self.send_error_json("Not found", 404)

            fields = ["updated_at = ?"]
            params = [now_ms()]
            for col in ["text", "status", "priority", "date", "time", "memo", "done_at", "client_id"]:
                if col in body:
                    fields.append(f"{col} = ?")
                    params.append(body[col])
            params.append(tid)
            con.execute(f"UPDATE todos SET {', '.join(fields)} WHERE id = ?", params)

            # 태그 교체
            if "tag_ids" in body:
                con.execute("DELETE FROM todo_tags WHERE todo_id = ?", [tid])
                for tag_id in body["tag_ids"]:
                    con.execute("INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)", [tid, tag_id])

            con.commit()
            self.get_todo(tid)
        finally:
            con.close()

    def delete_todo(self, tid):
        con = get_db()
        try:
            con.execute("DELETE FROM todos WHERE id = ?", [tid])
            con.commit()
            self.send_json({"ok": True})
        finally:
            con.close()

    # ── TAGS ─────────────────────────────────────────

    def get_tags(self):
        con = get_db()
        try:
            rows = con.execute("SELECT * FROM tags ORDER BY name").fetchall()
            self.send_json([dict(r) for r in rows])
        finally:
            con.close()

    def create_tag(self, body):
        if not body.get("name", "").strip():
            return self.send_error_json("name is required")
        tag_id = new_id()
        con = get_db()
        try:
            con.execute(
                "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)",
                [tag_id, body["name"].strip(), body.get("color", "#888888"), now_ms()]
            )
            con.commit()
            row = con.execute("SELECT * FROM tags WHERE id = ?", [tag_id]).fetchone()
            self.send_json(dict(row))
        finally:
            con.close()

    def update_tag(self, tag_id, body):
        con = get_db()
        try:
            fields, params = [], []
            for col in ["name", "color"]:
                if col in body:
                    fields.append(f"{col} = ?")
                    params.append(body[col])
            if not fields:
                return self.send_error_json("nothing to update")
            params.append(tag_id)
            con.execute(f"UPDATE tags SET {', '.join(fields)} WHERE id = ?", params)
            con.commit()
            row = con.execute("SELECT * FROM tags WHERE id = ?", [tag_id]).fetchone()
            self.send_json(dict(row))
        finally:
            con.close()

    def delete_tag(self, tag_id):
        con = get_db()
        try:
            con.execute("DELETE FROM tags WHERE id = ?", [tag_id])
            con.commit()
            self.send_json({"ok": True})
        finally:
            con.close()

    # ── CONTACTS ─────────────────────────────────────

    def get_contacts(self, qs):
        con = get_db()
        try:
            where, params = [], []
            if "q" in qs:
                q = f"%{qs['q'][0]}%"
                where.append("(name LIKE ? OR org LIKE ? OR title LIKE ? OR email LIKE ? OR phone LIKE ?)")
                params += [q, q, q, q, q]
            sql = "SELECT * FROM contacts"
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY name COLLATE NOCASE"
            rows = con.execute(sql, params).fetchall()
            self.send_json([dict(r) for r in rows])
        finally:
            con.close()

    def get_contact(self, cid):
        con = get_db()
        try:
            row = con.execute("SELECT * FROM contacts WHERE id = ?", [cid]).fetchone()
            if not row:
                return self.send_error_json("Not found", 404)
            self.send_json(dict(row))
        finally:
            con.close()

    def create_contact(self, body):
        if not body.get("name", "").strip():
            return self.send_error_json("name is required")
        cid = new_id()
        ts = now_ms()
        con = get_db()
        try:
            con.execute(
                """INSERT INTO contacts (id, name, org, title, email, phone, memo, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [cid,
                 body["name"].strip(),
                 body.get("org", ""),
                 body.get("title", ""),
                 body.get("email", ""),
                 body.get("phone", ""),
                 body.get("memo", ""),
                 ts, ts]
            )
            con.commit()
            self.get_contact(cid)
        finally:
            con.close()

    def update_contact(self, cid, body):
        con = get_db()
        try:
            row = con.execute("SELECT id FROM contacts WHERE id = ?", [cid]).fetchone()
            if not row:
                return self.send_error_json("Not found", 404)
            fields = ["updated_at = ?"]
            params = [now_ms()]
            for col in ["name", "org", "title", "email", "phone", "memo"]:
                if col in body:
                    fields.append(f"{col} = ?")
                    params.append(body[col])
            params.append(cid)
            con.execute(f"UPDATE contacts SET {', '.join(fields)} WHERE id = ?", params)
            con.commit()
            self.get_contact(cid)
        finally:
            con.close()

    def delete_contact(self, cid):
        con = get_db()
        try:
            con.execute("DELETE FROM contacts WHERE id = ?", [cid])
            con.commit()
            self.send_json({"ok": True})
        finally:
            con.close()

    # ── MAIL TEMPLATES ───────────────────────────────

    def get_mail_templates(self, qs):
        con = get_db()
        try:
            where, params = [], []
            if "q" in qs:
                q = f"%{qs['q'][0]}%"
                where.append("(title LIKE ? OR subject LIKE ? OR recipients LIKE ? OR body LIKE ?)")
                params += [q, q, q, q]
            sql = "SELECT * FROM mail_templates"
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY updated_at DESC"
            rows = con.execute(sql, params).fetchall()
            self.send_json([dict(r) for r in rows])
        finally:
            con.close()

    def get_mail_template(self, mid):
        con = get_db()
        try:
            row = con.execute("SELECT * FROM mail_templates WHERE id = ?", [mid]).fetchone()
            if not row:
                return self.send_error_json("Not found", 404)
            self.send_json(dict(row))
        finally:
            con.close()

    def create_mail_template(self, body):
        if not body.get("title", "").strip():
            return self.send_error_json("title is required")
        mid = new_id()
        ts = now_ms()
        con = get_db()
        try:
            con.execute(
                """INSERT INTO mail_templates (id, title, recipients, subject, body, memo, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                [mid, body["title"].strip(),
                 body.get("recipients", ""), body.get("subject", ""),
                 body.get("body", ""), body.get("memo", ""), ts, ts]
            )
            con.commit()
            self.get_mail_template(mid)
        finally:
            con.close()

    def update_mail_template(self, mid, body):
        con = get_db()
        try:
            if not con.execute("SELECT id FROM mail_templates WHERE id = ?", [mid]).fetchone():
                return self.send_error_json("Not found", 404)
            fields = ["updated_at = ?"]
            params = [now_ms()]
            for col in ["title", "recipients", "subject", "body", "memo"]:
                if col in body:
                    fields.append(f"{col} = ?")
                    params.append(body[col])
            params.append(mid)
            con.execute(f"UPDATE mail_templates SET {', '.join(fields)} WHERE id = ?", params)
            con.commit()
            self.get_mail_template(mid)
        finally:
            con.close()

    def delete_mail_template(self, mid):
        con = get_db()
        try:
            con.execute("DELETE FROM mail_templates WHERE id = ?", [mid])
            con.commit()
            self.send_json({"ok": True})
        finally:
            con.close()

    # ── PROCEDURES ───────────────────────────────────

    def get_procedures(self, qs):
        con = get_db()
        try:
            where, params = [], []
            if "q" in qs:
                q = f"%{qs['q'][0]}%"
                where.append("(title LIKE ? OR category LIKE ? OR memo LIKE ?)")
                params += [q, q, q]
            sql = "SELECT * FROM procedures"
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY updated_at DESC"
            rows = con.execute(sql, params).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d["steps"] = json.loads(d.get("steps") or "[]")
                result.append(d)
            self.send_json(result)
        finally:
            con.close()

    def get_procedure(self, pid):
        con = get_db()
        try:
            row = con.execute("SELECT * FROM procedures WHERE id = ?", [pid]).fetchone()
            if not row:
                return self.send_error_json("Not found", 404)
            d = dict(row)
            d["steps"] = json.loads(d.get("steps") or "[]")
            self.send_json(d)
        finally:
            con.close()

    def create_procedure(self, body):
        if not body.get("title", "").strip():
            return self.send_error_json("title is required")
        pid = new_id()
        ts = now_ms()
        con = get_db()
        try:
            con.execute(
                """INSERT INTO procedures (id, title, category, steps, memo, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [pid, body["title"].strip(),
                 body.get("category", ""),
                 json.dumps(body.get("steps", []), ensure_ascii=False),
                 body.get("memo", ""), ts, ts]
            )
            con.commit()
            self.get_procedure(pid)
        finally:
            con.close()

    def update_procedure(self, pid, body):
        con = get_db()
        try:
            if not con.execute("SELECT id FROM procedures WHERE id = ?", [pid]).fetchone():
                return self.send_error_json("Not found", 404)
            fields = ["updated_at = ?"]
            params = [now_ms()]
            for col in ["title", "category", "memo"]:
                if col in body:
                    fields.append(f"{col} = ?")
                    params.append(body[col])
            if "steps" in body:
                fields.append("steps = ?")
                params.append(json.dumps(body["steps"], ensure_ascii=False))
            params.append(pid)
            con.execute(f"UPDATE procedures SET {', '.join(fields)} WHERE id = ?", params)
            con.commit()
            self.get_procedure(pid)
        finally:
            con.close()

    def delete_procedure(self, pid):
        con = get_db()
        try:
            con.execute("DELETE FROM procedures WHERE id = ?", [pid])
            con.commit()
            self.send_json({"ok": True})
        finally:
            con.close()

    # ── VACATIONS ────────────────────────────────────

    def get_vacations(self, qs):
        con = get_db()
        try:
            rows = con.execute("SELECT * FROM vacations ORDER BY date").fetchall()
            self.send_json([dict(r) for r in rows])
        finally:
            con.close()

    def create_vacation(self, body):
        if not body.get("date", "").strip():
            return self.send_error_json("date is required")
        vid = new_id()
        ts = now_ms()
        con = get_db()
        try:
            con.execute(
                "INSERT OR IGNORE INTO vacations (id, date, memo, created_at) VALUES (?, ?, ?, ?)",
                [vid, body["date"].strip(), body.get("memo", ""), ts]
            )
            con.commit()
            row = con.execute("SELECT * FROM vacations WHERE date = ?", [body["date"].strip()]).fetchone()
            self.send_json(dict(row))
        finally:
            con.close()

    # ── CLIENTS ──────────────────────────────────────

    def get_clients(self):
        con = get_db()
        try:
            rows = con.execute("SELECT * FROM clients ORDER BY name").fetchall()
            self.send_json([dict(r) for r in rows])
        finally:
            con.close()

    def create_client(self, body):
        name = body.get("name", "").strip()
        if not name:
            return self.send_error_json("name is required")
        con = get_db()
        try:
            exists = con.execute(
                "SELECT id FROM clients WHERE name = ? COLLATE NOCASE", [name]
            ).fetchone()
            if exists:
                return self.send_error_json("이미 존재하는 고객사예요", 409)
            cid = new_id()
            con.execute(
                "INSERT INTO clients (id, name, color, created_at) VALUES (?, ?, ?, ?)",
                [cid, name, body.get("color", "#888888"), now_ms()]
            )
            con.commit()
            row = con.execute("SELECT * FROM clients WHERE id = ?", [cid]).fetchone()
            self.send_json(dict(row))
        finally:
            con.close()

    def update_client(self, cid, body):
        con = get_db()
        try:
            if not con.execute("SELECT id FROM clients WHERE id = ?", [cid]).fetchone():
                return self.send_error_json("Not found", 404)
            fields, params = [], []
            for col in ["name", "color"]:
                if col in body:
                    fields.append(f"{col} = ?")
                    params.append(body[col].strip() if isinstance(body[col], str) else body[col])
            if not fields:
                return self.send_error_json("nothing to update")
            params.append(cid)
            con.execute(f"UPDATE clients SET {', '.join(fields)} WHERE id = ?", params)
            con.commit()
            row = con.execute("SELECT * FROM clients WHERE id = ?", [cid]).fetchone()
            self.send_json(dict(row))
        finally:
            con.close()

    def delete_client(self, cid):
        con = get_db()
        try:
            # 연결된 업무의 client_id 해제 후 삭제
            con.execute("UPDATE todos SET client_id = NULL WHERE client_id = ?", [cid])
            con.execute("UPDATE daily_tasks SET client_id = NULL WHERE client_id = ?", [cid])
            con.execute("DELETE FROM clients WHERE id = ?", [cid])
            con.commit()
            self.send_json({"ok": True})
        finally:
            con.close()

    def delete_vacation(self, date):
        con = get_db()
        try:
            con.execute("DELETE FROM vacations WHERE date = ?", [date])
            con.commit()
            self.send_json({"ok": True})
        finally:
            con.close()

    # ── DAILY TASKS ──────────────────────────────────

    def get_daily_tasks(self):
        con = get_db()
        try:
            rows = con.execute(
                "SELECT * FROM daily_tasks ORDER BY sort_order, created_at"
            ).fetchall()
            self.send_json([dict(r) for r in rows])
        finally:
            con.close()

    def get_daily_task_log(self):
        con = get_db()
        try:
            rows = con.execute(
                "SELECT task_id, date, text, client_id, done_at FROM daily_task_log ORDER BY date"
            ).fetchall()
            self.send_json([dict(r) for r in rows])
        finally:
            con.close()

    def create_daily_task(self, body):
        if not body.get("text", "").strip():
            return self.send_error_json("text is required")
        did = new_id()
        ts = now_ms()
        con = get_db()
        try:
            max_order = con.execute("SELECT COALESCE(MAX(sort_order),0) FROM daily_tasks").fetchone()[0]
            con.execute(
                """INSERT INTO daily_tasks (id, text, checked, checked_date, sort_order, client_id, created_at, updated_at)
                   VALUES (?, ?, 0, NULL, ?, ?, ?, ?)""",
                [did, body["text"].strip(), max_order + 1, body.get("client_id"), ts, ts]
            )
            con.commit()
            row = con.execute("SELECT * FROM daily_tasks WHERE id = ?", [did]).fetchone()
            self.send_json(dict(row))
        finally:
            con.close()

    def update_daily_task(self, did, body):
        con = get_db()
        try:
            row0 = con.execute("SELECT * FROM daily_tasks WHERE id = ?", [did]).fetchone()
            if not row0:
                return self.send_error_json("Not found", 404)
            fields = ["updated_at = ?"]
            params = [now_ms()]
            for col in ["text", "checked", "checked_date", "client_id"]:
                if col in body:
                    fields.append(f"{col} = ?")
                    params.append(body[col])
            params.append(did)
            con.execute(f"UPDATE daily_tasks SET {', '.join(fields)} WHERE id = ?", params)

            # 완료 히스토리 기록 (리포트 집계용) — 체크 상태가 바뀔 때만
            if "checked" in body:
                log_date = body.get("checked_date") or today_str()
                if body.get("checked"):
                    con.execute(
                        """INSERT OR REPLACE INTO daily_task_log (task_id, date, text, client_id, done_at)
                           VALUES (?, ?, ?, ?, ?)""",
                        [did, log_date,
                         body.get("text", row0["text"]),
                         body.get("client_id", row0["client_id"]),
                         now_ms()]
                    )
                else:
                    # 체크 해제 시 해당 날짜 기록 제거
                    con.execute(
                        "DELETE FROM daily_task_log WHERE task_id = ? AND date = ?",
                        [did, log_date]
                    )
            con.commit()
            row = con.execute("SELECT * FROM daily_tasks WHERE id = ?", [did]).fetchone()
            self.send_json(dict(row))
        finally:
            con.close()

    def delete_daily_task(self, did):
        con = get_db()
        try:
            con.execute("DELETE FROM daily_tasks WHERE id = ?", [did])
            con.commit()
            self.send_json({"ok": True})
        finally:
            con.close()

    # ── BACKUP ───────────────────────────────────────

    def download_backup(self):
        """현재 DB를 파일 다운로드로 응답 (WAL 체크포인트 후 전송)."""
        if not os.path.exists(DB_PATH):
            return self.send_error_json("DB 파일이 없어요", 404)
        try:
            _checkpoint_db()
            with open(DB_PATH, "rb") as f:
                data = f.read()
            stamp = datetime.now().strftime("%Y%m%d_%H%M")
            fname = f"todo_backup_{stamp}.db"
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{fname}"')
            self.send_header("Content-Length", len(data))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error_json(f"백업 실패: {e}", 500)


# ── 유틸 ─────────────────────────────────────────────
def parse_tags(raw):
    if not raw:
        return []
    tags = []
    for item in raw.split(","):
        parts = item.split(":", 2)
        if len(parts) == 3:
            tags.append({"id": parts[0], "name": parts[1], "color": parts[2]})
    return tags


# ── 실행 ─────────────────────────────────────────────
if __name__ == "__main__":
    print(f"✅  DB: {DB_PATH}")
    auto_backup()  # 시작 시 자동 백업
    print(f"🚀  서버 시작: http://localhost:{PORT}")
    print(f"    종료: Ctrl+C\n")
    server = ThreadingHTTPServer(("localhost", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋  서버를 종료합니다.")
        server.shutdown()
