const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/settings - return all provider configs
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT provider, base_url, model FROM provider_configs ORDER BY provider');
    // Return as a map: { gemini: { base_url, model }, openai: {...}, ... }
    const configs = {};
    for (const row of rows) {
      configs[row.provider] = { base_url: row.base_url, model: row.model };
    }
    res.json(configs);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings/:provider - upsert a single provider's config
router.put('/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { base_url, model } = req.body;
    await pool.query(
      `INSERT INTO provider_configs (provider, base_url, model, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (provider) DO UPDATE SET
         base_url = $2, model = $3, updated_at = NOW()`,
      [provider, base_url || null, model || null]
    );
    res.json({ provider, base_url: base_url || null, model: model || null });
  } catch (err) {
    console.error('Error saving settings:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
