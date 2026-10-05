import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';

const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const nonempty = value => typeof value === 'string' && value.length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class LegacyHistoryError extends Error {
  constructor(code) { super(code); this.name = 'LegacyHistoryError'; this.code = code; }
}
const reject = code => { throw new LegacyHistoryError(code); };
const parse = raw => {
  if (typeof raw !== 'string') reject('SOURCE_CONTENT_MISSING');
  try { return JSON.parse(raw); } catch { reject('SOURCE_CONTENT_INVALID'); }
};

const archiveSchema = z.object({
  kind: z.literal('LEGACY_PROJECT_ARCHIVE'), readOnly: z.literal(true),
  projectId: z.string().min(1), creationSessionId: z.string().min(1),
  actorName: z.string().min(1),
  source: z.object({ panelSha256: z.string(), projectMemorySha256: z.string(),
    evidenceSha256: z.array(z.string()), projectCreatedSeq: z.number().int() }),
  turns: z.array(z.object({ seq: z.number().int(), at: z.number().nullable(),
    revision: z.number().int(), utterance: z.string().min(1), response: z.record(z.string(), z.unknown()),
    source: z.object({ seq: z.number().int(), clientRequestIdDigest: z.string(),
      evidenceSha256: z.string() }) })),
}).strict();

const legacyHistoryDomain = defineDomain({
  name: 'hanaworlds_workshop_legacy_history', version: 1,
  tables: { archives: domainTable(archiveSchema) },
});

