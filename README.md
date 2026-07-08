# 🗂️ DC Todo — 업무 관리 툴

> 용수야 뭐 빼먹은 건 없냐?

개인용 업무 앱입니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 📋 **칸반 보드** | 할 일 / 진행 중 / 완료 드래그 앤 드롭 |
| 🔁 **일일 업무** | 매일 반복하는 업무 체크리스트, 다음날 자동 초기화 |
| 📅 **캘린더** | 월간 일정 보기, 공휴일·대체공휴일 표시 (2024~2030), 휴가/연차 지정 |
| 🔍 **검색 / 기록** | 전체 할 일 검색 및 상태 필터 |
| 📒 **주소록** | 이름·소속·직급·이메일·연락처 관리 |
| ✉️ **메일 포맷** | 자주 쓰는 업무 메일 템플릿 저장·복사, 카드 클릭 시 전체 보기 |
| 📌 **업무 순서** | 반복 업무 단계별 절차 저장 (드래그로 순서 변경) |
| 🏢 **고객사 관리** | 고객사 직접 추가/수정/삭제, `[고객사명]` 태그로 업무 자동 배정 |
| 📊 **리포트** | 일일·주간·월간·연간·고객사별 업무량 그래프(일일 업무 완료 합산), 숫자 클릭 시 드릴다운, Excel 추출 |
| 📈 **통계 대시보드** | 전체·오늘 할 일 완료율 실시간 표시 |
| 💰 **D-day** | 입사일 D+N, 다음 월급까지 D-N (개인 설정) |
| ⚙️ **개인 설정** | 앱 제목·입사일·월급일 직접 설정 (localStorage) |
| 🌙 **다크 모드** | 라이트 / 다크 테마 전환 |
| 💾 **데이터 백업** | 서버 시작 시 자동 백업 + 버튼으로 즉시 다운로드 |

---

## 🆕 업데이트 내역

### v1.1.0 — 2026-07-08
- 📅 **일일·연간 리포트 추가** — 리포트에 '일일(오늘)'과 '연간' 탭 추가 (일일: 오늘 업무량을 고객사별로 집계 / 연간: 월별 집계)
- 🔁 **반복 일일 업무 리포트 집계** — 일일 업무 완료를 날짜별로 기록(히스토리)하고 주간·월간·연간·일일 리포트 수치에 합산
- ✏️ **할 일 날짜·시간 수정** — 보드 카드의 '수정'에서 날짜와 시간도 변경 가능
- ↩️ **고객사 선택 자동 초기화** — 할 일 등록 후 고객사 선택이 '고객사 없음'으로 초기화

### 2026-06-24
- 🐢 **퇴근 짤 추가** — 사이드바 하단에 "퇴근하겠습니다" 이미지 표시, 클릭하면 커졌다 작아지는 효과
- 🌙 **다크 모드 메뉴 이동** — 라이트/다크 전환 버튼을 사이드바 메뉴 영역으로 옮겨 항상 보이도록 개선
- 🖼️ **서버 이미지 지원** — 정적 파일 서버가 `jpg·png·gif·svg·webp` 등 이미지와 한글 파일명을 올바르게 제공하도록 개선

---

## 🚀 실행 방법

