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
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
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
      max_tokens: 4096,
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

// ── Pricing Page URLs (official sources for grounded extraction) ──

const PRICING_URLS = {
  openai: 'https://developers.openai.com/api/docs/pricing',
  gemini: 'https://ai.google.dev/gemini-api/docs/pricing?hl=en',
  anthropic: 'https://docs.anthropic.com/en/docs/about-claude/models',
};

function htmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(tr|th|td|li|br|p|div|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\n\s*\n/g, '\n')
    .replace(/  +/g, ' ')
    .trim();
}

// ── Model Filtering (curated rules, not hardcoded lists) ──

function isRelevantModel(modelId, provider) {
  if (provider === 'openai') {
    const allowed = ['gpt-5', 'gpt-4.1'];
    const blocked = ['audio', 'realtime', 'tts', 'image', 'transcribe', 'moderation', 'o3', 'o4','o1','4o'];
    if (!allowed.some(p => modelId.startsWith(p))) return false;
    if (blocked.some(b => modelId.includes(b))) return false;
    if (/\d{4}-\d{2}-\d{2}/.test(modelId)) return false;
    return true;
  }
  if (provider === 'gemini') {
    const name = modelId.replace('models/', '');
    // Must be versioned: gemini-X.Y-* (not aliases like gemini-flash-latest)
    if (!/^gemini-\d/.test(name)) return false;
    const blocked = ['embedding', 'aqa', 'imagen', 'veo', 'thinking', 'exp', 'image', 'native-audio', 'customtools'];
    if (blocked.some(b => name.includes(b))) return false;
    return true;
  }
  if (provider === 'anthropic') {
    if (!modelId.startsWith('claude-')) return false;
    return true;
  }
  return true;
}

function getEnvKey(provider) {
  const map = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
  return process.env[map[provider]] || null;
}

// ── Logged call wrapper ──

