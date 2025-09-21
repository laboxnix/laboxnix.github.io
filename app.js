const STORAGE_KEY = 'todo.tasks.v1';
const form = document.getElementById('new-task-form');
const input = document.getElementById('new-title');
const dueInput = document.getElementById('new-due');
const prioritySelect = document.getElementById('new-priority');
const list = document.getElementById('list');
const emptyMessage = document.getElementById('empty');
const template = document.getElementById('task-template');
const filterButtons = Array.from(document.querySelectorAll('.filters button'));
const sortSelect = document.getElementById('sort');

let tasks = loadTasks();
let currentFilter = 'all';
let currentSort = sortSelect.value;
let pendingFocus = null;

updateFilterButtons();
render();

form.addEventListener('submit', event => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) {
    input.focus();
    return;
  }

  const timestamp = new Date().toISOString();
  const dueAt = normalizeDate(dueInput.value);
  const priority = normalizePriority(prioritySelect.value);
  const task = {
    id: createId(),
    title,
    completed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    description: undefined,
    dueAt,
    priority,
  };

  tasks = [task, ...tasks];
  saveTasks();
  render();

  form.reset();
  input.focus();
});

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    updateFilterButtons();
    render();
  });
});

sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  render();
});

list.addEventListener('change', event => {
  const checkbox = event.target.closest('.task-toggle');
  if (!checkbox) return;
  const listItem = checkbox.closest('.task');
  const { id } = listItem.dataset;
  pendingFocus = { type: 'task', id, selector: '.task-toggle' };
  updateTask(id, {
    completed: checkbox.checked,
  });
});

list.addEventListener('click', event => {
  const editButton = event.target.closest('.task-edit');
  if (editButton) {
    const listItem = editButton.closest('.task');
    startEdit(listItem.dataset.id, listItem);
    return;
  }

  const deleteButton = event.target.closest('.task-delete');
  if (deleteButton) {
    const listItem = deleteButton.closest('.task');
    const task = findTask(listItem.dataset.id);
    if (!task) return;

    const ok = window.confirm(`Delete task "${task.title}"?`);
    if (!ok) return;

    const siblings = Array.from(list.querySelectorAll('.task'));
    const index = siblings.indexOf(listItem);
    const nextSibling = siblings[index + 1] || siblings[index - 1];
    if (nextSibling) {
      pendingFocus = { type: 'task', id: nextSibling.dataset.id, selector: '.task-edit' };
    } else {
      pendingFocus = { type: 'element', selector: '#new-title' };
    }

    deleteTask(task.id);
  }
});

function loadTasks() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTask).filter(Boolean);
  } catch (error) {
    console.warn('Failed to parse stored tasks', error);
    return [];
  }
}

function saveTasks() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return undefined;
  if (typeof task.id !== 'string' || typeof task.title !== 'string') return undefined;
  return {
    id: task.id,
    title: task.title,
    completed: Boolean(task.completed),
    description: typeof task.description === 'string' ? task.description : undefined,
    dueAt: normalizeDate(task.dueAt),
    priority: normalizePriority(task.priority),
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
  };
}

function normalizeDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizePriority(value) {
  if (!value) return undefined;
  const normalized = String(value).toLowerCase();
  return ['low', 'med', 'high'].includes(normalized) ? normalized : undefined;
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function render() {
  list.innerHTML = '';

  const visible = getVisibleTasks();
  emptyMessage.hidden = visible.length > 0;

  const fragment = document.createDocumentFragment();
  visible.forEach(task => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;
    if (task.completed) node.classList.add('completed');
    if (task.priority) node.dataset.priority = task.priority;

    const checkbox = node.querySelector('.task-toggle');
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Mark ${task.title} as ${task.completed ? 'incomplete' : 'complete'}`);

    const titleEl = node.querySelector('.task-title');
    titleEl.textContent = task.title;

    const meta = node.querySelector('.task-meta');
    meta.textContent = formatMeta(task);
    meta.hidden = meta.textContent.length === 0;

    fragment.appendChild(node);
  });

  list.appendChild(fragment);
  updateFilterButtons();
  focusPendingTarget();
}

function focusPendingTarget() {
  if (!pendingFocus) return;
  let target = null;
  if (pendingFocus.type === 'task' && pendingFocus.id) {
    target = list.querySelector(`.task[data-id="${pendingFocus.id}"] ${pendingFocus.selector}`);
  } else if (pendingFocus.type === 'element') {
    target = document.querySelector(pendingFocus.selector);
  }
  pendingFocus = null;
  if (target) {
    target.focus();
  }
}

function getVisibleTasks() {
  const filtered = tasks.filter(task => {
    if (currentFilter === 'active') return !task.completed;
    if (currentFilter === 'completed') return task.completed;
    return true;
  });

  return sortTasks(filtered, currentSort);
}

function sortTasks(items, sortKey) {
  const priorityOrder = { high: 3, med: 2, low: 1 };

  return [...items].sort((a, b) => {
    if (sortKey === 'dueAt') {
      const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      if (aTime !== bTime) return aTime - bTime;
    } else if (sortKey === 'priority') {
      const aRank = priorityOrder[a.priority] || 0;
      const bRank = priorityOrder[b.priority] || 0;
      if (aRank !== bRank) return bRank - aRank;
    }

    const aCreated = new Date(a.createdAt).getTime();
    const bCreated = new Date(b.createdAt).getTime();
    return bCreated - aCreated;
  });
}

function formatMeta(task) {
  const pieces = [];
  if (task.dueAt) {
    const due = new Date(task.dueAt);
    pieces.push(`Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  }
  if (task.priority) {
    const label = task.priority === 'med' ? 'Medium' : task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
    pieces.push(`${label} priority`);
  }
  return pieces.join(' | ');
}

function updateFilterButtons() {
  filterButtons.forEach(button => {
    const isSelected = button.dataset.filter === currentFilter;
    button.setAttribute('aria-pressed', String(isSelected));
  });
}

function updateTask(id, nextFields) {
  let changed = false;
  tasks = tasks.map(task => {
    if (task.id !== id) return task;
    let taskChanged = false;
    const updated = { ...task };
    Object.entries(nextFields).forEach(([key, value]) => {
      if (updated[key] !== value) {
        updated[key] = value;
        taskChanged = true;
      }
    });
    if (taskChanged) {
      updated.updatedAt = new Date().toISOString();
      changed = true;
      return updated;
    }
    return task;
  });

  if (!changed) {
    pendingFocus = null;
    return;
  }

  saveTasks();
  render();
}

function deleteTask(id) {
  const next = tasks.filter(task => task.id !== id);
  if (next.length === tasks.length) {
    pendingFocus = null;
    return;
  }
  tasks = next;
  saveTasks();
  render();
}

function findTask(id) {
  return tasks.find(task => task.id === id);
}

function startEdit(id, listItem) {
  const task = findTask(id);
  if (!task) return;
  if (listItem.querySelector('.inline-edit')) return;

  listItem.classList.add('editing');

  const main = listItem.querySelector('.task-main');
  const actions = listItem.querySelector('.task-actions');
  if (main) main.hidden = true;
  if (actions) actions.hidden = true;

  const form = document.createElement('form');
  form.className = 'inline-edit';

  const label = document.createElement('label');
  label.className = 'sr-only';
  label.setAttribute('for', `edit-${id}`);
  label.textContent = 'Edit task title';

  const field = document.createElement('input');
  field.type = 'text';
  field.id = `edit-${id}`;
  field.value = task.title;
  field.required = true;

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'save';
  save.textContent = 'Save';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'cancel';
  cancel.textContent = 'Cancel';

  form.append(label, field, save, cancel);
  listItem.appendChild(form);

  const cleanup = () => {
    if (form.isConnected) {
      form.remove();
    }
    listItem.classList.remove('editing');
    if (main && main.isConnected) main.hidden = false;
    if (actions && actions.isConnected) actions.hidden = false;
  };

  cancel.addEventListener('click', () => {
    cleanup();
    const editBtn = listItem.querySelector('.task-edit');
    if (editBtn) editBtn.focus();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const nextTitle = field.value.trim();
    if (!nextTitle) {
      field.focus();
      return;
    }
    cleanup();
    if (nextTitle !== task.title) {
      pendingFocus = { type: 'task', id, selector: '.task-edit' };
      updateTask(id, { title: nextTitle });
    } else {
      const editBtn = list.querySelector(`.task[data-id="${id}"] .task-edit`);
      if (editBtn) editBtn.focus();
    }
  });

  field.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel.click();
    }
  });

  window.requestAnimationFrame(() => {
    field.focus();
    field.select();
  });
}

