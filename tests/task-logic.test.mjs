import test from 'node:test';
import assert from 'node:assert/strict';

function compareCreated(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function sortTasks(listToSort, currentSort) {
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

function parseISOToLocalDate(iso) {
  if (!iso || typeof iso !== 'string') return new Date();
  const parts = iso.split('-').map(Number);
  const d = new Date();
  d.setFullYear(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODateLocal(d) {
  const copy = new Date(d.getTime());
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function getWeekRangeISO(anchorISO) {
  const d = parseISOToLocalDate(anchorISO);
  const day = d.getDay();
  const deltaToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getTime());
  monday.setDate(d.getDate() + deltaToMonday);
  const sunday = new Date(monday.getTime());
  sunday.setDate(monday.getDate() + 6);
  return { start: toISODateLocal(monday), end: toISODateLocal(sunday) };
}

function normalizeDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function getVisibleTasks({ tasks, currentFilter = 'all', agendaScope = 'all', agendaDate, currentSort = 'created' }) {
  let filtered = tasks.filter(task => {
    if (currentFilter === 'active') return !task.completed;
    if (currentFilter === 'completed') return task.completed;
    return true;
  });

  if (agendaScope === 'day') {
    filtered = filtered.filter(task => task.dueAt && task.dueAt === agendaDate);
  } else if (agendaScope === 'week') {
    const { start, end } = getWeekRangeISO(agendaDate);
    filtered = filtered.filter(task => task.dueAt && task.dueAt >= start && task.dueAt <= end);
  }

  return sortTasks(filtered, currentSort);
}

const fixtures = [
  { id: 'a', title: 'A', completed: false, createdAt: '2026-03-10T10:00:00.000Z', dueAt: '2026-03-20', priority: 'med' },
  { id: 'b', title: 'B', completed: true,  createdAt: '2026-03-11T10:00:00.000Z', dueAt: '2026-03-19', priority: 'high' },
  { id: 'c', title: 'C', completed: false, createdAt: '2026-03-09T10:00:00.000Z', dueAt: undefined,   priority: 'low' },
  { id: 'd', title: 'D', completed: false, createdAt: '2026-03-12T10:00:00.000Z', dueAt: '2026-03-24', priority: undefined },
];

test('sort by due date puts earliest due first, undated last', () => {
  const result = sortTasks(fixtures, 'dueAt').map(t => t.id);
  assert.deepEqual(result, ['b', 'a', 'd', 'c']);
});

test('sort by priority uses high > med > low > none', () => {
  const result = sortTasks(fixtures, 'priority').map(t => t.id);
  assert.deepEqual(result, ['b', 'a', 'c', 'd']);
});

test('filter active returns only non-completed tasks', () => {
  const result = getVisibleTasks({ tasks: fixtures, currentFilter: 'active' }).map(t => t.id);
  assert.equal(result.includes('b'), false);
  assert.deepEqual(result, ['d', 'a', 'c']);
});

test('filter completed returns only completed tasks', () => {
  const result = getVisibleTasks({ tasks: fixtures, currentFilter: 'completed' }).map(t => t.id);
  assert.deepEqual(result, ['b']);
});

test('week scope includes tasks within monday-sunday range', () => {
  // 2026-03-19 is Thursday, week range expected: 2026-03-16 -> 2026-03-22
  const result = getVisibleTasks({ tasks: fixtures, agendaScope: 'week', agendaDate: '2026-03-19', currentSort: 'dueAt' }).map(t => t.id);
  assert.deepEqual(result, ['b', 'a']);
});

test('getWeekRangeISO returns monday to sunday', () => {
  const range = getWeekRangeISO('2026-03-19');
  assert.deepEqual(range, { start: '2026-03-16', end: '2026-03-22' });
});

test('normalizeDate returns yyyy-mm-dd and rejects invalid values', () => {
  assert.equal(normalizeDate('2026-03-19'), '2026-03-19');
  assert.equal(normalizeDate('not-a-date'), undefined);
  assert.equal(normalizeDate(''), undefined);
});
