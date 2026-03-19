/*
  app.js — Logique principale de l'application To‑Do (commentaires en français)
  - Authentification locale (localStorage) avec hash du mot de passe
  - Gestion de session et des utilisateurs
  - Gestion des tâches (création, édition, suppression) par utilisateur
  - Agenda (jour/semaine) pour filtrer/planifier
  - Menu (connexion/déconnexion, export CSV de la liste affichée)
*/

const TASK_KEY_PREFIX = 'todo.tasks.v1.';
const USERS_KEY = 'todo.users.v1';
const SESSION_KEY = 'todo.session.v1';

const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const authMessage = document.getElementById('auth-message');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const currentUsernameElement = document.getElementById('current-username');
const currentModeLabel = document.getElementById('current-mode-label');
// Top-right menu
const menuButton = document.getElementById('menu-button');
const menuPopover = document.getElementById('menu-popover');
const menuExportBtn = document.getElementById('menu-export');
const menuExportBackupBtn = document.getElementById('menu-export-backup');
const menuImportBackupBtn = document.getElementById('menu-import-backup');
const menuImportBackupFile = document.getElementById('menu-import-backup-file');
const menuAuthBtn = document.getElementById('menu-auth');
const menuReadonlyAccountSelect = document.getElementById('menu-readonly-account');

const form = document.getElementById('new-task-form');
const input = document.getElementById('new-title');
const dueInput = document.getElementById('new-due');
const prioritySelect = document.getElementById('new-priority');
const list = document.getElementById('list');
const emptyMessage = document.getElementById('empty');
const template = document.getElementById('task-template');
const filterButtons = Array.from(document.querySelectorAll('.filters button'));
const sortSelect = document.getElementById('sort');
// Agenda controls
const agendaSection = document.getElementById('agenda');
const agendaDateInput = document.getElementById('agenda-date');
const agendaPrevBtn = document.getElementById('agenda-prev');
const agendaNextBtn = document.getElementById('agenda-next');
const agendaTodayBtn = document.getElementById('agenda-today');
const agendaScopeSelect = document.getElementById('agenda-scope');
const agendaToggleBtn = document.getElementById('agenda-toggle');
const agendaBody = document.getElementById('agenda-body');

let defaultSortValue = 'created';
if (sortSelect && sortSelect.options && sortSelect.options.length > 0) {
  defaultSortValue = sortSelect.options[0].value || defaultSortValue;
} else if (sortSelect) {
  defaultSortValue = sortSelect.value || defaultSortValue;
}

let tasks = [];
let currentAccount = null;
let previewAccount = null;
let currentFilter = 'all';
let currentSort = sortSelect ? sortSelect.value : defaultSortValue;
let pendingFocus = null;
// Agenda state: scope can be 'all' | 'day' | 'week'
let agendaScope = 'all';
let agendaDate = todayISO();
let agendaCollapsed = false;

if (loginForm) {
  loginForm.addEventListener('submit', handleLogin);
}

if (registerForm) {
  registerForm.addEventListener('submit', handleRegister);
}

// Menu interactions
if (menuButton) {
  menuButton.addEventListener('click', () => {
    const expanded = menuButton.getAttribute('aria-expanded') === 'true';
    if (expanded) closeMenu(); else openMenu();
  });
}
if (menuExportBtn) {
  menuExportBtn.addEventListener('click', () => {
    closeMenu();
    exportVisibleTasksToCSV();
  });
}
if (menuExportBackupBtn) {
  menuExportBackupBtn.addEventListener('click', () => {
    closeMenu();
    exportBackup();
  });
}
if (menuImportBackupBtn) {
  menuImportBackupBtn.addEventListener('click', () => {
    if (!menuImportBackupFile) return;
    closeMenu();
    menuImportBackupFile.value = '';
    menuImportBackupFile.click();
  });
}
if (menuImportBackupFile) {
  menuImportBackupFile.addEventListener('change', async () => {
    const file = menuImportBackupFile.files && menuImportBackupFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      importBackupFromText(text);
    } catch (error) {
      setAuthMessage('Import impossible: fichier invalide.', true);
    }
  });
}
if (menuAuthBtn) {
  menuAuthBtn.addEventListener('click', () => {
    closeMenu();
    if (currentAccount) {
      handleLogout();
    } else {
      clearPreviewAccount();
      if (loginForm) {
        const field = loginForm.querySelector('input');
        if (field) field.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  });
}
if (menuReadonlyAccountSelect) {
  menuReadonlyAccountSelect.addEventListener('change', () => {
    const nextAccountId = menuReadonlyAccountSelect.value;
    setPreviewAccount(nextAccountId);
    closeMenu();
  });
}
document.addEventListener('click', (e) => {
  if (!menuPopover || !menuButton) return;
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  if (!expanded) return;
  const path = e.composedPath ? e.composedPath() : [];
  if (!(path.includes(menuPopover) || path.includes(menuButton))) {
    closeMenu();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMenu();
  }
});

if (form) {
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!currentAccount) {
      setAuthMessage(isReadOnlyMode() ? 'Lecture seule: connecte-toi pour ajouter des tâches.' : 'Sign in to add tasks.', true);
      if (!isReadOnlyMode() && loginForm) {
        const field = loginForm.querySelector('input');
        if (field) field.focus();
      }
      return;
    }

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
}

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    updateFilterButtons();
    render();
  });
});

