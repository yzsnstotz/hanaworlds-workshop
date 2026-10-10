import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';

const identitySchema = z.object({
  id: z.string().min(1), version: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(), cwd: z.string().nullable(),
});
const stateSchema = z.object({
  context: z.object({
    currentSession: z.string().min(1), activeWorldRef: z.string().nullable(),
    orderedSelectedObjectRefs: z.array(z.string()),
    sessionRevision: z.string().min(1), selectionRevision: z.string(),
  }).passthrough(),
  turns: z.array(z.object({ turnRef: z.string().min(1),
    turnRevision: z.string().min(1), text: z.string(),
  }).passthrough()),
}).passthrough();
export const workshopProjectionDomain = defineDomain({
  // contracts v1.1 optional confirmed placement starts a fresh root; old projections are not migrated.
  name: 'hanaworlds_workshop_v11', version: 1,
  tables: { sessions: domainTable(z.object({
    coreIdentity: identitySchema, state: stateSchema,
  })) },
});

export function coreIdentity(header, sessionRef) {
  const identity = identitySchema.parse({
    id: header?.id, version: header?.version,
    createdAt: header?.createdAt,
    cwd: header?.cwd ?? null,
  });
  if (identity.id !== sessionRef) throw Error('Core Session identity mismatch');
  return identity;
}

function sameIdentity(left, right) {
  return left.id === right.id && left.version === right.version &&
    left.createdAt === right.createdAt && left.cwd === right.cwd;
}

/** Owns only a Workshop projection. The Core Session and its JSONL writer stay with DSH. */
export class WorkshopProjectionStore {
  constructor(domainFacility) {
    this.domainFacility = domainFacility;
    this.opened = null;
  }

  async #table() {
    if (!this.opened) {
      const facility = this.domainFacility();
      if (!facility?.open) throw Error('Workshop storageDomain unavailable');
      this.opened = facility.open(workshopProjectionDomain);
    }
    return (await this.opened).table('sessions');
  }

  async get(sessionRef, identity) {
    const record = (await this.#table()).get(sessionRef);
    if (!record) return null;
    if (!sameIdentity(record.coreIdentity, identity))
      throw Error('Workshop projection belongs to another Core Session lifecycle');
    return structuredClone(record.state);
  }

  async create(sessionRef, identity, state) {
    const table = await this.#table();
    if (table.get(sessionRef)) throw Error('Workshop projection already exists');
    await table.put(sessionRef, { coreIdentity: identity, state: structuredClone(state) });
    return structuredClone(state);
  }

  async replace(sessionRef, identity, expectedRevision, state) {
    const table = await this.#table();
    await table.update(sessionRef, record => {
      if (!sameIdentity(record.coreIdentity, identity) ||
          record.state.context.sessionRevision !== expectedRevision)
        throw Error('Workshop projection changed');
      return { coreIdentity: identity, state: structuredClone(state) };
    });
    return structuredClone(state);
  }

  async close() {
    if (this.opened) await (await this.opened).close();
  }
}
