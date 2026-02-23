require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
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

const geminiRoutes = require('./routes/gemini');
app.use('/api/gemini', geminiRoutes);

const exportRoutes = require('./routes/export');
app.use('/api/export', exportRoutes);

app.listen(PORT, () => {
  console.log(`Tasker running on http://localhost:${PORT}`);
});
