import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationFor } from './navigation.ts';

test('guest and student menus exclude staff routes', () => {
  assert.deepEqual(navigationFor(null).map((link) => link.href), ['/', '/login']);
  assert.deepEqual(navigationFor('student').map((link) => link.href), ['/', '/leave', '/transfers', '/me']);
});
test('teacher and admin menus expose their own tasks', () => {
  assert.deepEqual(navigationFor('teacher').map((link) => link.href), ['/', '/courses', '/live', '/leave/review', '/me']);
  assert.deepEqual(navigationFor('admin').map((link) => link.href), ['/', '/courses', '/live', '/admin', '/me']);
});
