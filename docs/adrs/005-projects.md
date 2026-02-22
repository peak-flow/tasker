# ADR-005: Projects as Task Parent Entity

## Status
Accepted

## Date
2026-02-22

## Context
Tasks need organizational grouping. Users should be able to create multiple projects, each containing its own task tree. This provides top-level organization before the infinite task breakdown begins.

## Decision
Add a `projects` table with a one-to-many relationship to tasks. Each root-level task belongs to exactly one project. Child tasks inherit their project through their parent chain.

## Schema
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6c8cff',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add project_id to tasks (root tasks only, children inherit via parent)
ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
```

## Rationale
- Simple 1:N relationship - each project has many root tasks
- Child tasks don't need `project_id` directly - they inherit through the parent chain
- Only root tasks (where `parent_id IS NULL`) require `project_id`
- Projects provide a natural navigation/grouping layer in the UI
- Keeps the task tree structure clean and unchanged

## Consequences
- Need a project selector/switcher in the UI
- Root task creation requires selecting a project first
- Deleting a project cascades to all its tasks
