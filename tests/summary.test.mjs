import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSummary } from '../scripts/summary.mjs';

test('renders an empty review', () => {
  const text = renderSummary({ files: [], unreviewed: [] });

  assert.match(text, /Configuration files reviewed: 0/);
  assert.match(text, /Review findings: 0/);
  assert.match(text, /Unreviewable configurations: 0/);
  assert.doesNotMatch(text, /Findings by rule/);
});

test('counts findings by rule', () => {
  const text = renderSummary({
    files: [{
      findings: [
        { ruleId: 'SCOPE_REQUIRED_ADDED' },
        { ruleId: 'SCOPE_REQUIRED_ADDED' },
        { ruleId: 'WEBHOOK_CHANGED' },
      ],
    }],
    unreviewed: [],
  });

  assert.match(text, /Review findings: 3/);
  assert.match(text, /\| SCOPE_REQUIRED_ADDED \| 2 \|/);
  assert.match(text, /\| WEBHOOK_CHANGED \| 1 \|/);
});

test('does not expose paths, URLs or finding descriptions', () => {
  const secret = 'PRIVATE_MARKER_91BC';
  const text = renderSummary({
    files: [{
      path: `config-${secret}.toml`,
      findings: [{
        ruleId: 'URL_CHANGED',
        summary: `https://example.invalid/${secret}`,
        field: secret,
      }],
    }],
    unreviewed: [{
      path: secret,
      reason: `Sensitive content: ${secret}`,
    }],
  });

  assert.match(text, /Unreviewable configurations: 1/);
  assert.match(text, /Some configurations could not be reviewed/);
  assert.doesNotMatch(text, /PRIVATE_MARKER_91BC/);
  assert.doesNotMatch(text, /example\.invalid/);
});

test('rejects unsafe rule IDs instead of rendering Markdown', () => {
  assert.throws(
    () => renderSummary({
      files: [{
        findings: [{ ruleId: 'BAD|RULE\nINJECTION' }],
      }],
      unreviewed: [],
    }),
    /Invalid rule ID/,
  );
});

test('rejects malformed reports', () => {
  assert.throws(
    () => renderSummary({ files: null, unreviewed: [] }),
    /Invalid ChangeGuard report/,
  );

  assert.throws(
    () => renderSummary({
      files: [{ findings: null }],
      unreviewed: [],
    }),
    /Invalid findings/,
  );
});


test('shows explicit review status for informational findings', () => {
  const text = renderSummary({
    files: [{
      findings: [{ ruleId: 'CLIENT_ID_CHANGED' }],
    }],
    unreviewed: [],
  });

  assert.match(text, /Manual review recommended:/);
  assert.match(text, /informational and do not fail the check/);
  assert.doesNotMatch(text, /Review incomplete:/);
});

test('shows an incomplete review when configurations cannot be analysed', () => {
  const text = renderSummary({
    files: [],
    unreviewed: [{ reason: 'Unsupported configuration' }],
  });

  assert.match(text, /Review incomplete:/);
  assert.match(text, /The check fails/);
  assert.doesNotMatch(text, /Manual review recommended:/);
});

test('prioritises incomplete review when findings also exist', () => {
  const text = renderSummary({
    files: [{
      findings: [{ ruleId: 'SCOPE_REQUIRED_ADDED' }],
    }],
    unreviewed: [{ reason: 'Unsupported configuration' }],
  });

  assert.match(text, /Review incomplete:/);
  assert.match(text, /Review findings: 1/);
  assert.doesNotMatch(text, /Manual review recommended:/);
});

test('never treats an empty review as deployment approval', () => {
  const text = renderSummary({
    files: [],
    unreviewed: [],
  });

  assert.match(text, /No supported-field changes detected/);
  assert.match(text, /not a deployment or security approval/);
  assert.doesNotMatch(text, /Manual review recommended:/);
});
