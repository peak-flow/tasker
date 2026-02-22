# Tasker - AI Task Breakdown App Design

## Date
2026-02-22

## Overview
A task management app with an infinite-depth tree structure. Users create projects, add tasks, and use Gemini AI to break tasks into subtasks recursively. Tasks can have blockers (dependencies on other tasks).

## Tech Stack
- **Frontend:** Alpine.js + Tailwind CSS (CDN, no build step)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **AI:** Google Gemini API (proxied through backend)
- **See:** ADRs 001-006 in `docs/adrs/` for decision rationale

## Project Structure
```
tasker/
├── server.js                 # Express entry point
├── .env                      # GEMINI_API_KEY, DATABASE_URL
├── package.json
├── db/
│   ├── 001-projects.sql      # Projects table
│   ├── 002-tasks.sql         # Tasks table (self-referencing tree)
│   └── 003-task-blockers.sql # Blocker join table
├── routes/
│   ├── projects.js           # Project CRUD
│   ├── tasks.js              # Task CRUD + tree queries
│   ├── blockers.js           # Blocker management
│   └── gemini.js             # AI task breakdown proxy
├── public/
│   ├── index.html            # App shell with project sidebar + task tree
│   └── (future feature HTML files)
└── docs/
    ├── adrs/                 # Architecture Decision Records
    └── plans/                # Design documents
```

## Database Schema

### projects
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, auto-generated |
| name | TEXT | NOT NULL |
| description | TEXT | Optional |
| color | TEXT | Hex color, default `#6c8cff` |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### tasks
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, auto-generated |
| project_id | UUID | FK → projects (root tasks only) |
| parent_id | UUID | FK → tasks (self-ref, NULL for root) |
| label | TEXT | NOT NULL |
| position | INTEGER | Ordering among siblings, default 0 |
| is_expanded | BOOLEAN | UI state, default false |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

Tree pattern: Adjacency list with `parent_id`. Full tree fetched via recursive CTE.

### task_blockers
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, auto-generated |
| task_id | UUID | FK → tasks (the blocked task) |
| blocker_id | UUID | FK → tasks (what's blocking it) |
| note | TEXT | Optional explanation |
| created_at | TIMESTAMPTZ | Auto |

Constraints: `UNIQUE(task_id, blocker_id)`, `CHECK(task_id != blocker_id)`

## API Endpoints

### Projects
| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/projects` | - | `[{id, name, description, color}]` |
| POST | `/api/projects` | `{name, description?, color?}` | `{id, name, ...}` |
| PUT | `/api/projects/:id` | `{name?, description?, color?}` | `{id, name, ...}` |
| DELETE | `/api/projects/:id` | - | `204` (cascades to tasks) |

### Tasks
| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/projects/:id/tasks` | - | Full tree as nested JSON |
| POST | `/api/tasks` | `{label, project_id?, parent_id?}` | `{id, label, ...}` |
| PUT | `/api/tasks/:id` | `{label?, position?, is_expanded?}` | `{id, label, ...}` |
| DELETE | `/api/tasks/:id` | - | `204` (cascades to children) |

### Blockers
| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/tasks/:id/blockers` | - | `[{id, blocker_id, label, note}]` |
| POST | `/api/tasks/:id/blockers` | `{blocker_id, note?}` | `{id, ...}` |
| DELETE | `/api/tasks/:id/blockers/:blockerId` | - | `204` |

### Gemini AI
| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/gemini/breakdown` | `{task_label, context?}` | `{subtasks: [string]}` |

The `context` field optionally includes parent task labels for better AI breakdown.

## UI Design

### Layout
```
┌──────────────────────────────────────────────┐
│  Tasker                              [+ New]  │
├────────────┬─────────────────────────────────┤
│            │                                  │
│  Projects  │   Task Tree (indented list)      │
│            │                                  │
│  > Work    │   ▶ Build API                    │
│  • Personal│     ├── Set up Express     [AI]  │
│  • Side    │     ├── Create routes      [AI]  │
│            │     │   ├── GET /users            │
│            │     │   └── POST /users           │
│            │     └── Add auth        🔴2 [AI] │
│            │   ▶ Design database              │
│            │                                  │
│  [+ Proj]  │   [+ Add task]                   │
├────────────┴─────────────────────────────────┤
│  (future: second brain, etc.)                 │
└──────────────────────────────────────────────┘
```

### Node Interactions
- **Click chevron** → expand/collapse children
- **Click label** → inline edit mode
- **[AI] button** → calls Gemini, inserts generated subtasks as children
- **🔴 badge** → shows blocker count, click to see/manage blockers
- **Right-click / menu** → delete task, add blocker
- **[+ Add task]** → new root task in current project

### Visual Indicators
- Color-coded dots by depth level
- Blocked tasks show red badge with blocker count
- Subtask count shown as muted badge
- Connector lines on left border for tree structure

## Gemini AI Integration

### Prompt Strategy
```
Given a task: "{task_label}"
Parent context: "{parent_label} > {grandparent_label}"

Break this task into 3-7 specific, actionable subtasks.
Return as a JSON array of strings.
Keep subtasks concrete and small enough to complete in one sitting.
```

### Flow
1. User clicks "Break down" on a task node
2. Frontend POSTs to `/api/gemini/breakdown` with task label + parent context
3. Backend proxies to Gemini API with structured prompt
4. Backend returns subtask labels
5. Frontend creates each subtask via `POST /api/tasks` with `parent_id`
6. Tree re-renders with new children expanded

## Future Extensibility
- Additional views (vertical tree, card graph) - same data, different renderer
- Second brain feature - separate HTML file, shared Express server
- Task status (todo/in-progress/done) - add column later
- Drag-and-drop reordering - update `position` field
- Search across projects/tasks
