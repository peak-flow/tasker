const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/tasks/:taskId/blockers - list blockers for a task
router.get('/:taskId/blockers', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { rows } = await pool.query(
      `SELECT tb.id, tb.blocker_id, tb.note, tb.created_at, t.label AS blocker_label
       FROM task_blockers tb
       JOIN tasks t ON t.id = tb.blocker_id
       WHERE tb.task_id = $1
       ORDER BY tb.created_at`,
      [taskId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching blockers:', err);
    res.status(500).json({ error: 'Failed to fetch blockers' });
  }
});

// POST /api/tasks/:taskId/blockers - add blocker
router.post('/:taskId/blockers', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { blocker_id, note } = req.body;
    if (!blocker_id) return res.status(400).json({ error: 'blocker_id is required' });

    const { rows } = await pool.query(
      'INSERT INTO task_blockers (task_id, blocker_id, note) VALUES ($1, $2, $3) RETURNING *',
      [taskId, blocker_id, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This blocker already exists' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'A task cannot block itself' });
    }
    console.error('Error adding blocker:', err);
    res.status(500).json({ error: 'Failed to add blocker' });
  }
});

// DELETE /api/tasks/:taskId/blockers/:blockerId - remove blocker
router.delete('/:taskId/blockers/:blockerId', async (req, res) => {
  try {
    const { taskId, blockerId } = req.params;
    const result = await pool.query(
      'DELETE FROM task_blockers WHERE task_id = $1 AND blocker_id = $2',
      [taskId, blockerId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Blocker not found' });
    res.status(204).send();
  } catch (err) {
    console.error('Error removing blocker:', err);
    res.status(500).json({ error: 'Failed to remove blocker' });
  }
});

module.exports = router;
