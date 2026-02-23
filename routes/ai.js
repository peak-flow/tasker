const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// ── Provider Adapters ──

async function callGemini({ prompt, apiKey, baseUrl, model }) {
  const url = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const modelName = model || 'gemini-2.0-flash';
  const response = await fetch(
    `${url}/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAI({ prompt, apiKey, baseUrl, model }) {
  const url = baseUrl || 'https://api.openai.com/v1';
  const modelName = model || 'gpt-4o-mini';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic({ prompt, apiKey, baseUrl, model }) {
  const url = baseUrl || 'https://api.anthropic.com';
  const modelName = model || 'claude-sonnet-4-20250514';
  const response = await fetch(`${url}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

const PROVIDERS = { gemini: callGemini, openai: callOpenAI, anthropic: callAnthropic };

function getEnvKey(provider) {
  const map = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
  return process.env[map[provider]] || null;
}

// ── Models Endpoint ──

router.post('/models', async (req, res) => {
  try {
    const { provider, api_key, base_url } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider is required' });
    if (!api_key) return res.status(400).json({ error: 'api_key is required' });

    if (provider === 'anthropic') {
      const url = (base_url || 'https://api.anthropic.com') + '/v1/models';
      const response = await fetch(url, {
        headers: {
          'x-api-key': api_key,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err.slice(0, 200)}`);
      }
      const data = await response.json();
      const models = (data.data || []).map(m => m.id).sort();
      return res.json({ models });
    }

    return res.status(400).json({ error: `No server-side model listing needed for ${provider}` });
  } catch (err) {
    console.error('Error fetching models:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch models' });
  }
});

// ── Breakdown Endpoint ──

router.post('/breakdown', async (req, res) => {
  try {
    const { task_label, context, api_key, provider: reqProvider } = req.body;
    if (!task_label) return res.status(400).json({ error: 'task_label is required' });

    const provider = reqProvider || 'gemini';
    const callFn = PROVIDERS[provider];
    if (!callFn) return res.status(400).json({ error: `Unknown provider: ${provider}` });

    // Load provider config from DB (url, model — no secrets)
    const { rows } = await pool.query('SELECT base_url, model FROM provider_configs WHERE provider = $1', [provider]);
    const config = rows[0] || {};

    // API key: request body (from localStorage) > env var fallback
    const apiKey = api_key || getEnvKey(provider);
    if (!apiKey && provider !== 'openai') {
      return res.status(400).json({ error: 'No API key configured. Add one in Settings.' });
    }

    // Build prompt (same as original)
    const contextStr = context ? `\nParent context: "${context}"` : '';
    const prompt = `Given a task: "${task_label}"${contextStr}

Break this task into 3-7 specific, actionable subtasks.
Return ONLY a JSON array of strings, nothing else.
Keep subtasks concrete and small enough to complete in one sitting.
Example: ["Set up project structure", "Create database schema", "Build API endpoints"]`;

    const text = await callFn({
      prompt,
      apiKey,
      baseUrl: config.base_url,
      model: config.model,
    });

    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'Could not parse AI response' });
    }

    const subtasks = JSON.parse(jsonMatch[0]);
    res.json({ subtasks });
  } catch (err) {
    console.error('Error in AI breakdown:', err);
    res.status(500).json({ error: err.message || 'Failed to break down task' });
  }
});

module.exports = router;
