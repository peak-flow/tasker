const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/projects - list all projects
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM projects ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// POST /api/projects - create project
router.post('/', async (req, res) => {
  try {
    const { name, description, color, ai_context } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { rows } = await pool.query(
      'INSERT INTO projects (name, description, color, ai_context) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description || null, color || '#6c8cff', ai_context || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id - update project
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, ai_context } = req.body;
    const { rows } = await pool.query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color),
        ai_context = CASE WHEN $4::boolean THEN $5 ELSE ai_context END,
        updated_at = NOW()
      WHERE id = $6 RETURNING *`,
      [name, description, color, ai_context !== undefined, ai_context !== undefined ? (ai_context || null) : null, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id - delete project (cascades to tasks)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