async function callWithLogging({ provider, model, endpoint, prompt, callFn, callArgs, enableLogging }) {
  const start = Date.now();
  let response = null;
  let error = null;
  try {
    response = await callFn(callArgs);
    return response;
  } catch (err) {
    error = err.message;
    throw err;
  } finally {
    if (enableLogging) {
      const duration = Date.now() - start;
      pool.query(
        `INSERT INTO ai_logs (provider, model, endpoint, prompt, response, error, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [provider, model || null, endpoint, prompt, response, error, duration]
      ).catch(e => console.error('Failed to write AI log:', e.message));
    }
  }
}

// ── Log Endpoints ──

router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { rows } = await pool.query(
      'SELECT id, created_at, provider, model, endpoint, prompt, response, error, duration_ms FROM ai_logs ORDER BY id DESC LIMIT $1',
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/logs', async (req, res) => {
  try {
    await pool.query('DELETE FROM ai_logs');
    res.json({ cleared: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pricing Refresh Endpoint ──
// 1. Calls provider /models API → filters with curated rules
// 2. Fetches official pricing page HTML
// 3. Uses configured AI to extract pricing from actual page content (grounded, not hallucinated)

router.post('/pricing/refresh', async (req, res) => {
  try {
    const { provider, api_key, ai_provider, ai_api_key, enable_logging } = req.body;
    if (!provider || !api_key) return res.status(400).json({ error: 'provider and api_key required' });

    // Step 1: Discover models via API
    let rawModels = [];
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${api_key}` },
      });
      if (!r.ok) throw new Error(`OpenAI models API: ${r.status}`);
      rawModels = ((await r.json()).data || []).map(m => m.id);
    } else if (provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${api_key}`);
      if (!r.ok) throw new Error(`Gemini models API: ${r.status}`);
      rawModels = ((await r.json()).models || []).map(m => m.name.replace('models/', ''));
    } else if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': api_key, 'anthropic-version': '2023-06-01' },
      });
      if (!r.ok) throw new Error(`Anthropic models API: ${r.status}`);
      rawModels = ((await r.json()).data || []).map(m => m.id);
    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    const filteredModels = rawModels.filter(id => isRelevantModel(id, provider)).sort();
    if (filteredModels.length === 0) {
      return res.json({ pricing: {}, models_raw: rawModels.length, models_filtered: 0 });
    }

    // Step 2: Fetch official pricing page (force English)
    const pricingUrl = PRICING_URLS[provider];
    const pageRes = await fetch(pricingUrl, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!pageRes.ok) throw new Error(`Failed to fetch pricing page: ${pageRes.status}`);
    const pageHtml = await pageRes.text();
    const pageText = htmlToText(pageHtml).slice(0, 12000); // trim for token budget

    // Step 3: Use AI to extract pricing (grounded in actual page content)
    const useProvider = ai_provider || provider;
    const useKey = ai_api_key || api_key;
    const callFn = PROVIDERS[useProvider];
    if (!callFn) return res.status(400).json({ error: `Unknown AI provider: ${useProvider}` });

    const { rows } = await pool.query('SELECT base_url, model FROM provider_configs WHERE provider = $1', [useProvider]);
    const config = rows[0] || {};

    const prompt = `You are a pricing data extractor. Below is the text content from ${provider}'s official pricing page, and a list of model IDs discovered from their API.

PRICING PAGE CONTENT:
${pageText}

MODEL IDs TO PRICE:
${filteredModels.join(', ')}

For each model ID, find its input and output price per 1 million tokens from the page content above.
If a model has variants (e.g. dated versions like "claude-sonnet-4-6-20250514"), use the pricing for the base model.
If you cannot find pricing for a specific model in the page content, omit it.

Return ONLY a JSON object where each key is the model ID and value is { "input": "X.XX", "output": "X.XX" }.
Prices should be strings representing USD per 1M tokens.
No markdown, no explanation, just the JSON object.`;

    const callArgs = { prompt, apiKey: useKey, baseUrl: config.base_url, model: config.model };
    const text = await callWithLogging({
      provider: useProvider, model: config.model, endpoint: 'pricing-refresh', prompt,
      callFn, callArgs, enableLogging: !!enable_logging,
    });

    // Parse AI response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Could not parse pricing from AI response' });

    const extracted = JSON.parse(jsonMatch[0]);

    // Build final pricing map — keep models from filtered list OR that pass filter rules
    // (covers models on pricing page that aren't in /models API yet, e.g. new releases)
    const allowedSet = new Set(filteredModels);
    const pricing = {};
    for (const [model, prices] of Object.entries(extracted)) {
      if (!prices.input || !prices.output) continue;
      if (allowedSet.has(model) || isRelevantModel(model, provider)) {
        // Strip $ prefix if AI included it (e.g. "$0.30" → "0.30")
        const input = String(prices.input).replace(/^\$/, '');
        const output = String(prices.output).replace(/^\$/, '');
        pricing[model] = { provider, input, output };
      }
    }

    res.json({
      pricing,
      models_raw: rawModels.length,
      models_filtered: filteredModels.length,
      models_priced: Object.keys(pricing).length,
      source: pricingUrl,
    });
  } catch (err) {
    console.error('Error refreshing pricing:', err);
    res.status(500).json({ error: err.message || 'Failed to refresh pricing' });
  }
});

// ── Models Endpoint (API-based discovery with curated filtering) ──

router.post('/models', async (req, res) => {
  try {
    const { provider, api_key, base_url } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider is required' });
    if (!api_key) return res.status(400).json({ error: 'api_key is required' });

    let rawModels = [];

    if (provider === 'anthropic') {
      const url = (base_url || 'https://api.anthropic.com') + '/v1/models';
      const response = await fetch(url, {
        headers: { 'x-api-key': api_key, 'anthropic-version': '2023-06-01' },
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err.slice(0, 200)}`);
      }
      const data = await response.json();
      rawModels = (data.data || []).map(m => m.id);

    } else if (provider === 'openai') {
      const url = (base_url || 'https://api.openai.com/v1') + '/models';
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${api_key}` },
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${err.slice(0, 200)}`);
      }
      const data = await response.json();
      rawModels = (data.data || []).map(m => m.id);

    } else if (provider === 'gemini') {
      const url = (base_url || 'https://generativelanguage.googleapis.com/v1beta') + `/models?key=${api_key}`;
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 200)}`);
      }
      const data = await response.json();
      rawModels = (data.models || []).map(m => m.name.replace('models/', ''));

    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    // Apply curated filtering
    const models = rawModels
      .filter(id => isRelevantModel(id, provider))
      .sort()
      .map(id => ({ id }));

    res.json({ models, total_raw: rawModels.length, total_filtered: models.length });
  } catch (err) {
    console.error('Error fetching models:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch models' });
  }
});

// ── Breakdown Endpoint ──

router.post('/breakdown', async (req, res) => {
  try {
    const { task_label, context, api_key, provider: reqProvider, enable_logging } = req.body;
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

    const callArgs = { prompt, apiKey, baseUrl: config.base_url, model: config.model };
    const text = await callWithLogging({
      provider, model: config.model, endpoint: 'breakdown', prompt,
      callFn, callArgs, enableLogging: !!enable_logging,
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