/** Separate durable data: no Core Session identity or session/v2 writer. */
export class LegacyHistoryStore {
  constructor(domainFacility) { this.domainFacility = domainFacility; this.opened = null; }
  async #table() {
    if (!this.opened) {
      const facility = this.domainFacility();
      if (!facility?.open) reject('ARCHIVE_STORAGE_UNAVAILABLE');
      this.opened = facility.open(legacyHistoryDomain);
    }
    return (await this.opened).table('archives');
  }
  async get(projectId) { return structuredClone((await this.#table()).get(projectId) ?? null); }
  async put(projectId, archive) { await (await this.#table()).put(projectId, archiveSchema.parse(archive)); }
  async list() { return [...(await this.#table()).entries()].map(([, value]) => structuredClone(value)); }
  async close() { if (this.opened) await (await this.opened).close(); }
}

function buildArchive(input) {
  const { projectId, creationSessionId, actorName,
    panelJson, projectMemoryJson, evidenceJson } = input ?? {};
  if (![projectId, creationSessionId, actorName].every(nonempty))
    reject('SOURCE_ASSOCIATION_MISSING');
  if (!Array.isArray(evidenceJson) || !evidenceJson.length)
    reject('SOURCE_EVIDENCE_MISSING');
  const panel = parse(panelJson);
  const memory = parse(projectMemoryJson);
  if (panel?.schema !== 'hanaworlds.workshop-panel-sessions.v1' ||
      !record(panel.sessions?.[actorName]) ||
      panel.sessions[actorName].projectId !== projectId ||
      panel.sessions[actorName].creationSessionId !== creationSessionId)
    reject('SOURCE_ASSOCIATION_MISMATCH');
  const events = memory?.global?.events;
  if (!Array.isArray(events)) reject('SOURCE_CONTENT_INVALID');
  const created = events.filter(event => event?.type === 'project.created' &&
    event.project?.projectId === projectId);
  if (created.length !== 1 || created[0].project.creationSessionId !== creationSessionId ||
      created[0].project.ownerId !== actorName ||
      !Number.isSafeInteger(created[0].seq))
    reject('SOURCE_ASSOCIATION_MISMATCH');
  const committed = events.filter(event => event?.type === 'turn.committed' &&
    event.projectId === projectId).sort((a, b) => a.seq - b.seq);
  if (!committed.length) reject('SOURCE_CONTENT_MISSING');
  const evidence = new Map();
  for (const raw of evidenceJson) {
    const value = parse(raw);
    if (value?.schema !== 'hanaworlds.workshop-turn-evidence.v1' ||
        value.projectId !== projectId || value.actorId !== actorName ||
        !nonempty(value.clientRequestIdDigest) ||
        evidence.has(value.clientRequestIdDigest))
      reject('SOURCE_EVIDENCE_MISMATCH');
    evidence.set(value.clientRequestIdDigest, { value, sha256: sha(raw) });
  }
  if (evidence.size !== committed.length) reject('SOURCE_EVIDENCE_MISSING');
  const seenRequests = new Set();
  const turns = committed.map((event, index) => {
    const { turn } = event;
    const source = turn?.record;
    const response = turn?.response;
    if (!Number.isSafeInteger(event.seq) ||
        event.seq <= created[0].seq ||
        (index > 0 && event.seq <= committed[index - 1].seq) ||
        !nonempty(turn?.utterance) || !record(response) ||
        !record(response.action) ||
        !nonempty(response.action.kind) ||
        !nonempty(source?.clientRequestId))
      reject('SOURCE_CONTENT_MISSING');
    if (source.projectId !== projectId || response.projectId !== projectId ||
        response.creationSessionId !== creationSessionId ||
        !Number.isSafeInteger(response.revision))
      reject('SOURCE_ASSOCIATION_MISMATCH');
    const requestDigest = sha(source.clientRequestId);
    if (seenRequests.has(requestDigest)) reject('SOURCE_EVIDENCE_MISMATCH');
    seenRequests.add(requestDigest);
    const matched = evidence.get(requestDigest);
    if (!matched) reject('SOURCE_EVIDENCE_MISSING');
    if (source.utteranceDigest !== sha(turn.utterance) ||
        source.responseDigest !== sha(canonicalize(response)) ||
        matched.value.utteranceDigest !== source.utteranceDigest ||
        matched.value.actionKind !== response.action.kind)
      reject('SOURCE_EVIDENCE_MISMATCH');
    return { seq: event.seq, at: Number.isSafeInteger(event.at) ? event.at : null,
      revision: response.revision, utterance: turn.utterance,
      response: structuredClone(response), source: { seq: event.seq,
        clientRequestIdDigest: requestDigest, evidenceSha256: matched.sha256 } };
  });
  return archiveSchema.parse({ kind: 'LEGACY_PROJECT_ARCHIVE', readOnly: true,
    projectId, creationSessionId, actorName,
    source: { panelSha256: sha(panelJson), projectMemorySha256: sha(projectMemoryJson),
      evidenceSha256: evidenceJson.map(sha), projectCreatedSeq: created[0].seq }, turns });
}

function sameSource(left, right) {
  return JSON.stringify(left.source) === JSON.stringify(right.source);
}

/** Host-only public Workshop port. The caller supplies old bytes; this port never reads a profile. */
export class LegacyHistoryService {
  constructor(store) { this.store = store; this.pending = new Map(); }
  async importArchive(input) {
    const archive = buildArchive(input);
    const prior = this.pending.get(archive.projectId) ?? Promise.resolve();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const tail = prior.then(() => held);
    this.pending.set(archive.projectId, tail);
    await prior;
    try {
      const existing = await this.store.get(archive.projectId);
      if (existing) {
        if (!sameSource(existing, archive)) reject('ARCHIVE_CONFLICT');
        return { status: 'ALREADY_IMPORTED', projectId: archive.projectId,
          creationSessionId: archive.creationSessionId, turnCount: archive.turns.length };
      }
      await this.store.put(archive.projectId, archive);
      return { status: 'IMPORTED', projectId: archive.projectId,
        creationSessionId: archive.creationSessionId, turnCount: archive.turns.length };
    } finally {
      release();
      if (this.pending.get(archive.projectId) === tail)
        this.pending.delete(archive.projectId);
    }
  }
  async readArchive({ projectId, creationSessionId, actorName } = {}) {
    if (![projectId, creationSessionId, actorName].every(nonempty))
      reject('SOURCE_ASSOCIATION_MISSING');
    const archive = await this.store.get(projectId);
    if (!archive) reject('ARCHIVE_NOT_FOUND');
    if (archive.creationSessionId !== creationSessionId || archive.actorName !== actorName)
      reject('SOURCE_ASSOCIATION_MISMATCH');
    return structuredClone(archive);
  }
  async listArchives({ actorName } = {}) {
    if (!nonempty(actorName)) reject('SOURCE_ASSOCIATION_MISSING');
    return (await this.store.list()).filter(item => item.actorName === actorName)
      .map(item => ({ projectId: item.projectId,
        creationSessionId: item.creationSessionId, actorName: item.actorName,
        turnCount: item.turns.length, readOnly: true, kind: item.kind }));
  }
}
