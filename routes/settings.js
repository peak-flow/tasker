const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/settings - return current settings (no secrets stored)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT ai_provider, ai_base_url, ai_model FROM settings WHERE id = 1');
    if (rows.length === 0) {
      return res.json({ ai_provider: 'gemini', ai_base_url: null, ai_model: null });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings - update provider, url, model
router.put('/', async (req, res) => {
  try {
    const { ai_provider, ai_base_url, ai_model } = req.body;
    await pool.query(
      `INSERT INTO settings (id, ai_provider, ai_base_url, ai_model, updated_at)
       VALUES (1, $1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         ai_provider = $1, ai_base_url = $2, ai_model = $3, updated_at = NOW()`,
      [ai_provider || 'gemini', ai_base_url || null, ai_model || null]
    );
    const { rows } = await pool.query('SELECT ai_provider, ai_base_url, ai_model FROM settings WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    console.error('Error saving settings:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