### 사전 준비
- [Python 3.x](https://www.python.org/downloads/) 설치
  - 설치 시 **"Add Python to PATH"** 반드시 체크
  - SQLite는 Python에 내장되어 있어 별도 설치 불필요

### 실행
```bash
# 방법 1 — 터미널
python server.py

# 방법 2 — 더블클릭 (Windows)
실행.bat
```

브라우저에서 접속: **http://localhost:8000**

> 종료 시 터미널 창에서 `Ctrl + C` 또는 창 닫기

---

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────┐
│              Browser (Client)                │
│                                              │
│  todo.html ─── app.js ─── style.css          │
│     │              │                         │
│     │              ├── Chart.js (그래프)     │
│     │              └── SheetJS (Excel 추출)  │
│     └── 정적 파일  └── fetch API 호출        │
│                                              │
│  localStorage: 테마 · 개인 설정 저장         │
└──────────────────┬───────────────────────────┘
                   │ HTTP (localhost:8000)
┌──────────────────▼───────────────────────────┐
│    server.py (Python ThreadingHTTPServer)     │
│                                              │
│  GET/POST/PUT/DELETE                          │
│  /api/todos          /api/contacts            │
│  /api/mail-templates /api/procedures          │
│  /api/clients        /api/daily-tasks         │
│  /api/vacations      /api/tags                │
│  /api/backup  ← DB 다운로드                   │
└──────────────────┬───────────────────────────┘
                   │ sqlite3 (내장, WAL 모드)
┌──────────────────▼───────────────────────────┐
│   todo.db (SQLite)  ──자동복사──▶  backups/   │
└───────────────────────────────────────────────┘
```

### 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | Vanilla JS, HTML5, CSS3 |
| Backend | Python 3 (http.server — ThreadingHTTPServer) |
| Database | SQLite3 (Python 내장, WAL 모드) |
| 그래프 | Chart.js (CDN) |
| Excel 추출 | SheetJS / xlsx (CDN) |
| UI 아이콘 | Tabler Icons |
| 폰트 | DM Sans, DM Mono, Instrument Serif |

> **로컬 의존성 없음** — Python만 설치되어 있으면 바로 실행 가능 (그래프·Excel은 CDN 사용)

### 왜 Flask / FastAPI를 쓰지 않았나

백엔드를 Flask·FastAPI 같은 웹 프레임워크 대신 **Python 내장 `http.server`로 직접** 구현했다. 프레임워크가 나빠서가 아니라, 이 앱의 요구사항에 내장 모듈이 더 맞았기 때문이다.

- **무설치 배포가 핵심 요구사항** — 개발을 모르는 팀원에게 배포하는 앱이라, `pip install`로 별도 패키지를 받는 과정 자체가 장벽이다(회사 PC의 프록시·방화벽, 권한, 버전 충돌 등 실패 지점). `http.server`·`sqlite3`는 Python에 기본 내장되어 있어 **"Python 설치 → 실행.bat 더블클릭"** 으로 끝난다.
- **규모에 맞는 선택** — 사용자 1명, API 10여 개, 단일 SQLite 파일 규모다. 프레임워크의 강점(대규모 라우팅, 다중 사용자, 자동 문서화, 비동기)이 필요 없어, 이 규모에선 얻는 이득보다 설치·관리 부담이 크다.
- **관리 포인트 최소화** — 외부 의존성이 없으면 패키지 취약점 추적·버전 관리 부담이 사라지고, Python 자체만 관리하면 된다.

**트레이드오프** — 대신 라우팅을 `if/elif`로 직접 분기해야 해 코드가 길고, 입력값 검증·API 문서 자동화 같은 편의 기능은 없다. 다중 사용자가 동시에 쓰는 실서버로 확장한다면 그때는 **FastAPI 등으로 이전하는 것이 적절**하다.

---

## 🗄️ DB 설계

### todos
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| text | TEXT NOT NULL | 할 일 내용 |
| status | TEXT | `todo` / `wip` / `done` |
| priority | TEXT | `low` / `medium` / `high` |
| date | TEXT | 날짜 (YYYY-MM-DD) |
| time | TEXT | 시간 (HH:MM) |
| memo | TEXT | 메모 |
| done_at | TEXT | 완료 시각 |
| client_id | TEXT FK | 고객사 (→ clients.id) |
| recurrence_id | TEXT FK | 반복 규칙 (→ recurrences.id) |
| created_at | INTEGER | 생성 타임스탬프 (ms) |
| updated_at | INTEGER | 수정 타임스탬프 (ms) |

### daily_tasks
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| text | TEXT NOT NULL | 일일 업무 내용 |
| checked | INTEGER | 완료 여부 (0/1) |
| checked_date | TEXT | 체크한 날짜 (다음날 자동 해제 기준) |
| sort_order | INTEGER | 정렬 순서 |
| client_id | TEXT FK | 고객사 (→ clients.id) |
| created_at | INTEGER | 생성 타임스탬프 (ms) |
| updated_at | INTEGER | 수정 타임스탬프 (ms) |

### clients
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL UNIQUE | 고객사명 |
| color | TEXT | 배지·그래프 색상 |
| created_at | INTEGER | 생성 타임스탬프 (ms) |

### contacts
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | 이름 |
| org | TEXT | 소속 |
| title | TEXT | 직급 |
| email | TEXT | 이메일 |
| phone | TEXT | 연락처 |
| memo | TEXT | 메모 |
| created_at | INTEGER | 생성 타임스탬프 (ms) |
| updated_at | INTEGER | 수정 타임스탬프 (ms) |

### mail_templates
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| title | TEXT NOT NULL | 포맷 이름 |
| recipients | TEXT | 수신자 유형 |
| subject | TEXT | 제목 템플릿 |
| body | TEXT | 본문 템플릿 |
| memo | TEXT | 참고 메모 |
| created_at | INTEGER | 생성 타임스탬프 (ms) |
| updated_at | INTEGER | 수정 타임스탬프 (ms) |

### procedures
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| title | TEXT NOT NULL | 업무명 |
| category | TEXT | 카테고리 |
| steps | TEXT | 단계 목록 (JSON 배열) |
| memo | TEXT | 메모 |
| created_at | INTEGER | 생성 타임스탬프 (ms) |
| updated_at | INTEGER | 수정 타임스탬프 (ms) |

### vacations
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| date | TEXT NOT NULL UNIQUE | 휴가 날짜 (YYYY-MM-DD) |
| memo | TEXT | 메모 |
| created_at | INTEGER | 생성 타임스탬프 (ms) |

### tags / todo_tags
| 테이블 | 설명 |
|--------|------|
| tags | 태그 정의 (id, name, color) |
| todo_tags | 할 일 ↔ 태그 N:M 관계 |

> 고객사 삭제 시 연결된 `todos` / `daily_tasks`의 `client_id`는 `NULL`로 안전하게 해제됩니다.

---

## 🏢 고객사 태그 사용법

할 일이나 일일 업무를 입력할 때 `[고객사명]`을 앞에 붙이면 해당 고객사로 자동 배정됩니다.

```
[Acme] 계약서 검토   →  Acme 고객사 업무로 저장 (텍스트: "계약서 검토")
```

- 대소문자 구분 없이 인식
- 등록된 고객사명과 일치할 때만 배정
- 셀렉트에서 직접 선택한 고객사보다 `[태그]`가 우선

---

## 💾 데이터 백업

모든 데이터가 `todo.db` 단일 파일에 저장되므로, 유실 방지를 위해 두 가지 백업 장치를 둡니다.

| 종류 | 동작 | 위치 |
|------|------|------|
| **자동 백업** | 서버 시작 시 그날짜 백업본 자동 저장 (최근 14개 보관) | `backups/todo_backup_YYYYMMDD.db` |
| **수동 백업** | 사이드바 **💾 데이터 백업** 버튼 클릭 → 즉시 다운로드 | 브라우저 다운로드 폴더 |

- 백업 전 **WAL 체크포인트**를 수행해 항상 최신 상태를 보장합니다.
- **복원 방법**: 백업한 `.db` 파일을 `todo.db`로 이름을 바꿔 폴더에 덮어쓰고 서버를 재시작하면 됩니다.

> `backups/` 폴더와 백업 파일은 개인 데이터이므로 `.gitignore`로 버전 관리에서 제외됩니다.

---

## 📁 파일 구조

```
Todo/
├── server.py       # Python HTTP 서버 + REST API + 자동 백업
├── todo.html       # 단일 페이지 앱 (SPA) 마크업
├── app.js          # 전체 클라이언트 로직
├── style.css       # 스타일시트 (라이트/다크 테마)
├── schema.sql      # 초기 DB 스키마 정의
├── todo.db         # SQLite 데이터베이스 (자동 생성, git 제외)
├── backups/        # 자동 백업 폴더 (자동 생성, git 제외)
├── 실행.bat        # Windows 실행 스크립트
└── README.md
```

> `todo.db`와 `backups/`에는 개인 업무 데이터가 들어있어 `.gitignore`로 버전 관리에서 제외됩니다.
> 처음 실행 시 빈 데이터베이스가 자동으로 생성됩니다.

---

## 📝 License

Copyright © 신림동나무늘보
