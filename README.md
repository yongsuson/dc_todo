# 🗂️ DC Todo — 업무 관리 툴

> 용수야 뭐 빼먹은 건 없냐?

일정 관리부터 메일 포맷, 업무 순서, 주소록까지 — 실무에 필요한 것만 담은 로컬 업무 관리 웹앱입니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 📋 **칸반 보드** | 할 일 / 진행 중 / 완료 드래그 앤 드롭 |
| 📅 **캘린더** | 월간 일정 보기, 공휴일·대체공휴일 표시 (2024~2030) |
| 🔍 **검색 / 기록** | 전체 할 일 검색 및 상태 필터 |
| 📒 **주소록** | 이름·소속·직급·이메일·연락처 관리 |
| ✉️ **메일 포맷** | 자주 쓰는 업무 메일 템플릿 저장·복사 |
| 📌 **업무 순서** | 반복 업무 단계별 절차 저장 |
| 📊 **통계 대시보드** | 전체·오늘 할 일 완료율 실시간 표시 |
| 💰 **D-day** | 입사일 D+N, 다음 월급까지 D-N |

---

## 🚀 실행 방법

### 사전 준비
- [Python 3.x](https://www.python.org/downloads/) 설치
  - 설치 시 **"Add Python to PATH"** 반드시 체크

### 실행
```bash
# 방법 1 — 터미널
python server.py

# 방법 2 — 더블클릭
실행.bat
```

브라우저에서 접속: **http://localhost:8000**

> 종료 시 터미널 창에서 `Ctrl + C` 또는 창 닫기

---

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────┐
│              Browser (Client)            │
│                                         │
│  todo.html ─── app.js ─── style.css     │
│     │              │                    │
│     └── 정적 파일  └── fetch API 호출   │
└──────────────────┬──────────────────────┘
                   │ HTTP (localhost:8000)
┌──────────────────▼──────────────────────┐
│         server.py (Python HTTP Server)   │
│                                         │
│  GET/POST/PUT/DELETE                    │
│  /api/todos                             │
│  /api/contacts                          │
│  /api/mail-templates                    │
│  /api/procedures                        │
└──────────────────┬──────────────────────┘
                   │ sqlite3 (내장)
┌──────────────────▼──────────────────────┐
│              todo.db (SQLite)            │
└─────────────────────────────────────────┘
```

### 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | Vanilla JS, HTML5, CSS3 |
| Backend | Python 3 (http.server 내장 모듈) |
| Database | SQLite3 (Python 내장) |
| UI 아이콘 | Tabler Icons |
| 폰트 | DM Sans, DM Mono, Instrument Serif |

> **외부 의존성 없음** — Python만 설치되어 있으면 바로 실행 가능

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
| created_at | INTEGER | 생성 타임스탬프 (ms) |
| updated_at | INTEGER | 수정 타임스탬프 (ms) |

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

### tags / todo_tags
| 테이블 | 설명 |
|--------|------|
| tags | 태그 정의 (id, name, color) |
| todo_tags | 할 일 ↔ 태그 N:M 관계 |

---

## 📁 파일 구조

```
Todo/
├── server.py       # Python HTTP 서버 + REST API
├── todo.html       # 단일 페이지 앱 (SPA) 마크업
├── app.js          # 전체 클라이언트 로직
├── style.css       # 스타일시트
├── schema.sql      # DB 스키마 정의
├── todo.db         # SQLite 데이터베이스 (자동 생성)
├── 실행.bat        # Windows 실행 스크립트
└── README.md
```

---

## 📝 License

Copyright © 신림동나무늘보
