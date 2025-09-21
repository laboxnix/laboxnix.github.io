# Building a To‑Do App — Step‑by‑Step Guide

This guide walks you through coding a polished To‑Do app from MVP to production. It offers two paths:
- Frontend‑only (HTML/CSS/JS + LocalStorage)
- Full‑stack (Node/Express API + SQLite) — optional

Pick the path that fits your goals; you can start frontend‑only and later add the backend.

---

## Goals
- Capture tasks with title, optional description, due date, and priority
- Mark complete/incomplete, edit, delete
- Persist tasks across sessions
- Filter by status; sort by due date/priority
- Keyboard‑friendly and accessible

---

## MVP Scope (Checklist)
- [ ] Add task (title required)
- [ ] Toggle complete
- [ ] Edit task title inline
- [ ] Delete task with confirmation
- [ ] Persist tasks (LocalStorage)
- [ ] Filter: All / Active / Completed
- [ ] Sort: Due date, Priority, Created
- [ ] Basic responsive styling
- [ ] A11y: labels, focus states, ARIA live for changes

Nice‑to‑have (later):
- [ ] Descriptions, due dates, priorities
- [ ] Projects/tags
- [ ] Search
- [ ] Drag & drop reordering
- [ ] Recurring tasks, reminders
- [ ] Sync via backend + auth

---

## Tech Choices
- Frontend: Vanilla HTML/CSS/JS (no build step) for speed and clarity
- Optional backend: Node.js + Express + SQLite (file‑based DB)

---

## Data Model
A task record (frontend and backend):
```ts
Task = {
  id: string,           // uuid
  title: string,        // non-empty
  description?: string, // optional
  dueAt?: string,       // ISO date string
  priority?: 'low' | 'med' | 'high',
  completed: boolean,
  createdAt: string,    // ISO
  updatedAt: string     // ISO
}
```

---

## Project Structure (Frontend‑Only)
```
/ (project root)
  index.html
  styles.css
  app.js
  /img (optional)
```

If adding a backend later, you’ll introduce `/server` and serve static files from `/public`.

---

## Step 1 — Initialize Project
1) Create files: `index.html`, `styles.css`, `app.js`
2) Add a basic HTML scaffold and link CSS/JS
3) Add a `data-test-id` attributes where helpful for testing later

`index.html` skeleton:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>To‑Do</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="container">
      <h1>To‑Do</h1>
      <form id="new-task-form" aria-label="Add task">
        <label for="new-title" class="sr-only">Task title</label>
        <input id="new-title" name="title" type="text" placeholder="Add a task…" required />
        <button type="submit">Add</button>
      </form>

      <section class="controls">
        <div class="filters" role="tablist" aria-label="Filters">
          <button data-filter="all" aria-selected="true">All</button>
          <button data-filter="active">Active</button>
          <button data-filter="completed">Completed</button>
        </div>
        <select id="sort">
          <option value="created">Sort: Created</option>
          <option value="dueAt">Sort: Due</option>
          <option value="priority">Sort: Priority</option>
        </select>
      </section>

      <ul id="list" aria-live="polite"></ul>
    </main>

    <script src="app.js" type="module"></script>
  </body>
  </html>
```

Minimal `styles.css` starter: focus rings + layout
```css
:root { --gap: 12px; --fg: #111; --muted: #777; --bg: #fff; --ring: #2684ff; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
.container { max-width: 720px; margin: 40px auto; padding: 0 16px; }
#new-task-form { display: flex; gap: var(--gap); }
#new-title { flex: 1; padding: 10px 12px; }
button, select { padding: 10px 12px; }
button:focus, input:focus, select:focus { outline: 3px solid var(--ring); outline-offset: 2px; }
.controls { display: flex; justify-content: space-between; align-items: center; margin: 16px 0; }
.filters { display: inline-flex; gap: 8px; }
#list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.task { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid #e6e6e6; border-radius: 8px; }
.task.completed .title { text-decoration: line-through; color: var(--muted); }
.title[contenteditable="true"] { outline: 2px dashed transparent; }
.title[contenteditable="true"]:focus { outline-color: var(--ring); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
```

---

## Step 2 — Storage Util (LocalStorage)
Add a tiny persistence layer in `app.js`.
```js
const STORAGE_KEY = 'todo.items.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []; }
  catch { return []; }
}

function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(16).slice(2));
}
```

---

## Step 3 — App State and Rendering
Define in‑memory state, render the list, and wire up the form.
```js
let items = load();
let filter = 'all';
let sortBy = 'created';

