import type { Finding } from './core.js';

type Config = Record<string, unknown>;

function isTable(value: unknown): value is Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalise(value: unknown): unknown {
  // Stable comparison of TOML tables, regardless of object key order.
  if (Array.isArray(value)) return value.map(normalise);
  if (isTable(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalise(value[key])]));
  }
  return value;
}

function readTopicList(subscription: Config, field: 'topics' | 'compliance_topics'): string[] {
  const value = subscription[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.trim())) {
    throw new Error(`webhooks.subscriptions.${field} must be an array of non-empty strings`);
  }
  return [...new Set((value as string[]).map((topic) => topic.trim()))].sort();
}

type Webhooks = { version?: string; routes: Map<string, Set<string>> };

function readWebhooks(config: Config): Webhooks {
  const raw = config.webhooks;
  if (raw === undefined) return { routes: new Map() };
  if (!isTable(raw)) throw new Error('[webhooks] must be a table');
  const version = raw.api_version;
  if (version !== undefined && (typeof version !== 'string' || !version.trim())) {
    throw new Error('[webhooks].api_version must be a non-empty string');
  }
  // Avoid claiming to validate Shopify's entire app configuration schema.
  const subscriptions = raw.subscriptions ?? [];
  if (!Array.isArray(subscriptions)) {
    throw new Error('webhooks.subscriptions must be an array of tables');
  }
  const routes = new Map<string, Set<string>>();
  for (const item of subscriptions) {
    if (!isTable(item)) throw new Error('Each webhook subscription must be a table');
    const topics = readTopicList(item, 'topics');
    const compliance = readTopicList(item, 'compliance_topics');
    if (!topics.length && !compliance.length) {
      throw new Error('Webhook subscription requires topics or compliance_topics');
    }
    if (typeof item.uri !== 'string' || !item.uri.trim()) {
      throw new Error('Webhook subscription uri must be a non-empty string');
    }
    if (item.include_fields !== undefined &&
        (!Array.isArray(item.include_fields) ||
          !item.include_fields.every((field) => typeof field === 'string' && field.trim()))) {
      throw new Error('Webhook include_fields must be an array of non-empty strings');
    }
    if (item.filter !== undefined && typeof item.filter !== 'string') {
      throw new Error('Webhook filter must be a string');
    }
    // Topics are modelled as individual routes so grouping/splitting equivalent
    // subscriptions does not create noise. Destinations and delivery settings
    // are compared but never included in findings.
    const { topics: _topics, compliance_topics: _compliance, ...delivery } = item;
    const fingerprint = JSON.stringify(normalise({
      ...delivery,
      ...(item.include_fields !== undefined
        ? { include_fields: [...new Set(item.include_fields as string[])].sort() }
        : {}),
    }));
    for (const [kind, list] of [['topics', topics], ['compliance_topics', compliance]] as const) {
      for (const topic of list) {
        const key = JSON.stringify([kind, topic]);
        const configurations = routes.get(key) ?? new Set<string>();
        configurations.add(fingerprint);
        routes.set(key, configurations);
      }
    }
  }
  return { version: version as string | undefined, routes };
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

export function compareWebhooks(before: Config, after: Config): Finding[] {
  // Parse and validate the supported structure on both sides before reporting.
  const oldWebhooks = readWebhooks(before);
  const newWebhooks = readWebhooks(after);
  const findings: Finding[] = [];
  if (oldWebhooks.version !== newWebhooks.version) {
    findings.push({
      ruleId: 'WEBHOOK_API_VERSION_CHANGED',
      severity: 'review',
      field: 'webhooks.api_version',
      summary: 'webhook API version changed; review delivery payload compatibility',
    });
  }
  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const key of new Set([...oldWebhooks.routes.keys(), ...newWebhooks.routes.keys()])) {
    const previous = oldWebhooks.routes.get(key);
    const next = newWebhooks.routes.get(key);
    if (!previous) added++;
    else if (!next) removed++;
    else if (!sameSet(previous, next)) modified++;
  }
  if (added || removed || modified) {
    findings.push({
      ruleId: 'WEBHOOK_SUBSCRIPTIONS_CHANGED',
      severity: 'review',
      field: 'webhooks.subscriptions',
      summary: `webhook routes changed (added: ${added}; removed: ${removed}; modified: ${modified}); review topics, destinations and delivery settings`,
    });
  }
  // Neither webhook URLs, topics nor filter expressions are printed.
  return findings;
}
