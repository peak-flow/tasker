const express = require('express');
const router = express.Router();

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

router.post('/breakdown', async (req, res) => {
  try {
    const { task_label, context } = req.body;
    if (!task_label) return res.status(400).json({ error: 'task_label is required' });

    const contextStr = context ? `\nParent context: "${context}"` : '';
    const prompt = `Given a task: "${task_label}"${contextStr}

Break this task into 3-7 specific, actionable subtasks.
Return ONLY a JSON array of strings, nothing else.
Keep subtasks concrete and small enough to complete in one sitting.
Example: ["Set up project structure", "Create database schema", "Build API endpoints"]`;

    const response = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini API error:', err);
      return res.status(502).json({ error: 'Gemini API request failed' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'Could not parse Gemini response' });
    }

    const subtasks = JSON.parse(jsonMatch[0]);
    res.json({ subtasks });
  } catch (err) {
    console.error('Error in Gemini breakdown:', err);
    res.status(500).json({ error: 'Failed to break down task' });
  }
});

module.exports = router;
