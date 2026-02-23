const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/export - dump all data as JSON (fix #1: REPEATABLE READ transaction)
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const projects = (await client.query('SELECT * FROM projects ORDER BY created_at')).rows;
    const tasks = (await client.query('SELECT * FROM tasks ORDER BY created_at')).rows;
    const blockers = (await client.query('SELECT * FROM task_blockers ORDER BY created_at')).rows;
    await client.query('COMMIT');

    res.json({
      version: 1,
      exported_at: new Date().toISOString(),
      projects,
      tasks,
      task_blockers: blockers,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error exporting data:', err);
    res.status(500).json({ error: 'Failed to export data' });
  } finally {
    client.release();
  }
});

// Scoped 10mb limit for import only (fix #6)
const jsonLarge = express.json({ limit: '10mb' });

// POST /api/import - restore data from JSON
// fix #2: pool.connect() inside try block
router.post('/', jsonLarge, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const { projects, tasks, task_blockers } = req.body;

    if (!projects || !Array.isArray(projects)) {
      return res.status(400).json({ error: 'Invalid format: projects array required' });
    }

    await client.query('BEGIN');

    // Clear existing data (order matters for FK constraints)
    await client.query('DELETE FROM task_blockers');
    await client.query('DELETE FROM tasks');
    await client.query('DELETE FROM projects');

    // Insert projects
    for (const p of projects) {
      await client.query(
        `INSERT INTO projects (id, name, description, color, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [p.id, p.name, p.description, p.color, p.created_at, p.updated_at]
      );
    }

    // Insert tasks (parent_id refs other tasks, so insert parents first)
    // Sort: null parent_id first, then by created_at to handle nesting order
    const sorted = [...(tasks || [])].sort((a, b) => {
      if (!a.parent_id && b.parent_id) return -1;
      if (a.parent_id && !b.parent_id) return 1;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    // Multi-pass insert for deeply nested tasks
    const inserted = new Set();
    let remaining = sorted;
    let maxPasses = 20;
    while (remaining.length > 0 && maxPasses-- > 0) {
      const next = [];
      for (const t of remaining) {
        if (!t.parent_id || inserted.has(t.parent_id)) {
          await client.query(
            `INSERT INTO tasks (id, project_id, parent_id, label, position, is_expanded, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [t.id, t.project_id, t.parent_id, t.label, t.position, t.is_expanded, t.created_at, t.updated_at]
          );
          inserted.add(t.id);
        } else {
          next.push(t);
        }
      }
      remaining = next;
    }

    // fix #3: fail if tasks couldn't be inserted (circular refs or orphans)
    if (remaining.length > 0) {
      throw new Error(`${remaining.length} tasks could not be inserted (missing parent references)`);
    }

    // Insert blockers
    for (const b of (task_blockers || [])) {
      await client.query(
        `INSERT INTO task_blockers (id, task_id, blocker_id, note, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [b.id, b.task_id, b.blocker_id, b.note, b.created_at]
      );
    }

    await client.query('COMMIT');

    res.json({
      imported: {
        projects: projects.length,
        tasks: inserted.size,
        task_blockers: (task_blockers || []).length,
      },
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error importing data:', err);
    // fix #4: don't leak DB error details to client
    res.status(500).json({ error: 'Import failed' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
