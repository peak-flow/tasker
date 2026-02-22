# Tasker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a task management app with infinite-depth tree structure, Gemini AI breakdown, project grouping, and task blockers.

**Architecture:** Node.js Express backend serving static Alpine.js + Tailwind HTML from `public/`, PostgreSQL for persistence via `pg` pool, Gemini API proxied through `/api/gemini/breakdown`.

**Tech Stack:** Node.js, Express, PostgreSQL, pg, Alpine.js (CDN), Tailwind CSS (CDN), Google Gemini API, dotenv

---

### Task 1: Initialize Node.js Project

**Files:**
- Create: `package.json`
- Create: `.env`
- Create: `server.js`

**Step 1: Initialize npm and install dependencies**

Run:
```bash
cd /Users/dabraham/CascadeProjects/tasker
npm init -y
npm install express pg dotenv cors
npm install --save-dev nodemon
```

**Step 2: Configure package.json scripts**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

**Step 3: Create .env file**

```env
PORT=3000
DATABASE_URL=postgresql://localhost:5432/tasker
GEMINI_API_KEY=REDACTED_API_KEY
```

**Step 4: Create minimal server.js**

```javascript
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

app.listen(PORT, () => {
  console.log(`Tasker running on http://localhost:${PORT}`);
});
```

**Step 5: Test the server starts**

Run: `npm run dev`
Expected: `Tasker running on http://localhost:3000`

Test: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok"}`

**Step 6: Commit**

```bash
git add package.json package-lock.json server.js .env.example
git commit -m "feat: initialize express server with health endpoint"
```

Note: Commit `.env.example` (copy of `.env` with placeholder values), NOT `.env` itself.

---

### Task 2: Database Setup + Migration Files

**Files:**
- Create: `db/pool.js`
- Create: `db/001-projects.sql`
- Create: `db/002-tasks.sql`
- Create: `db/003-task-blockers.sql`
- Create: `db/migrate.js`

**Step 1: Create the PostgreSQL database**

Run:
```bash
createdb tasker
```

**Step 2: Create database connection pool**

`db/pool.js`:
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
```

**Step 3: Create migration SQL files**

`db/001-projects.sql`:
```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6c8cff',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

`db/002-tasks.sql`:
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  is_expanded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
```

`db/003-task-blockers.sql`:
```sql
CREATE TABLE IF NOT EXISTS task_blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocker_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, blocker_id),
  CHECK(task_id != blocker_id)
);

