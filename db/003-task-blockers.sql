CREATE TABLE IF NOT EXISTS task_blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocker_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, blocker_id),
  CHECK(task_id != blocker_id)
);

CREATE INDEX IF NOT EXISTS idx_task_blockers_task_id ON task_blockers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_blockers_blocker_id ON task_blockers(blocker_id);