if (sortSelect) {
  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    render();
  });
}

if (list) {
  list.addEventListener('change', event => {
    if (!currentAccount) return;
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
    if (!currentAccount) return;
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
}

// Agenda events
if (agendaDateInput) {
  agendaDateInput.addEventListener('change', () => {
    const next = normalizeDate(agendaDateInput.value);
    agendaDate = next || todayISO();
    syncAgendaToForm();
    render();
  });
}
if (agendaPrevBtn) {
  agendaPrevBtn.addEventListener('click', () => {
    agendaDate = addDaysISO(agendaDate, -1);
    if (agendaDateInput) agendaDateInput.value = agendaDate;
    syncAgendaToForm();
    render();
  });
}
if (agendaNextBtn) {
  agendaNextBtn.addEventListener('click', () => {
    agendaDate = addDaysISO(agendaDate, 1);
    if (agendaDateInput) agendaDateInput.value = agendaDate;
    syncAgendaToForm();
    render();
  });
}
if (agendaTodayBtn) {
  agendaTodayBtn.addEventListener('click', () => {
    agendaDate = todayISO();
    if (agendaDateInput) agendaDateInput.value = agendaDate;
    syncAgendaToForm();
    render();
  });
}
if (agendaScopeSelect) {
  agendaScopeSelect.addEventListener('change', () => {
    agendaScope = agendaScopeSelect.value || 'all';
    syncAgendaToForm();
    render();
  });
}

if (agendaToggleBtn) {
  agendaToggleBtn.addEventListener('click', () => {
    setAgendaCollapsed(!agendaCollapsed);
  });
}

initialize();

// Point d'entrée: restaure la session et prépare l'interface
function initialize() {
  const sessionAccount = loadSession();
  if (sessionAccount) {
    setAuthMessage('');
    setCurrentAccount(sessionAccount);
    return;
  }

  updateAuthVisibility();
  populateReadonlyAccountsMenu();
  updateMenuState();
  // Initialize agenda controls
  if (agendaDateInput) agendaDateInput.value = agendaDate;
  if (agendaScopeSelect) agendaScopeSelect.value = agendaScope;
  setAgendaCollapsed(false);
  updateAgendaControls();
  updateTaskCreationControls();
  updateFilterButtons();
  render();
}

// Connexion d'un utilisateur (vérifie les identifiants et ouvre une session)
async function handleLogin(event) {
  event.preventDefault();
  if (!loginForm) return;

  const formData = new FormData(loginForm);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');
  if (!username || !password) {
    setAuthMessage('Username and password are required.', true);
    return;
  }

  try {
    const account = await authenticateUser(username, password);
    loginForm.reset();
    setAuthMessage('');
    setCurrentAccount(account);
  } catch (error) {
    setAuthMessage(error instanceof Error ? error.message : 'Unable to sign in.', true);
  }
}

// Création d'un nouveau compte utilisateur (avec vérifications basiques)
async function handleRegister(event) {
  event.preventDefault();
  if (!registerForm) return;

  const formData = new FormData(registerForm);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');

  if (!username || !password) {
    setAuthMessage('Choose a username and password to continue.', true);
    return;
  }

  if (password !== confirm) {
    setAuthMessage('Passwords do not match.', true);
    return;
  }

  try {
    const account = await registerUser(username, password);
    registerForm.reset();
    if (loginForm) loginForm.reset();
    setAuthMessage('Account created and signed in.');
    setCurrentAccount(account);
  } catch (error) {
    setAuthMessage(error instanceof Error ? error.message : 'Unable to create account.', true);
  }
}

function handleLogout() {
  setCurrentAccount(null);
  if (loginForm) loginForm.reset();
  if (registerForm) registerForm.reset();
  setAuthMessage('Signed out. Sign in to continue.');
  if (loginForm) {
    const field = loginForm.querySelector('input');
    if (field) field.focus();
  }
}

// Met à jour l'utilisateur courant (connexion/déconnexion)
function setCurrentAccount(account) {
  currentAccount = account;
  previewAccount = null;
  if (account) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    tasks = loadTasks(account.id);
    if (currentUsernameElement) {
      currentUsernameElement.textContent = account.displayName;
    }
    if (currentModeLabel) {
      currentModeLabel.textContent = 'Signed in as';
    }
    currentFilter = 'all';
    if (sortSelect) {
      sortSelect.value = defaultSortValue;
      currentSort = sortSelect.value;
    } else {
      currentSort = defaultSortValue;
    }
    if (agendaDateInput) agendaDateInput.value = agendaDate;
    if (agendaScopeSelect) agendaScopeSelect.value = agendaScope;
  } else {
    window.localStorage.removeItem(SESSION_KEY);
    tasks = [];
    if (currentUsernameElement) {
      currentUsernameElement.textContent = '';
    }
    if (currentModeLabel) {
      currentModeLabel.textContent = 'Signed in as';
    }
    currentFilter = 'all';
    if (sortSelect) {
      sortSelect.value = defaultSortValue;
      currentSort = sortSelect.value;
    } else {
      currentSort = defaultSortValue;
    }
  }

  pendingFocus = null;
  updateAuthVisibility();
  populateReadonlyAccountsMenu();
  updateMenuState();
  updateAgendaControls();
  updateTaskCreationControls();
  updateFilterButtons();
  render();
}

function isReadOnlyMode() {
  return !currentAccount && Boolean(previewAccount);
}

function getActiveAccount() {
  return currentAccount || previewAccount;
}

function listAvailableAccounts() {
  const users = loadUsers();
  return Object.entries(users).map(([id, record]) => ({
    id,
    displayName: record && record.displayName ? record.displayName : id,
  })).sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

function populateReadonlyAccountsMenu() {
  if (!menuReadonlyAccountSelect) return;
  const accounts = listAvailableAccounts();
  const options = ['<option value="">Choisir un compte…</option>'];
  accounts.forEach(account => {
    options.push(`<option value="${escapeHtml(account.id)}">${escapeHtml(account.displayName)}</option>`);
  });
  menuReadonlyAccountSelect.innerHTML = options.join('');

  if (currentAccount) {
    menuReadonlyAccountSelect.value = currentAccount.id;
  } else if (previewAccount) {
    menuReadonlyAccountSelect.value = previewAccount.id;
  }
}

function setPreviewAccount(accountId) {
  if (!accountId) {
    clearPreviewAccount();
    return;
  }
  if (currentAccount && currentAccount.id === accountId) return;

  const users = loadUsers();
  const record = users[accountId];
  if (!record) {
    clearPreviewAccount();
    return;
  }

  previewAccount = {
    id: accountId,
    displayName: record.displayName || accountId,
  };
  tasks = loadTasks(previewAccount.id);
  if (currentUsernameElement) {
    currentUsernameElement.textContent = previewAccount.displayName;
  }
  if (currentModeLabel) {
    currentModeLabel.textContent = 'Read-only view:';
  }
  currentFilter = 'all';
  if (sortSelect) {
    sortSelect.value = defaultSortValue;
    currentSort = sortSelect.value;
  } else {
    currentSort = defaultSortValue;
  }

  pendingFocus = null;
  setAuthMessage('Lecture seule active. Connecte-toi pour modifier les tâches.');
  updateAuthVisibility();
  populateReadonlyAccountsMenu();
  updateMenuState();
  updateAgendaControls();
  updateTaskCreationControls();
  updateFilterButtons();
  render();
}

function clearPreviewAccount() {
  if (!previewAccount) return;
  previewAccount = null;
  tasks = [];
  if (currentUsernameElement) {
    currentUsernameElement.textContent = '';
  }
  if (currentModeLabel) {
    currentModeLabel.textContent = 'Signed in as';
  }
  currentFilter = 'all';
  if (sortSelect) {
    sortSelect.value = defaultSortValue;
    currentSort = sortSelect.value;
  } else {
    currentSort = defaultSortValue;
  }
  pendingFocus = null;
  updateAuthVisibility();
  populateReadonlyAccountsMenu();
  updateMenuState();
  updateAgendaControls();
  updateTaskCreationControls();
  updateFilterButtons();
  render();
}

// Affiche soit la section Auth, soit l'app selon l'état de connexion
function updateAuthVisibility() {
  const hasAccess = Boolean(getActiveAccount());
  if (authSection) authSection.hidden = hasAccess;
  if (appSection) appSection.hidden = !hasAccess;
  if (!hasAccess && form) {
    form.reset();
  }
}

function updateMenuState() {
  const isAuthenticated = Boolean(currentAccount);
  const hasAccess = Boolean(getActiveAccount());
  if (menuAuthBtn) {
    menuAuthBtn.textContent = isAuthenticated ? 'Sign out' : 'Sign in';
  }
  if (menuExportBtn) {
    menuExportBtn.disabled = !hasAccess;
  }
  if (menuExportBackupBtn) {
    menuExportBackupBtn.disabled = false;
  }
  if (menuImportBackupBtn) {
    menuImportBackupBtn.disabled = false;
  }
  if (menuReadonlyAccountSelect) {
    menuReadonlyAccountSelect.disabled = isAuthenticated;
  }
}

// Active/désactive les contrôles d'agenda selon la connexion/lecture
function updateAgendaControls() {
  const hasAccess = Boolean(getActiveAccount());
  [agendaDateInput, agendaPrevBtn, agendaNextBtn, agendaTodayBtn, agendaScopeSelect]
    .forEach(el => { if (el) el.disabled = !hasAccess; });
  if (agendaToggleBtn) {
    agendaToggleBtn.disabled = !hasAccess;
  }
  if (sortSelect) {
    sortSelect.disabled = !hasAccess;
  }
  if (hasAccess) {
    if (agendaDateInput) agendaDateInput.value = agendaDate;
    if (agendaScopeSelect) agendaScopeSelect.value = agendaScope;
  }
}

function updateTaskCreationControls() {
  const disabled = !currentAccount;
  [input, dueInput, prioritySelect].forEach(el => {
    if (el) el.disabled = disabled;
  });
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  if (submitBtn) submitBtn.disabled = disabled;
}

function setAuthMessage(message, isError = false) {
  if (!authMessage) return;
  authMessage.textContent = message;
  if (message) {
    authMessage.classList.toggle('error', Boolean(isError));
  } else {
    authMessage.classList.remove('error');
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Charge la "table" des utilisateurs depuis localStorage
function loadUsers() {
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch (error) {
    console.warn('Failed to load stored users', error);
    return {};
  }
}

// Sauvegarde la "table" des utilisateurs dans localStorage
function saveUsers(users) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function registerUser(username, password) {
  const cleanName = username.trim();
  if (cleanName.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  const normalized = normalizeUsername(cleanName);
  if (!normalized) {
    throw new Error('Username is required.');
  }

  const users = loadUsers();
  if (users[normalized]) {
    throw new Error('That username is already taken.');
  }

  const passwordHash = await hashPassword(password);
  users[normalized] = {
    passwordHash,
    displayName: cleanName,
    createdAt: new Date().toISOString(),
  };
  saveUsers(users);
  return { id: normalized, displayName: cleanName };
}

async function authenticateUser(username, password) {
  const cleanName = username.trim();
  const normalized = normalizeUsername(cleanName);
  if (!normalized) {
    throw new Error('Enter your username to sign in.');
  }

  const users = loadUsers();
  const record = users[normalized];
  if (!record) {
    throw new Error('Account not found.');
  }

  const passwordHash = await hashPassword(password);
  if (record.passwordHash !== passwordHash) {
    throw new Error('Incorrect password.');
  }

  const displayName = record.displayName || cleanName;
  return { id: normalized, displayName };
}

function loadSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const id = typeof parsed.id === 'string' ? parsed.id : null;
    if (!id) return null;
    const users = loadUsers();
    const record = users[id];
    if (!record) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const displayName = record.displayName || parsed.displayName || id;
    return { id, displayName };
  } catch (error) {
    console.warn('Failed to restore session', error);
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

// Clé de stockage des tâches propre à chaque utilisateur
function getTaskStorageKey(accountId = currentAccount ? currentAccount.id : null) {
  if (!accountId) return null;
  return `${TASK_KEY_PREFIX}${accountId}`;
}

// Charge les tâches (du compte courant) depuis localStorage
function loadTasks(accountId = currentAccount ? currentAccount.id : null) {
  const key = getTaskStorageKey(accountId);
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTask).filter(Boolean);
  } catch (error) {
    console.warn('Failed to parse stored tasks', error);
    return [];
  }
}

// Sauvegarde les tâches (du compte courant) dans localStorage
function saveTasks() {
  const key = getTaskStorageKey();
  if (!key) return;
  window.localStorage.setItem(key, JSON.stringify(tasks));
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return undefined;
  if (typeof task.id !== 'string' || typeof task.title !== 'string') return undefined;
  return {
    id: task.id,
    title: task.title,
    completed: Boolean(task.completed),
    description: typeof task.description === 'string' ? task.description : undefined,
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString(),
    updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : new Date().toISOString(),
    dueAt: normalizeDate(task.dueAt),
    priority: normalizePriority(task.priority),
  };
}

// Rend (affiche) la liste des tâches visibles à l'écran
function render() {
  if (!list) return;
  list.innerHTML = '';

  const activeAccount = getActiveAccount();
  const readOnly = isReadOnlyMode();
  if (!activeAccount) {
    emptyMessage.hidden = true;
    return;
  }

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
    checkbox.disabled = readOnly;

    const editBtn = node.querySelector('.task-edit');
    const deleteBtn = node.querySelector('.task-delete');
    if (editBtn) editBtn.disabled = readOnly;
    if (deleteBtn) deleteBtn.disabled = readOnly;

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

// Met à jour l'état visuel des boutons de filtre
function updateFilterButtons() {
  const hasAccess = Boolean(getActiveAccount());
  filterButtons.forEach(button => {
    const isActive = button.dataset.filter === currentFilter;
    button.setAttribute('aria-pressed', String(isActive));
    button.disabled = !hasAccess;
  });
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
    window.requestAnimationFrame(() => {
      target.focus();
    });
  }
}

// Calcule les tâches à afficher selon filtres + agenda + tri
function getVisibleTasks() {
  let filtered = tasks.filter(task => {
    if (currentFilter === 'active') {
      return !task.completed;
    }
    if (currentFilter === 'completed') {
      return task.completed;
    }
    return true;
  });

  if (agendaScope === 'day') {
    filtered = filtered.filter(task => task.dueAt && task.dueAt === agendaDate);
  } else if (agendaScope === 'week') {
    const { start, end } = getWeekRangeISO(agendaDate);
    filtered = filtered.filter(task => task.dueAt && task.dueAt >= start && task.dueAt <= end);
  }

  return sortTasks(filtered);
}

// Trie les tâches selon le critère sélectionné
function sortTasks(listToSort) {
  const copy = [...listToSort];
  if (currentSort === 'dueAt') {
    copy.sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return compareCreated(a, b);
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      const diff = new Date(a.dueAt) - new Date(b.dueAt);
      if (diff !== 0) return diff;
      return compareCreated(a, b);
    });
    return copy;
  }

  if (currentSort === 'priority') {
    const priorityRank = { high: 0, med: 1, low: 2, none: 3 };
    copy.sort((a, b) => {
      const rankA = priorityRank[a.priority || 'none'];
      const rankB = priorityRank[b.priority || 'none'];
      if (rankA !== rankB) return rankA - rankB;
      return compareCreated(a, b);
    });
    return copy;
  }

  copy.sort(compareCreated);
  return copy;
}

function compareCreated(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

// Construit le texte d'informations (priorité, échéance)
function formatMeta(task) {
  const parts = [];
  if (task.priority) {
    parts.push(formatPriority(task.priority));
  }
  if (task.dueAt) {
    parts.push(formatDueDate(task.dueAt));
  }
  return parts.join(' • ');
}

// Formatage lisible de la priorité
function formatPriority(priority) {
  if (priority === 'high') return 'High priority';
  if (priority === 'med') return 'Medium priority';
  if (priority === 'low') return 'Low priority';
  return '';
}

// Formatage lisible de la date d'échéance
function formatDueDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const formatted = formatter.format(date);
  if (isPastDue(value)) {
    return `${formatted} (past due)`;
  }
  return formatted;
}

// Indique si la date est dépassée
function isPastDue(value) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(value);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

// Normalise une date vers le format ISO (yyyy-mm-dd)
function normalizeDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

// Normalise la priorité vers low/med/high ou undefined
function normalizePriority(value) {
  if (value === 'low' || value === 'med' || value === 'high') {
    return value;
  }
  return undefined;
}

// Retourne la date du jour au format ISO local (yyyy-mm-dd)
function todayISO() {
  const d = new Date();
  // convert to local date in ISO yyyy-mm-dd
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Convertit une chaîne ISO (yyyy-mm-dd) en objet Date (minuit local)
function parseISOToLocalDate(iso) {
  if (!iso || typeof iso !== 'string') return new Date();
  const parts = iso.split('-').map(Number);
  const d = new Date();
  d.setFullYear(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Convertit un objet Date en chaîne ISO locale (yyyy-mm-dd)
function toISODateLocal(d) {
  const copy = new Date(d.getTime());
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

// Ajoute/soustrait des jours à une date ISO et renvoie une nouvelle ISO
function addDaysISO(iso, delta) {
  const d = parseISOToLocalDate(iso);
  d.setDate(d.getDate() + delta);
  return toISODateLocal(d);
}

// Calcule le lundi et le dimanche de la semaine contenant anchorISO
function getWeekRangeISO(anchorISO) {
  const d = parseISOToLocalDate(anchorISO);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const deltaToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getTime());
  monday.setDate(d.getDate() + deltaToMonday);
  const sunday = new Date(monday.getTime());
  sunday.setDate(monday.getDate() + 6);
  return { start: toISODateLocal(monday), end: toISODateLocal(sunday) };
}

// Quand l'agenda est actif (jour/semaine), proposer cette date pour les nouvelles tâches
function syncAgendaToForm() {
  if (!dueInput) return;
  if (agendaScope === 'day' || agendaScope === 'week') {
    // default new task due date to selected agenda date
    dueInput.value = agendaDate;
  }
}

function setAgendaCollapsed(nextState) {
  agendaCollapsed = Boolean(nextState);
  if (!agendaSection || !agendaBody || !agendaToggleBtn) return;
  if (agendaCollapsed) {
    agendaSection.classList.add('collapsed');
    agendaBody.hidden = true;
    agendaToggleBtn.textContent = 'Show agenda';
    agendaToggleBtn.setAttribute('aria-expanded', 'false');
  } else {
    agendaSection.classList.remove('collapsed');
    agendaBody.hidden = false;
    agendaToggleBtn.textContent = 'Hide agenda';
    agendaToggleBtn.setAttribute('aria-expanded', 'true');
  }
}

function openMenu() {
  if (!menuButton || !menuPopover) return;
  menuPopover.hidden = false;
  menuButton.setAttribute('aria-expanded', 'true');
}

function closeMenu() {
  if (!menuButton || !menuPopover) return;
  menuPopover.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
}

// Exporte en CSV la liste de tâches actuellement affichée à l'écran
function exportVisibleTasksToCSV() {
  if (!getActiveAccount()) return; // disabled from UI otherwise
  const visible = getVisibleTasks();
  const headers = ['id','title','completed','createdAt','updatedAt','dueAt','priority'];
  const lines = [headers.join(',')];
  const escape = (val) => {
    if (val === undefined || val === null) return '';
    const s = String(val);
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  visible.forEach(t => {
    const row = [t.id, t.title, t.completed, t.createdAt, t.updatedAt, t.dueAt || '', t.priority || ''].map(escape).join(',');
    lines.push(row);
  });
  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fname = `todo-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.csv`;
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadTextFile(content, fileName, mimeType = 'application/json;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getAllTaskMapByUser() {
  const users = loadUsers();
  const out = {};
  Object.keys(users).forEach((accountId) => {
    out[accountId] = loadTasks(accountId);
  });
  return out;
}

function exportBackup() {
  const stamp = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const snapshot = {
    version: 1,
    exportedAt: stamp.toISOString(),
    users: loadUsers(),
    tasksByUser: getAllTaskMapByUser(),
  };
  const content = JSON.stringify(snapshot, null, 2);
  const fileName = `todo-backup-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.json`;
  downloadTextFile(content, fileName, 'application/json;charset=utf-8;');
  setAuthMessage('Sauvegarde exportée (.json).');
}

function importBackupFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty backup content');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    // optional support for .md with fenced json block
    const match = rawText.match(/```json\s*([\s\S]*?)\s*```/i);
    if (!match) throw error;
    parsed = JSON.parse(match[1]);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup format');
  }

  const users = parsed.users;
  const tasksByUser = parsed.tasksByUser;
  if (!users || typeof users !== 'object' || Array.isArray(users)) {
    throw new Error('Invalid users payload');
  }
  if (!tasksByUser || typeof tasksByUser !== 'object' || Array.isArray(tasksByUser)) {
    throw new Error('Invalid tasks payload');
  }

  const accounts = Object.keys(users);
  accounts.forEach((accountId) => {
    const value = tasksByUser[accountId];
    if (value !== undefined && !Array.isArray(value)) {
      throw new Error(`Invalid tasks list for ${accountId}`);
    }
  });

  if (!window.confirm('Importer la sauvegarde va écraser les comptes et tâches locaux. Continuer ?')) {
    return;
  }

  saveUsers(users);
  accounts.forEach((accountId) => {
    const key = getTaskStorageKey(accountId);
    if (!key) return;
    const arr = Array.isArray(tasksByUser[accountId]) ? tasksByUser[accountId].map(normalizeTask).filter(Boolean) : [];
    window.localStorage.setItem(key, JSON.stringify(arr));
  });

  const currentSession = loadSession();
  if (currentSession) {
    setCurrentAccount(currentSession);
  } else {
    clearPreviewAccount();
    updateAuthVisibility();
    populateReadonlyAccountsMenu();
    updateMenuState();
    updateAgendaControls();
    updateTaskCreationControls();
    updateFilterButtons();
    render();
  }

  setAuthMessage('Sauvegarde importée avec succès.');
}

// Met à jour une tâche existante (champs modifiés + horodatage)
function updateTask(id, nextFields) {
  if (!currentAccount) return;
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

// Supprime une tâche par identifiant
function deleteTask(id) {
  if (!currentAccount) return;
  const next = tasks.filter(task => task.id !== id);
  if (next.length === tasks.length) {
    pendingFocus = null;
    return;
  }
  tasks = next;
  saveTasks();
  render();
}

// Recherche une tâche par identifiant
function findTask(id) {
  return tasks.find(task => task.id === id);
}

// Edition inline du titre d'une tâche dans la liste
function startEdit(id, listItem) {
  if (!currentAccount) return;
  const task = findTask(id);
  if (!task) return;
  if (listItem.querySelector('.inline-edit')) return;

  listItem.classList.add('editing');

  const main = listItem.querySelector('.task-main');
  const actions = listItem.querySelector('.task-actions');
  if (main) main.hidden = true;
  if (actions) actions.hidden = true;

  const inlineForm = document.createElement('form');
  inlineForm.className = 'inline-edit';

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

  inlineForm.append(label, field, save, cancel);
  listItem.appendChild(inlineForm);

  const cleanup = () => {
    if (inlineForm.isConnected) {
      inlineForm.remove();
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

  inlineForm.addEventListener('submit', event => {
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

// Hachage du mot de passe (SHA‑256 via WebCrypto si disponible)
async function hashPassword(password) {
  if (window.crypto && window.crypto.subtle && window.TextEncoder) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  try {
    return window.btoa(unescape(encodeURIComponent(password)));
  } catch (error) {
    console.warn('Falling back to plain text password storage', error);
    return password;
  }
}

// Normalise le nom d'utilisateur (minuscule, sans espaces autour)
function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

// Génère un identifiant aléatoire hexadécimal (16 octets)
function createId() {
  const array = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    for (let index = 0; index < array.length; index += 1) {
      array[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}







