import test from 'node:test';
import assert from 'node:assert/strict';
import { compareConfigs } from '../dist/core.js';

const config = (clientId) => ({
  access_scopes: { scopes: 'read_orders' },
  ...(clientId === undefined ? {} : { client_id: clientId }),
});

test('ignores absent client IDs', () => {
  assert.deepEqual(compareConfigs(config(), config()), []);
});

test('reports client ID addition without exposing its value', () => {
  const secret = 'SYNTHETIC_CLIENT_ID_ADDED_8E2';
  const findings = compareConfigs(config(), config(secret));

  assert.deepEqual(findings.map(({ ruleId }) => ruleId), ['CLIENT_ID_ADDED']);
  assert.equal(JSON.stringify(findings).includes(secret), false);
});

test('reports client ID removal without exposing its value', () => {
  const secret = 'SYNTHETIC_CLIENT_ID_REMOVED_7A5';
  const findings = compareConfigs(config(secret), config());

  assert.deepEqual(findings.map(({ ruleId }) => ruleId), ['CLIENT_ID_REMOVED']);
  assert.equal(JSON.stringify(findings).includes(secret), false);
});

test('reports client ID replacement without exposing either value', () => {
  const oldId = 'SYNTHETIC_CLIENT_ID_OLD_91D';
  const newId = 'SYNTHETIC_CLIENT_ID_NEW_24B';

  const findings = compareConfigs(config(oldId), config(newId));
  const output = JSON.stringify(findings);

  assert.deepEqual(findings.map(({ ruleId }) => ruleId), ['CLIENT_ID_CHANGED']);
  assert.equal(findings[0].field, 'client_id');
  assert.equal(findings[0].severity, 'review');
  assert.equal(output.includes(oldId), false);
  assert.equal(output.includes(newId), false);
});

test('ignores unchanged client IDs', () => {
  assert.deepEqual(
    compareConfigs(config('SYNTHETIC_SAME_ID'), config('SYNTHETIC_SAME_ID')),
    [],
  );
});

test('rejects malformed client IDs without echoing values', () => {
  const secret = 'SYNTHETIC_SECRET_NOT_FOR_LOGS';

  for (const invalid of ['', '  ', 123, [], {}, null, undefined]) {
    const bad = { ...config(), client_id: invalid };

    for (const [before, after] of [
      [bad, config(secret)],
      [config(secret), bad],
    ]) {
      assert.throws(
        () => compareConfigs(before, after),
        (error) => {
          assert.match(error.message, /client_id must be a non-empty string/);
          assert.equal(error.message.includes(secret), false);
          return true;
        },
      );
    }
  }
});

test('reports client ID and scope changes together', () => {
  const before = config('SYNTHETIC_OLD');
  const after = {
    ...config('SYNTHETIC_NEW'),
    access_scopes: { scopes: 'read_orders,read_products' },
  };

  const findings = compareConfigs(before, after);

  assert.deepEqual(
    findings.map(({ ruleId }) => ruleId).sort(),
    ['CLIENT_ID_CHANGED', 'SCOPE_REQUIRED_ADDED'],
  );

  const output = JSON.stringify(findings);
  assert.equal(output.includes('SYNTHETIC_OLD'), false);
  assert.equal(output.includes('SYNTHETIC_NEW'), false);
});
