require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Skip global JSON parser for import route (POST /api/export) which has its own 10mb limit
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/export') return next();
  return express.json()(req, res, next);
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const projectRoutes = require('./routes/projects');
app.use('/api/projects', projectRoutes);

const taskRoutes = require('./routes/tasks');
app.use('/api', taskRoutes);

const blockerRoutes = require('./routes/blockers');
app.use('/api/tasks', blockerRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);

const settingsRoutes = require('./routes/settings');
app.use('/api/settings', settingsRoutes);

const exportRoutes = require('./routes/export');
app.use('/api/export', exportRoutes);

app.listen(PORT, () => {
  console.log(`Tasker running on http://localhost:${PORT}`);
});
