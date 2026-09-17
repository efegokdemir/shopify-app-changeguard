import test from 'node:test';
import assert from 'node:assert/strict';
import { compareConfigs } from '../dist/core.js';

const cfg = (webhooks) => ({
  access_scopes: { scopes: 'read_orders' },
  ...(webhooks === undefined ? {} : { webhooks }),
});
const subscription = (topics, uri = '/webhooks', extra = {}) => ({ topics, uri, ...extra });

test('reports webhook API version changes without printing version values', () => {
  const findings = compareConfigs(cfg({ api_version: '2026-04' }), cfg({ api_version: '2026-07' }));
  assert.deepEqual(findings.map((f) => f.ruleId), ['WEBHOOK_API_VERSION_CHANGED']);
  assert.doesNotMatch(JSON.stringify(findings), /2026-04|2026-07/);
});

test('reports webhook route addition and removal without printing destinations', () => {
  const before = cfg({ subscriptions: [subscription(['orders/create'], 'https://old.test/?token=SECRET_OLD')] });
  const after = cfg({ subscriptions: [subscription(['products/create'], 'https://new.test/?token=SECRET_NEW')] });
  const findings = compareConfigs(before, after);
  assert.deepEqual(findings.map((f) => f.ruleId), ['WEBHOOK_SUBSCRIPTIONS_CHANGED']);
  assert.match(findings[0].summary, /added: 1; removed: 1; modified: 0/);
  assert.doesNotMatch(JSON.stringify(findings), /SECRET|old\.test|new\.test|products\/create/);
});

test('reports changed destination and filter as modified, not added/removed', () => {
  const before = cfg({ subscriptions: [subscription(['orders/create'], '/old', { filter: 'status:active' })] });
  const after = cfg({ subscriptions: [subscription(['orders/create'], '/new', { filter: 'status:inactive' })] });
  const findings = compareConfigs(before, after);
  assert.match(findings[0].summary, /added: 0; removed: 0; modified: 1/);
  assert.doesNotMatch(JSON.stringify(findings), /\/old|\/new|status:active|status:inactive/);
});

test('ignores reordered subscriptions, topics and include_fields', () => {
  const before = cfg({ subscriptions: [
    subscription(['orders/create', 'products/update'], '/first', { include_fields: ['id', 'title'] }),
    subscription(['app/uninstalled'], '/second'),
  ] });
  const after = cfg({ subscriptions: [
    subscription(['app/uninstalled'], '/second'),
    subscription(['products/update', 'orders/create', 'orders/create'], '/first', { include_fields: ['title', 'id', 'id'] }),
  ] });
  assert.deepEqual(compareConfigs(before, after), []);
});

test('ignores grouping changes when topic delivery settings are identical', () => {
  const before = cfg({ subscriptions: [subscription(['orders/create', 'products/update'], '/same')] });
  const after = cfg({ subscriptions: [
    subscription(['orders/create'], '/same'),
    subscription(['products/update'], '/same'),
  ] });
  assert.deepEqual(compareConfigs(before, after), []);
});

test('detects compliance subscription removal', () => {
  const before = cfg({ subscriptions: [
    { compliance_topics: ['customers/redact'], uri: '/redact' },
  ] });
  const after = cfg({ subscriptions: [] });
  const findings = compareConfigs(before, after);
  assert.match(findings[0].summary, /added: 0; removed: 1; modified: 0/);
});

test('rejects malformed webhook shapes instead of claiming success', () => {
  assert.throws(() => compareConfigs(cfg(), cfg('broken')), /\[webhooks\]/);
  assert.throws(() => compareConfigs(cfg(), cfg({ subscriptions: 'broken' })), /array/);
  assert.throws(() => compareConfigs(cfg(), cfg({ subscriptions: [{ topics: ['orders/create'] }] })), /uri/);
  assert.throws(() => compareConfigs(cfg(), cfg({ subscriptions: [{ uri: '/webhooks' }] })), /topics/);
  assert.throws(() => compareConfigs(cfg(), cfg({ subscriptions: [subscription(['orders/create'], '/webhooks', { include_fields: 1 })] })), /include_fields/);
});

test('ignores unrelated event subscriptions and unknown root fields', () => {
  const before = { ...cfg(), events: { api_version: 'unstable' }, client_secret: 'SECRET_OLD' };
  const after = { ...cfg(), events: { api_version: '2026-07' }, client_secret: 'SECRET_NEW' };
  assert.deepEqual(compareConfigs(before, after), []);
});

test('reports scopes, URLs and webhooks together without secret leakage', () => {
  const before = {
    access_scopes: { scopes: 'read_orders' },
    application_url: 'https://old.test/?token=SECRET_OLD',
    webhooks: { api_version: '2026-04', subscriptions: [subscription(['orders/create'], '/old')] },
  };
  const after = {
    access_scopes: { scopes: 'read_orders,read_products' },
    application_url: 'https://new.test/?token=SECRET_NEW',
    webhooks: { api_version: '2026-07', subscriptions: [subscription(['orders/create'], '/new')] },
  };
  const findings = compareConfigs(before, after);
  assert.deepEqual(findings.map((f) => f.ruleId).sort(), [
    'SCOPE_REQUIRED_ADDED',
    'APPLICATION_URL_CHANGED',
    'WEBHOOK_API_VERSION_CHANGED',
    'WEBHOOK_SUBSCRIPTIONS_CHANGED',
  ].sort());
  assert.doesNotMatch(JSON.stringify(findings), /SECRET|old\.test|new\.test|\/old|\/new/);
});
