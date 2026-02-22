# ADR-004: Data Persistence - PostgreSQL

## Status
Accepted

## Date
2026-02-22

## Context
The task tree needs persistent storage. Tasks form a tree structure with:
- Infinite nesting depth
- Parent-child relationships
- CRUD operations (create, read, update, delete tasks)
- Future features (second brain) will also need persistent storage

## Options Considered
1. **LocalStorage** - Browser-only, no server needed, but data is device-locked and size-limited
2. **SQLite** - File-based, zero config, but limited concurrency
3. **PostgreSQL** - Full relational DB, excellent tree structure support, industry standard

## Decision
PostgreSQL for all persistent data.

## Rationale
- Tree structures map well to relational tables (adjacency list pattern with `parent_id`)
- PostgreSQL has recursive CTEs (`WITH RECURSIVE`) for efficient tree queries
- Learning real database patterns is an explicit goal
- CRUD operations are straightforward with `pg` npm package
- Scales to future features without migration pain
- Industry standard - skills transfer to other projects

## Tree Storage Pattern
Adjacency list with `parent_id`:
```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  is_expanded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Recursive CTE for fetching full tree:
```sql
WITH RECURSIVE task_tree AS (
  SELECT *, 0 AS depth FROM tasks WHERE parent_id IS NULL
  UNION ALL
  SELECT t.*, tt.depth + 1
  FROM tasks t JOIN task_tree tt ON t.parent_id = tt.id
)
SELECT * FROM task_tree ORDER BY depth, position;
```

## Consequences
- Requires PostgreSQL running (Docker or local install)
- Need database migrations strategy (simple SQL files for now)
- Connection management via `pg` pool
- Must handle cascade deletes carefully (deleting a parent removes all children)
