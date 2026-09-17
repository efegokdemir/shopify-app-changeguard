import type { Finding } from './core.js';

type Config = Record<string, unknown>;

function readClientId(config: Config): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(config, 'client_id')) {
    return undefined;
  }

  const value = config.client_id;

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('client_id must be a non-empty string');
  }

  return value;
}

export function compareClientIds(before: Config, after: Config): Finding[] {
  const oldId = readClientId(before);
  const newId = readClientId(after);

  if (oldId === newId) {
    return [];
  }

  const ruleId =
    oldId === undefined ? 'CLIENT_ID_ADDED' :
    newId === undefined ? 'CLIENT_ID_REMOVED' :
    'CLIENT_ID_CHANGED';

  const summary =
    oldId === undefined ? 'client ID added' :
    newId === undefined ? 'client ID removed' :
    'client ID changed';

  return [{
    ruleId,
    severity: 'review',
    field: 'client_id',
    summary,
  }];
}