const els = {
  form: document.getElementById('new-task-form'),
  title: document.getElementById('new-title'),
  list: document.getElementById('list'),
  sort: document.getElementById('sort'),
  filters: document.querySelector('.filters'),
};

function render() {
  const filtered = items.filter(i => filter === 'all' ? true : filter === 'active' ? !i.completed : i.completed);
  const sorted = filtered.slice().sort((a,b) => {
    if (sortBy === 'dueAt') return (a.dueAt ?? '') > (b.dueAt ?? '') ? 1 : -1;
    if (sortBy === 'priority') return (priorityRank(a.priority) - priorityRank(b.priority));
    return a.createdAt > b.createdAt ? 1 : -1;
  });
  els.list.innerHTML = '';
  for (const t of sorted) els.list.appendChild(taskRow(t));
}

function priorityRank(p) { return p === 'high' ? 0 : p === 'med' ? 1 : 2; }

function taskRow(t) {
  const li = document.createElement('li');
  li.className = 'task' + (t.completed ? ' completed' : '');
  li.dataset.id = t.id;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = t.completed;
  checkbox.ariaLabel = 'Toggle complete';
  checkbox.addEventListener('change', () => toggle(t.id));

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = t.title;
  title.tabIndex = 0;
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Edit title');
  title.addEventListener('dblclick', () => enableEdit(title, t.id));
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  title.addEventListener('blur', () => commitEdit(title, t.id));

  const del = document.createElement('button');
  del.textContent = 'Delete';
  del.addEventListener('click', () => remove(t.id));

  li.append(checkbox, title, del);
  return li;
}
```

---

## Step 4 — CRUD Operations
Implement task creation, toggle, edit, and delete.
```js
function add(title) {
  const now = new Date().toISOString();
  const t = { id: uid(), title: title.trim(), completed: false, createdAt: now, updatedAt: now };
  if (!t.title) return;
  items.push(t); save(items); render();
}

function toggle(id) {
  const t = items.find(x => x.id === id); if (!t) return;
  t.completed = !t.completed; t.updatedAt = new Date().toISOString();
  save(items); render();
}

function remove(id) {
  const t = items.find(x => x.id === id); if (!t) return;
  if (!confirm('Delete this task?')) return;
  items = items.filter(x => x.id !== id); save(items); render();
}

function enableEdit(el, id) {
  el.setAttribute('contenteditable', 'true'); el.focus();
  const range = document.createRange(); range.selectNodeContents(el);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
}

function commitEdit(el, id) {
  el.removeAttribute('contenteditable');
  const t = items.find(x => x.id === id); if (!t) return;
  const next = el.textContent.trim(); if (!next) { el.textContent = t.title; return; }
  if (next !== t.title) { t.title = next; t.updatedAt = new Date().toISOString(); save(items); }
  render();
}
```

Wire up events at the bottom of `app.js`:
```js
els.form.addEventListener('submit', (e) => {
  e.preventDefault(); add(els.title.value); els.title.value = ''; els.title.focus();
});

els.filters.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]'); if (!btn) return;
  for (const b of els.filters.querySelectorAll('button')) b.removeAttribute('aria-selected');
  btn.setAttribute('aria-selected', 'true');
  filter = btn.dataset.filter; render();
});

els.sort.addEventListener('change', () => { sortBy = els.sort.value; render(); });

document.addEventListener('DOMContentLoaded', render);
```

---

## Step 5 — Enhancements (Optional)
- Due dates: add a date input to the form and render the date; sort already supports `dueAt`.
- Priority: add a select (low/med/high); `priorityRank` already sorts.
- Description: add a textarea and show on row expand or hover.
- Clear completed: add a button to remove all `completed` tasks.
- Drag & drop ordering: use HTML5 DnD and save an `order` field.
- Empty states & toasts: show helpful messaging in `#list` when no tasks.

