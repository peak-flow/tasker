# ADR-006: Task Blockers

## Status
Accepted

## Date
2026-02-22

## Context
Tasks can be blocked by other tasks. A user needs to see what's preventing progress on a task and manage those dependencies. A task can have multiple blockers, and a task can block multiple other tasks - this is a many-to-many relationship.

## Decision
Add a `task_blockers` join table representing many-to-many blocking relationships between tasks.

## Schema
```sql
CREATE TABLE task_blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocker_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, blocker_id),
  CHECK(task_id != blocker_id)
);
```

## Rationale
- Many-to-many is the correct model: Task A can be blocked by B and C; Task B can also block D
- Join table with `note` field lets users explain why something is blocking
- `UNIQUE` constraint prevents duplicate blocker entries
- `CHECK` constraint prevents a task from blocking itself
- `ON DELETE CASCADE` on both FKs means deleting either task cleans up the relationship
- UI will show a "Blockers" badge/section on tasks with a button to add blockers (task picker)

## UI Behavior
- Each task node shows a blocker indicator (count badge) if it has blockers
- Clicking the indicator or "Add blocker" button opens a task picker
- Blocker list shows on the task with option to remove each blocker
- Blocked tasks could be visually dimmed or marked with an icon

## Consequences
- Need a task search/picker component for selecting blocker tasks
- Should prevent circular dependencies (A blocks B blocks A) - can enforce in application logic
- Blocker relationships can cross project boundaries (a task in Project A blocks a task in Project B)
