import test from 'node:test';
import assert from 'node:assert/strict';
import { compareConfigs } from '../dist/core.js';

const cfg = (scopes, optional_scopes = []) => ({ access_scopes: { scopes, optional_scopes } });

test('reports required scope additions', () => {
  const results = compareConfigs(cfg('read_orders'), cfg('read_orders,read_products'));
  assert.equal(results.length, 1);
  assert.equal(results[0].ruleId, 'SCOPE_REQUIRED_ADDED');
  assert.match(results[0].summary, /read_products/);
});

test('ignores comma list reorder and duplicates', () => {
  assert.deepEqual(compareConfigs(cfg('read_orders,read_products'), cfg(' read_products, read_orders,read_orders ')), []);
});

test('reports optional scope removal', () => {
  const results = compareConfigs(cfg('read_orders', ['read_products']), cfg('read_orders'));
  assert.equal(results.length, 1);
  assert.equal(results[0].ruleId, 'SCOPE_OPTIONAL_REMOVED');
});

test('rejects ambiguous scope declarations', () => {
  assert.throws(() => compareConfigs(cfg('read_orders', ['read_orders']), cfg('read_orders')), /both required and optional/);
});

test('does not expose unrelated app configuration fields in findings', () => {
  const oldConfig = { ...cfg('read_orders'), client_secret: 'do-not-print-me' };
  const newConfig = { ...cfg('read_orders'), client_secret: 'another-secret' };
  assert.deepEqual(compareConfigs(oldConfig, newConfig), []);
});
