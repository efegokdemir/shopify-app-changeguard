import { compareUrls } from './urls.js';

export type Severity = 'review';
export type Finding = {
  ruleId: string;
  severity: Severity;
  field: string;
  summary: string;
};

type Config = Record<string, unknown>;

type Scopes = { required: Set<string>; optional: Set<string> };

function isObject(value: unknown): value is Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readScopes(config: Config): Scopes {
  if (!isObject(config.access_scopes)) {
    throw new Error('Missing or invalid [access_scopes] table');
  }
  const section = config.access_scopes;
  if (typeof section.scopes !== 'string') {
    throw new Error('[access_scopes].scopes must be a comma-separated string');
  }
  const optional = section.optional_scopes ?? [];
  if (!Array.isArray(optional) || !optional.every((s) => typeof s === 'string' && s.trim())) {
    throw new Error('[access_scopes].optional_scopes must be an array of non-empty strings');
  }
  const required = new Set(section.scopes.split(',').map((s) => s.trim()).filter(Boolean));
  const optionalSet = new Set((optional as string[]).map((s) => s.trim()));
  const overlap = [...required].filter((scope) => optionalSet.has(scope));
  if (overlap.length > 0) {
    throw new Error('Scope cannot be both required and optional: ' + overlap.sort().join(', '));
  }
  return { required, optional: optionalSet };
}

export function compareConfigs(before: Config, after: Config): Finding[] {
  const oldScopes = readScopes(before);
  const newScopes = readScopes(after);
  const changes: Finding[] = [];

  for (const scope of [...oldScopes.optional].filter((s) => newScopes.required.has(s)).sort()) {
    changes.push({
      ruleId: 'SCOPE_OPTIONAL_TO_REQUIRED',
      severity: 'review',
      field: 'access_scopes',
      summary: `scope changed from optional to required: ${scope}`,
    });
  }

  for (const scope of [...oldScopes.required].filter((s) => newScopes.optional.has(s)).sort()) {
    changes.push({
      ruleId: 'SCOPE_REQUIRED_TO_OPTIONAL',
      severity: 'review',
      field: 'access_scopes',
      summary: `scope changed from required to optional: ${scope}`,
    });
  }

  const compare = (oldValues: Set<string>, newValues: Set<string>, kind: 'required' | 'optional') => {
    const oldOther = kind === 'required' ? oldScopes.optional : oldScopes.required;
    const newOther = kind === 'required' ? newScopes.optional : newScopes.required;

    for (const scope of [...newValues].filter((value) => !oldValues.has(value) && !oldOther.has(value)).sort()) {
      changes.push({
        ruleId: `SCOPE_${kind.toUpperCase()}_ADDED`,
        severity: 'review',
        field: `access_scopes.${kind === 'required' ? 'scopes' : 'optional_scopes'}`,
        summary: `${kind} scope added: ${scope}`,
      });
    }
    for (const scope of [...oldValues].filter((value) => !newValues.has(value) && !newOther.has(value)).sort()) {
      changes.push({
        ruleId: `SCOPE_${kind.toUpperCase()}_REMOVED`,
        severity: 'review',
        field: `access_scopes.${kind === 'required' ? 'scopes' : 'optional_scopes'}`,
        summary: `${kind} scope removed: ${scope}`,
      });
    }
  };
  compare(oldScopes.required, newScopes.required, 'required');
  compare(oldScopes.optional, newScopes.optional, 'optional');
  changes.push(...compareUrls(before, after));
  return changes.sort((a, b) =>
    a.field.localeCompare(b.field) || a.ruleId.localeCompare(b.ruleId) || a.summary.localeCompare(b.summary),
  );
}