---

## Step 6 — Accessibility Checklist
- Form fields have labels (visually hidden where needed)
- Buttons have clear text or `aria-label`
- Manage focus when adding, editing, deleting
- Use `aria-live="polite"` on `#list` to announce changes
- Sufficient color contrast and visible focus indicators
- Keyboard support for edit (Enter to commit, Esc to cancel if added)

---

## Step 7 — Basic Testing
- Manual: add, toggle, edit, delete; reload to confirm persistence
- Edge cases: long titles, empty titles, rapid toggling, large lists
- Optional unit tests: factor storage and sort logic into pure functions, test with Jest and `jsdom`

---

## Step 8 — Deployment (Frontend‑Only)
- GitHub Pages: push repo, enable Pages on `main`, serve root
- Netlify/Vercel: drag‑and‑drop or connect repo; set output as root
- Configure a simple cache policy for static assets

---

## Backend Path (Optional)
Add a REST API to sync tasks across devices or enable multi‑user features.

### Server Structure
```
/server
  index.js
  db.js
/public
  index.html
  styles.css
  app.js
```

### API Endpoints
- `GET /api/tasks` → list
- `POST /api/tasks` → create
- `PATCH /api/tasks/:id` → partial update
- `DELETE /api/tasks/:id` → delete

### Step B1 — Express + SQLite
`server/index.js` (sketch):
```js
import express from 'express';
import cors from 'cors';
import { Database } from 'sqlite-async';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const db = await Database.open('todo.db');
await db.run(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  dueAt TEXT,
  priority TEXT,
  completed INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
)`);

app.get('/api/tasks', async (_req, res) => {
  const rows = await db.all('SELECT * FROM tasks');
  res.json(rows.map(r => ({ ...r, completed: !!r.completed })));
});

app.post('/api/tasks', async (req, res) => {
  const t = req.body; // validate in production
  await db.run(`INSERT INTO tasks (id,title,description,dueAt,priority,completed,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?)`, [t.id,t.title,t.description,t.dueAt,t.priority,t.completed?1:0,t.createdAt,t.updatedAt]);
  res.status(201).json(t);
});

app.patch('/api/tasks/:id', async (req, res) => {
  const id = req.params.id; const fields = req.body; // partial
  const cur = await db.get('SELECT * FROM tasks WHERE id=?', id);
  if (!cur) return res.sendStatus(404);
  const next = { ...cur, ...fields, completed: fields.completed ?? !!cur.completed, updatedAt: new Date().toISOString() };
  await db.run(`UPDATE tasks SET title=?,description=?,dueAt=?,priority=?,completed=?,updatedAt=? WHERE id=?`,
    [next.title,next.description,next.dueAt,next.priority,next.completed?1:0,next.updatedAt,id]);
  res.json(next);
});

app.delete('/api/tasks/:id', async (req, res) => {
  await db.run('DELETE FROM tasks WHERE id=?', req.params.id);
  res.sendStatus(204);
});

app.listen(3000, () => console.log('API on http://localhost:3000'));
```

### Step B2 — Frontend Integration
- Replace LocalStorage calls with `fetch` to the API
- Keep optimistic UI: update the list first, then reconcile on failure
- Add a small `api.js` with `list/create/update/delete` helpers

### Step B3 — Deployment (Full‑Stack)
- Render/Railway/Fly.io: one‑click deploy Node app + SQLite
- Set `PORT` env var and bind Express to it
- Serve static `/public` and proxy `/api` if needed

---

## Troubleshooting
- Nothing renders: check for JS errors in DevTools Console
- `localStorage` blocked: ensure site is not in private mode or blocked
- Duplicates on render: don’t re‑append without clearing `#list`
- Events not firing: confirm elements exist and are selected correctly
- Sorting incorrect: normalize empty dates and priorities

---

## Next Steps
- Add unit tests for storage and sorting
- Add task details view with description and due date
- Add import/export (JSON) for backup
- If needed, add backend sync and authentication

---

Happy building! This guide is intentionally incremental—ship the MVP first, then add features thoughtfully.

