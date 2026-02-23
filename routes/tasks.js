const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/projects/:projectId/tasks - full tree for a project
router.get('/projects/:projectId/tasks', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { rows } = await pool.query(
      `WITH RECURSIVE task_tree AS (
        SELECT *, 0 AS depth FROM tasks WHERE project_id = $1 AND parent_id IS NULL
        UNION ALL
        SELECT t.*, tt.depth + 1
        FROM tasks t JOIN task_tree tt ON t.parent_id = tt.id
      )
      SELECT * FROM task_tree ORDER BY depth, position, created_at`,
      [projectId]
    );

    // Build nested tree from flat list
    const taskMap = {};
    const roots = [];
    for (const row of rows) {
      taskMap[row.id] = { ...row, children: [] };
    }
    for (const row of rows) {
      if (row.parent_id && taskMap[row.parent_id]) {
        taskMap[row.parent_id].children.push(taskMap[row.id]);
      } else if (!row.parent_id) {
        roots.push(taskMap[row.id]);
      }
    }

    res.json(roots);
  } catch (err) {
    console.error('Error fetching task tree:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /api/tasks - create task
router.post('/tasks', async (req, res) => {
  try {
    const { label, project_id, parent_id } = req.body;
    if (!label) return res.status(400).json({ error: 'Label is required' });

    // Get next position among siblings
    const siblingQuery = parent_id
      ? await pool.query('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM tasks WHERE parent_id = $1', [parent_id])
      : await pool.query('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM tasks WHERE project_id = $1 AND parent_id IS NULL', [project_id]);
    const position = siblingQuery.rows[0].next_pos;

    const { rows } = await pool.query(
      'INSERT INTO tasks (label, project_id, parent_id, position) VALUES ($1, $2, $3, $4) RETURNING *',
      [label, project_id || null, parent_id || null, position]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id - update task
router.put('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { label, position, is_expanded } = req.body;
    const { rows } = await pool.query(
      `UPDATE tasks SET
        label = COALESCE($1, label),
        position = COALESCE($2, position),
        is_expanded = COALESCE($3, is_expanded),
        updated_at = NOW()
      WHERE id = $4 RETURNING *`,
      [label, position, is_expanded, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id - delete task (cascades to children)
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