CREATE INDEX IF NOT EXISTS idx_task_blockers_task_id ON task_blockers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_blockers_blocker_id ON task_blockers(blocker_id);
```

**Step 4: Create migration runner**

`db/migrate.js`:
```javascript
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
    console.log(`Running ${file}...`);
    await pool.query(sql);
    console.log(`  Done.`);
  }

  console.log('All migrations complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

**Step 5: Run migrations**

Run: `node db/migrate.js`
Expected:
```
Running 001-projects.sql...
  Done.
Running 002-tasks.sql...
  Done.
Running 003-task-blockers.sql...
  Done.
All migrations complete.
```

**Step 6: Verify tables exist**

Run: `psql tasker -c "\dt"`
Expected: Lists `projects`, `tasks`, `task_blockers` tables.

**Step 7: Commit**

```bash
git add db/
git commit -m "feat(db): add migration files and runner for projects, tasks, blockers"
```

---

### Task 3: Projects API Routes

**Files:**
- Create: `routes/projects.js`
- Modify: `server.js` (add route mount)

**Step 1: Create projects route file**

`routes/projects.js`:
```javascript
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
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { rows } = await pool.query(
      'INSERT INTO projects (name, description, color) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, color || '#6c8cff']
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
    const { name, description, color } = req.body;
    const { rows } = await pool.query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color),
        updated_at = NOW()
      WHERE id = $4 RETURNING *`,
      [name, description, color, id]
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
```

**Step 2: Mount routes in server.js**

Add to `server.js` before `app.listen`:
```javascript
const projectRoutes = require('./routes/projects');
app.use('/api/projects', projectRoutes);
```

**Step 3: Test with curl**

Run (server should be running via `npm run dev`):
```bash
# Create
curl -X POST http://localhost:3000/api/projects -H "Content-Type: application/json" -d '{"name":"Test Project"}'
# List
curl http://localhost:3000/api/projects
# Update (use the id from create response)
curl -X PUT http://localhost:3000/api/projects/<id> -H "Content-Type: application/json" -d '{"name":"Updated Project"}'
# Delete
curl -X DELETE http://localhost:3000/api/projects/<id>
```

Expected: 201 on create with project JSON, 200 on list with array, 200 on update, 204 on delete.

**Step 4: Commit**

```bash
git add routes/projects.js server.js
git commit -m "feat(api): add project CRUD endpoints"
```

---

### Task 4: Tasks API Routes (with Recursive Tree Query)

**Files:**
- Create: `routes/tasks.js`
- Modify: `server.js` (add route mount)

**Step 1: Create tasks route file**

`routes/tasks.js`:
```javascript
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/projects/:projectId/tasks - full tree for a project
router.get('/projects/:projectId/tasks', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { rows } = await pool.query(
      `WITH RECURSIVE task_tree AS (
        SELECT *, 0 AS depth FROM tasks WHERE project_id = $1 AND parent_id IS NULL
        UNION ALL
        SELECT t.*, tt.depth + 1
        FROM tasks t JOIN task_tree tt ON t.parent_id = tt.id
      )
      SELECT * FROM task_tree ORDER BY depth, position, created_at`,
      [projectId]
    );

    // Build nested tree from flat list
    const taskMap = {};
    const roots = [];
    for (const row of rows) {
      taskMap[row.id] = { ...row, children: [] };
    }
    for (const row of rows) {
      if (row.parent_id && taskMap[row.parent_id]) {
        taskMap[row.parent_id].children.push(taskMap[row.id]);
      } else if (!row.parent_id) {
        roots.push(taskMap[row.id]);
      }
    }

    res.json(roots);
  } catch (err) {
    console.error('Error fetching task tree:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /api/tasks - create task
router.post('/', async (req, res) => {
  try {
    const { label, project_id, parent_id } = req.body;
    if (!label) return res.status(400).json({ error: 'Label is required' });

    // Get next position among siblings
    const siblingQuery = parent_id
      ? await pool.query('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM tasks WHERE parent_id = $1', [parent_id])
      : await pool.query('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM tasks WHERE project_id = $1 AND parent_id IS NULL', [project_id]);
    const position = siblingQuery.rows[0].next_pos;

    const { rows } = await pool.query(
      'INSERT INTO tasks (label, project_id, parent_id, position) VALUES ($1, $2, $3, $4) RETURNING *',
      [label, project_id || null, parent_id || null, position]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id - update task
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { label, position, is_expanded } = req.body;
    const { rows } = await pool.query(
      `UPDATE tasks SET
        label = COALESCE($1, label),
        position = COALESCE($2, position),
        is_expanded = COALESCE($3, is_expanded),
        updated_at = NOW()
      WHERE id = $4 RETURNING *`,
      [label, position, is_expanded, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id - delete task (cascades to children)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
```

**Step 2: Mount routes in server.js**

Add to `server.js`:
```javascript
const taskRoutes = require('./routes/tasks');
app.use('/api', taskRoutes);
```

Note: Task routes use mixed paths — `/api/projects/:id/tasks` for tree fetch and `/api/tasks` for CRUD. Mounting at `/api` handles both.

**Step 3: Test with curl**

```bash
# First create a project
PROJECT_ID=$(curl -s -X POST http://localhost:3000/api/projects -H "Content-Type: application/json" -d '{"name":"Test"}' | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id")

# Create root task
curl -X POST http://localhost:3000/api/tasks -H "Content-Type: application/json" -d "{\"label\":\"Build app\",\"project_id\":\"$PROJECT_ID\"}"

# Create child task (use task id from above)
curl -X POST http://localhost:3000/api/tasks -H "Content-Type: application/json" -d '{"label":"Set up Express","parent_id":"<task_id>"}'

# Fetch tree
curl http://localhost:3000/api/projects/$PROJECT_ID/tasks
```

Expected: Nested JSON tree with children arrays.

**Step 4: Commit**

```bash
git add routes/tasks.js server.js
git commit -m "feat(api): add task CRUD with recursive tree query"
```

---

### Task 5: Blockers API Routes

**Files:**
- Create: `routes/blockers.js`
- Modify: `server.js` (add route mount)

**Step 1: Create blockers route file**

`routes/blockers.js`:
```javascript
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
```

**Step 2: Mount routes in server.js**

Add to `server.js`:
```javascript
const blockerRoutes = require('./routes/blockers');
app.use('/api/tasks', blockerRoutes);
```

**Step 3: Test with curl**

```bash
# Add blocker (use real task IDs)
curl -X POST http://localhost:3000/api/tasks/<task_id>/blockers -H "Content-Type: application/json" -d '{"blocker_id":"<other_task_id>","note":"Need API first"}'

# List blockers
curl http://localhost:3000/api/tasks/<task_id>/blockers

# Remove blocker
curl -X DELETE http://localhost:3000/api/tasks/<task_id>/blockers/<blocker_task_id>
```

**Step 4: Commit**

```bash
git add routes/blockers.js server.js
git commit -m "feat(api): add task blocker endpoints"
```

---

### Task 6: Gemini AI Proxy Route

**Files:**
- Create: `routes/gemini.js`
- Modify: `server.js` (add route mount)

**Step 1: Create gemini route file**

`routes/gemini.js`:
```javascript
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
```

**Step 2: Mount routes in server.js**

Add to `server.js`:
```javascript
const geminiRoutes = require('./routes/gemini');
app.use('/api/gemini', geminiRoutes);
```

**Step 3: Test with curl**

```bash
curl -X POST http://localhost:3000/api/gemini/breakdown -H "Content-Type: application/json" -d '{"task_label":"Build a REST API for user management"}'
```

Expected: `{"subtasks":["...","...","..."]}` with 3-7 items.

**Step 4: Commit**

```bash
git add routes/gemini.js server.js
git commit -m "feat(api): add Gemini AI task breakdown proxy"
```

---

### Task 7: Frontend - App Shell + Project Sidebar

**Files:**
- Create: `public/index.html`

**Step 1: Create the main app HTML**

`public/index.html` - This is a large file. Key structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tasker</title>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: { colors: { surface: '#1a1d27', bg: '#0f1117' } } }
    }
  </script>
</head>
<body class="bg-bg text-gray-200 min-h-screen">
  <div x-data="app()" x-init="init()" class="flex h-screen">

    <!-- Project Sidebar -->
    <aside class="w-64 bg-surface border-r border-gray-700 flex flex-col">
      <!-- Header -->
      <div class="p-4 border-b border-gray-700 flex justify-between items-center">
        <h1 class="text-lg font-bold">Tasker</h1>
      </div>

      <!-- Project List -->
      <div class="flex-1 overflow-y-auto p-3">
        <template x-for="project in projects" :key="project.id">
          <!-- Project item with click to select, edit, delete -->
        </template>
      </div>

      <!-- Add Project -->
      <div class="p-3 border-t border-gray-700">
        <!-- Input + button to create project -->
      </div>
    </aside>

    <!-- Main Content: Task Tree -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Project header -->
      <!-- Task tree (indented list) -->
      <!-- Add root task input -->
    </main>

  </div>

  <script>
  function app() {
    return {
      projects: [],
      selectedProject: null,
      tasks: [],
      // ... all methods for CRUD, tree rendering, AI breakdown, blockers
      async init() {
        await this.fetchProjects();
      },
      // API call methods...
    }
  }
  </script>
</body>
</html>
```

The full implementation of `index.html` will include:
- Project sidebar with CRUD (create, select, edit name inline, delete with confirm)
- Task tree with indented list rendering (recursive Alpine `x-for` templates)
- Inline edit on task labels (click to edit, Enter to save, Escape to cancel)
- Expand/collapse with chevron icons
- "Break down" button calling `/api/gemini/breakdown`
- Blocker badge + blocker management modal (add/remove blockers via task search)
- Color-coded depth dots
- Subtask count badges
- Loading states for AI calls

**Step 2: Test in browser**

Run: `npm run dev`
Open: `http://localhost:3000`
Expected: App shell with sidebar, can create projects, add tasks, use AI breakdown.

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(ui): add main app with project sidebar and task tree"
```

---

### Task 8: Frontend - Task Tree Interactions

This task adds the interactive behaviors to the task tree built in Task 7:

**Features to implement in `public/index.html`:**

1. **Recursive tree rendering** - Alpine.js component that renders nested tasks with `x-for`
2. **Expand/collapse** - Toggle `is_expanded`, save to DB via PUT
3. **Inline edit** - Click label to switch to input, Enter saves via PUT, Escape cancels
4. **Delete task** - Confirmation dialog, DELETE request, re-fetch tree
5. **AI breakdown** - Click button, show loading spinner, POST to `/api/gemini/breakdown`, create each subtask via POST, expand parent
6. **Add root task** - Input at bottom of tree, POST to `/api/tasks` with `project_id`

**Step 1: Implement all interactions**

Modify `public/index.html` to add the interaction methods.

**Step 2: Test each interaction**

Test manually in browser:
- Create project → Create task → Expand/collapse → Edit label → Delete
- Click AI breakdown → verify subtasks appear as children
- Create nested tasks (3+ levels deep)

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(ui): add task tree interactions - edit, delete, AI breakdown"
```

---

### Task 9: Frontend - Blocker Management UI

**Features to implement in `public/index.html`:**

1. **Blocker badge** - Red pill showing count on tasks that have blockers
2. **Blocker panel** - Click badge to show list of blockers with remove button
3. **Add blocker** - Search/select from existing tasks in the project, optional note
4. **Visual indication** - Blocked tasks slightly dimmed or marked

**Step 1: Implement blocker UI**

Add to `public/index.html`:
- Blocker count fetch alongside task tree (join or separate query)
- Modal/dropdown for adding blockers with task search
- Blocker list panel with remove buttons
- CSS for blocked task visual state

**Step 2: Test blocker flow**

Test manually:
- Create 2 tasks → Add Task B as blocker of Task A → See badge on A
- Click badge → See blocker list → Remove blocker → Badge disappears
- Try adding self as blocker → Should fail with error

**Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(ui): add blocker management UI"
```

---

### Task 10: Polish + Final Integration Test

**Step 1: Create .env.example**

```env
PORT=3000
DATABASE_URL=postgresql://localhost:5432/tasker
GEMINI_API_KEY=your_gemini_api_key_here
```

**Step 2: Full integration test**

Manual test script:
1. Start fresh: `dropdb tasker && createdb tasker && node db/migrate.js`
2. Start server: `npm run dev`
3. Open `http://localhost:3000`
4. Create a project "My App"
5. Add root task "Build a weather app"
6. Click "Break down" → verify Gemini returns subtasks
7. Expand subtasks → Break down one of them → verify nested children
8. Edit a task label inline
9. Add a blocker between two tasks → verify badge
10. Delete a task with children → verify cascade
11. Switch projects → verify tree isolation

**Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add env example and polish"
```

---

## Summary

| Task | What | Dependencies |
|------|------|-------------|
| 1 | Express server + health check | None |
| 2 | Database schema + migrations | Task 1 |
| 3 | Projects API (CRUD) | Task 2 |
| 4 | Tasks API (CRUD + recursive tree) | Task 2 |
| 5 | Blockers API | Task 2 |
| 6 | Gemini AI proxy | Task 1 |
| 7 | Frontend app shell + project sidebar | Tasks 3, 4 |
| 8 | Frontend task tree interactions | Task 7 |
| 9 | Frontend blocker management | Tasks 5, 8 |
| 10 | Polish + integration test | All |
