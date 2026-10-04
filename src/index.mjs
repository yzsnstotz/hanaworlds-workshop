import { randomUUID, createHash } from 'node:crypto';
import { WorkshopProjectionStore, coreIdentity } from './projection-store.mjs';
import {
  admitRequest, validateRequest, validateBoundRequest, validateResponse,
  ContractError, contractHandshake, checkContractHandshake, digestValue, validateType,
  validateChoiceSelection, validateRegionInspection,
} from '../vendor/contracts/dist/v4/index.mjs';

const VERSION = 'session/v2';
const ACTION_VERSION = 'interaction-surface/v3';
const revision = () => `rev-${randomUUID()}`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => structuredClone(value);

function failure(code, phase, reason) { throw new ContractError(code, phase, reason); }
function packet(version, requestId, result, error = null) {
  return { contractVersion: version, requestId, result, error };
}
function toPublic(error) {
  return error?.publicError ?? new ContractError('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE').publicError;
}
function requirePeer(port, requirement) {
  if (!port) failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
  const advertised = port.contractHandshake ?? port.handshake?.() ??
    port.status?.().contractHandshake;
  if (!advertised) failure('UNSUPPORTED_VERSION', 'decode', 'VERSION_UNSUPPORTED');
  return checkContractHandshake(advertised, requirement);
}
function initialState(sessionRef) {
  return { context: { currentSession: sessionRef, activeWorldRef: null,
    orderedSelectedObjectRefs: [], sessionRevision: revision(), selectionRevision: '0' },
    turns: [], pendingClarification: null, pendingPlacement: null, frames: [],
    receipts: [], artifacts: Object.create(null), offeredInventory: null,
    turnDetails: Object.create(null),
    confirmedIntents: Object.create(null),
    turnControls: Object.create(null), turnWorldRefs: Object.create(null),
    lastPlacement: null };
}

function parseStructureProposal(text) {
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'dimensions,entrancePortalRefs,kind,purpose,text' ||
      value.kind !== 'BUILD_STRUCTURE' || typeof value.text !== 'string' || !value.text ||
      typeof value.purpose !== 'string' || !value.purpose ||
      !Array.isArray(value.entrancePortalRefs) || value.entrancePortalRefs.length !== 0 ||
      !value.dimensions || Object.keys(value.dimensions).sort().join(',') !== 'depth,height,unit,width' ||
      value.dimensions.unit !== 'node' ||
      !['width', 'depth', 'height'].every(key => Number.isSafeInteger(value.dimensions[key]) &&
        value.dimensions[key] > 0)) return null;
  return value;
}

function confirmingSessionInputId(log, pending, body) {
  // Core's durable user/message ID identifies the actual Session input. A
  // caller's requestId alone is not evidence that an Adapter relay issued it.
  const after = pending.afterSessionEventSeq;
  if (!Number.isSafeInteger(after) || after < -1)
    failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
  const inputs = log.events.slice(after + 1).filter(event =>
    event.type === 'user/message');
  if (inputs.length !== 1)
    failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
  const message = inputs[0].data;
  if (inputs[0].surfaceOp !== 'append' ||
      message?.role !== 'user' || message?.source?.kind !== 'user' ||
      message.id !== body.requestId || !Array.isArray(message.content) ||
      message.content.length !== 1 || message.content[0]?.type !== 'text' ||
      message.content[0].text !== body.answer)
    failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
  return message.id;
}

/** Workshop state is durable in its own domain; Core JSONL is read for confirmation facts. */
export class WorkshopV1 {
  constructor({ sessionPersistence, projectionStore, attachments, llm, authority, capabilities,
    canvas, painter, brush, resources, mediaAuthority, modelRoute,
    catalogue, safety, compilerConfig, applyAuthority } = {}) {
    Object.assign(this, { sessionPersistence, projectionStore, attachments, llm, authority,
      capabilities, canvas, painter, brush, resources, mediaAuthority, modelRoute,
      catalogue, safety, compilerConfig, applyAuthority });
    this.locks = new Map();
    this.contractHandshake = contractHandshake;
  }

  async #authorized(body, operation) {
    if (!this.authority?.verify)
      failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
    const proof = await this.authority?.verify?.(body, operation);
    const required = operation === 'StartOrResumeSession' ? 'READ' :
      ['AppendMultimodalTurn', 'AnswerClarification',
        'RecordActionReceipt', 'PersistRequiredArtifactResources'].includes(operation) ? 'APPEND' :
      operation === 'SwitchWorldContext' || operation === 'SelectObjects' ? 'SELECT' :
      operation === 'AnalyzeCurrentBuild' ? 'ANALYZE' :
      operation === 'ApplyCurrentBuild' ? 'APPLY_RECOVERABLE' :
      ['BeginFirstBuilding', 'InvokeAction', 'CreateBuildPlan', 'CompileCurrentBuild'].includes(operation) ? 'INSPECT' : 'READ';
    if (!proof?.current || proof.actorRef !== body.actorRef ||
        proof.sessionRef !== body.sessionRef ||
        proof.authorizationRef !== body.authorizationRef ||
        !proof.allowedActions?.includes(required))
      failure('AUTHORIZATION_REVOKED', 'authorize', 'GRANT_REVOKED');
    return proof;
  }

  async #readCore(id) {
    if (!this.sessionPersistence?.open) failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
    let handle;
    try { handle = await this.sessionPersistence.open(id, 'read'); }
    catch (error) {
      if (error?.name === 'SessionPersistenceNotFoundError')
        failure('SESSION_NOT_FOUND', 'validate', 'SCOPE_DENIED');
      throw error;
    }
    let data, identity;
    try {
      identity = coreIdentity(handle.header, id);
      data = await handle.read();
    }
    finally { await handle.close(); }
    if (!Array.isArray(data?.events))
      failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
    return { events: data.events, coreIdentity: identity };
  }

  async #load(id, { allowUninitialized = false } = {}) {
    if (!this.projectionStore?.get)
      failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
    const log = await this.#readCore(id);
    const state = await this.projectionStore.get(id, log.coreIdentity);
    if (!state && !allowUninitialized)
      failure('SESSION_NOT_FOUND', 'validate', 'SCOPE_DENIED');
    return { log, state };
  }

  async #save(id, log, state) {
    const next = copy(state);
    const expectedRevision = next.context.sessionRevision;
    next.context.sessionRevision = revision();
    if (!this.projectionStore?.replace)
      failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
    const current = await this.#readCore(id);
    if (current.events.length !== log.events.length ||
        JSON.stringify(current.coreIdentity) !== JSON.stringify(log.coreIdentity))
      failure('STALE_REVISION', 'validate', 'REVISION_CHANGED');
    await this.projectionStore.replace(id, log.coreIdentity, expectedRevision, next);
    return next;
  }

  async #withLock(id, action) {
    const prior = this.locks.get(id) ?? Promise.resolve();
    let release;
    const next = new Promise(resolve => { release = resolve; });
    const gate = prior.then(() => next);
    this.locks.set(id, gate);
    await prior;
    try { return await action(); }
    finally { release(); if (this.locks.get(id) === gate) this.locks.delete(id); }
  }

  #snapshot(state) {
    if (!this.capabilities)
      failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
    return { context: state.context, turns: state.turns,
      capabilities: this.capabilities, sessionDeleteSupported: false };
  }

  async #mediaForModel(body) {
    const media = [], imageBlocks = [];
    for (const item of body.media) {
      // Scope proof deliberately precedes existence and corruption checks.
      if (!this.mediaAuthority?.verify)
        failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      const proof = await this.mediaAuthority?.verify?.({ actorRef: body.actorRef,
        sessionRef: body.sessionRef, authorizationRef: body.authorizationRef,
        attachmentRef: item.attachmentRef });
      if (!proof?.current || proof.sessionRef !== body.sessionRef)
        failure('PERMISSION_DENIED', 'authorize', 'SCOPE_DENIED');
      if (!this.attachments?.readImage || !this.attachments?.readImageRequest ||
          !this.modelRoute?.imagePolicy)
        failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      const ref = { attachmentId: item.attachmentRef, mediaType: item.mediaType,
        bytes: item.bytes, width: item.width, height: item.height };
      let stored, projection;
      try {
        stored = await this.attachments.readImage(ref);
        if (hash(stored.data) !== item.storedBytesDigest ||
            stored.ref.attachmentId !== item.attachmentRef ||
            stored.ref.bytes !== item.bytes || stored.ref.width !== item.width ||
            stored.ref.height !== item.height || stored.ref.mediaType !== item.mediaType)
          failure('MEDIA_DIGEST_MISMATCH', 'validate', 'DIGEST_MISMATCH');
        projection = await this.attachments.readImageRequest(ref, this.modelRoute.imagePolicy);
      } catch (error) {
        if (error?.publicError) throw error;
        failure('ATTACHMENT_REJECTED', 'validate', 'POLICY_UNAVAILABLE');
      }
      const projectionBytesDigest = hash(projection.data);
      if (item.projectionVariantId !== null &&
          (item.projectionVariantId !== projection.variantId ||
           item.projectionBytesDigest !== projectionBytesDigest))
        failure('MEDIA_DIGEST_MISMATCH', 'validate', 'DIGEST_MISMATCH');
      media.push({ ...item, projectionVariantId: projection.variantId,
        projectionBytesDigest });
      imageBlocks.push({ type: 'image', attachment: ref });
    }
    return { media, imageBlocks };
  }

  async #modelTurn(body, imageBlocks, priorTurns = []) {
    if (this.modelRoute?.model !== 'gpt-5.6-luna' ||
        typeof this.modelRoute.provider !== 'string' || !this.modelRoute.provider ||
        !this.llm?.stream) failure('MODEL_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
    const message = { id: `hw-${randomUUID()}`, role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: body.text }, ...imageBlocks] };
    let result = '', finished = false;
    try {
      for await (const chunk of this.llm.stream({ provider: this.modelRoute.provider,
        model: 'gpt-5.6-luna', messages: [
          ...priorTurns.map(turn => ({ id: `hw-${turn.turnRef}`, role: 'user',
            source: { kind: 'user' }, content: [{ type: 'text', text: turn.text }] })),
          message], sessionId: body.sessionRef,
        system: 'You are HanaWorlds Workshop. Never guess a world, target, dimension, or placement. If the user refers to another or an unclear world, ask them to select or clarify it in the Shell. Later user corrections override earlier details. When the user has supplied a concrete structure and all three node dimensions, respond with only JSON matching {"kind":"BUILD_STRUCTURE","text":"<structure>","purpose":"<purpose>","dimensions":{"width":1,"depth":1,"height":1,"unit":"node"},"entrancePortalRefs":[]}. Use the supplied integer dimensions; do not invent values. If any required fact is missing, ask one concise clarification question in Chinese instead of JSON.' })) {
        if (chunk.type === 'text-delta') result += chunk.text;
        if (chunk.type === 'finish') finished = chunk.reason !== 'error' && chunk.reason !== 'aborted';
      }
    } catch { failure('MODEL_REQUEST_FAILED', 'validate', 'POLICY_UNAVAILABLE'); }
    if (!finished || !result.trim()) failure('MODEL_REQUEST_FAILED', 'validate', 'POLICY_UNAVAILABLE');
    return result.trim();
  }

  async call(operation, raw) {
    return this.#call(operation, raw, null);
  }

  async #call(operation, raw, relayPrincipal) {
    const version = operation === 'InvokeAction' ? ACTION_VERSION : VERSION;
    let body;
    try {
      body = raw instanceof Uint8Array || typeof raw === 'string' ?
        admitRequest(version, operation, Buffer.from(raw)) :
        validateRequest(version, operation, raw);
      const proof = await this.#authorized(body, operation);
      if (relayPrincipal && (operation !== 'InvokeAction' ||
          proof.surface !== 'LUANTI' || proof.worldRef !== relayPrincipal.worldRef ||
          proof.engineActorName !== relayPrincipal.engineActorName))
        failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
      validateBoundRequest(version, operation, body);
      const result = await this.#withLock(body.sessionRef, async () => this.#dispatch(operation, body, proof));
      const response = packet(version, body.requestId, result);
      return validateResponse(version, operation, response);
    } catch (error) {
      return packet(version, body?.requestId ?? null, null, toPublic(error));
    }
  }

  /** The Adapter expects a raw InvokeActionReceipt and supplies its verified relay principal. */
  async invokeAction(request, principal) {
    if (!principal || typeof principal.worldRef !== 'string' || !principal.worldRef ||
        typeof principal.engineActorName !== 'string' || !principal.engineActorName)
      failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
    const response = await this.#call('InvokeAction', request, principal);
    if (response.error) {
      const error = new Error(response.error.code);
      error.code = response.error.code;
      error.publicError = response.error;
      throw error;
    }
    return response.result;
  }

  /** Reauthorize the exact pending durable frame before Adapter shows it in Luanti. */
  async verifyFrameDelivery({ worldRef, engineActorName, frame, authorizationRef } = {}) {
    if (typeof worldRef !== 'string' || !worldRef ||
        typeof engineActorName !== 'string' || !engineActorName ||
        typeof authorizationRef !== 'string' || !authorizationRef)
      failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
    validateType('InteractionFrame', frame);
    const { state } = await this.#load(frame.sessionRef);
    const pending = state.pendingPlacement;
    if (!pending?.frame || state.context.activeWorldRef !== worldRef ||
        pending.worldRef !== worldRef ||
        JSON.stringify(pending.frame) !== JSON.stringify(frame))
      failure('INVALID_FRAME', 'validate', 'REVISION_CHANGED');
    if (pending.authorizationRef !== authorizationRef || !pending.actorRef)
      failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
    const proof = await this.#authorized({ actorRef: pending.actorRef,
      sessionRef: frame.sessionRef, authorizationRef }, 'BeginFirstBuilding');
    if (proof.surface !== 'LUANTI' && proof.surface !== 'SHELL')
      failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
    if (proof.worldRef !== worldRef || proof.engineActorName !== engineActorName)
      failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
    return { current: true, worldRef, engineActorName, sessionRef: frame.sessionRef,
      authorizationRef, actorRef: pending.actorRef };
  }

  async beginFirstBuilding(body) {
    await this.#authorized(body, 'BeginFirstBuilding');
    return this.#withLock(body.sessionRef, async () => {
      const { log, state } = await this.#load(body.sessionRef);
      const saved = state.confirmedIntents[body.turnRef];
      const intent = saved?.intent;
      if (!intent || intent.confirmedIntent.kind !== 'BUILD_STRUCTURE')
        failure('INTENT_UNCONFIRMED', 'validate', 'REQUIRED_FACT_UNKNOWN');
      if (typeof saved.confirmationInputId !== 'string' ||
          !saved.confirmationInputId)
        failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      if (body.invocationId !== undefined &&
          body.invocationId !== saved.confirmationInputId)
        failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
      if (!state.context.activeWorldRef ||
          intent.intendedWorldRef !== state.context.activeWorldRef)
        failure('WORLD_NOT_BOUND', 'validate', 'SCOPE_DENIED');
      if (state.context.orderedSelectedObjectRefs.length !== 0)
        failure('TARGET_REQUIRED', 'validate', 'SCOPE_DENIED');
      const dims = intent.confirmedIntent.dimensions;
      if (!dims || dims.unit !== 'node' ||
          !['width', 'height', 'depth'].every(key => Number.isSafeInteger(dims[key]) && dims[key] > 0))
        failure('AMBIGUOUS_GEOMETRY', 'validate', 'REQUIRED_FACT_UNKNOWN');
      requirePeer(this.canvas, {
        wires: ['canvas/v4'], factProfiles: ['target-facts/v3'] });
      const footprint = { widthCells: dims.width, depthCells: dims.depth,
        heightCells: dims.height };
      const request = { contractVersion: 'canvas/v4', actorRef: body.actorRef,
        sessionRef: body.sessionRef, requestId: body.requestId,
        authorizationRef: body.authorizationRef, worldRef: state.context.activeWorldRef,
        anchor: { kind: 'DEFAULT_PLAYER', invocationId: saved.confirmationInputId }, footprint };
      validateBoundRequest('canvas/v4', 'InspectPlacementRegion', request);
      const response = validateResponse('canvas/v4', 'InspectPlacementRegion',
        await this.canvas.call('InspectPlacementRegion', request));
      if (response.error) { const error = new Error(response.error.code); error.publicError = response.error; throw error; }
      const outcome = await this.#recordPlacement(state, body, response.result, footprint, intent);
      await this.#save(body.sessionRef, log, state);
      return outcome;
    });
  }

  async #recordPlacement(state, body, result, footprint, intent) {
    if (result.outcome === 'REGION_INSPECTED') {
      const inspection = validateRegionInspection(result.inspection);
      state.lastPlacement = { outcome: 'REGION_INSPECTED', inspection,
        turnRef: body.turnRef, intentDigest: digestValue('intent', intent).sha256 };
      state.pendingPlacement = null;
      return { outcome: 'REGION_INSPECTED', inspection };
    }
    const choice = result.choice;
    const frameRef = `frame-${randomUUID()}`, frameRevision = revision();
    const turnRevision = state.turns.find(turn => turn.turnRef === body.turnRef)?.turnRevision;
    if (!turnRevision) failure('TURN_REVISION_MISMATCH', 'validate', 'REVISION_CHANGED');
    const projections = Object.create(null), actions = [];
    const add = (kind, choices) => {
      const actionId = `action-${randomUUID()}`;
      const projection = { contractVersion: 'interaction-surface/v2',
        sessionRef: body.sessionRef, turnRevision, frameRef, frameRevision,
        actionId, orderedTargetRefs: [], intentDigest: digestValue('intent', intent).sha256,
        operationDigest: null, analysisDigest: null, decisionRevision: null };
      const surfaceActionDigest = digestValue('surface-action', projection).sha256;
      projections[actionId] = projection;
      actions.push({ actionId, inputKinds: [kind], surfaceActionDigest,
        capabilityRef: 'hanaworlds-workshop', choices });
    };
    if (choice.options.includes('NAME_PLAYER'))
      add('SELECT_CHOICE', choice.candidatePlayerNames.map(name => ({ value: name, label: name })));
    add('PICK_WORLD_POINT', null);
    const frame = validateType('InteractionFrame', { sessionRef: body.sessionRef,
      turnRevision, frameRef, frameRevision,
      content: choice.options.includes('NAME_PLAYER') ?
        '请选择在线玩家，或在游戏中选点。' : '请在游戏中选点。', actions });
    state.pendingPlacement = { choice, frame, projections, footprint,
      actorRef: body.actorRef, authorizationRef: body.authorizationRef,
      worldRef: state.context.activeWorldRef, turnRef: body.turnRef,
      intentDigest: digestValue('intent', intent).sha256 };
    state.lastPlacement = { outcome: 'PLACEMENT_CHOICE_REQUIRED', choice, frame };
    return { ...state.lastPlacement, actionProjections: projections };
  }

  async getPlacementState(body) {
    await this.#authorized(body, 'BeginFirstBuilding');
    const { state } = await this.#load(body.sessionRef);
    return copy(state.lastPlacement);
  }

  async createBuildPlan(body) {
    await this.#authorized(body, 'CreateBuildPlan');
    return this.#withLock(body.sessionRef, async () => {
      const { log, state } = await this.#load(body.sessionRef);
      const turn = state.turns.find(row => row.turnRef === body.turnRef);
      const saved = state.confirmedIntents[body.turnRef];
      const placement = state.lastPlacement;
      if (!turn || !saved || !placement || placement.outcome !== 'REGION_INSPECTED' ||
          placement.turnRef !== body.turnRef ||
          saved.intent.confirmedIntent.kind !== 'BUILD_STRUCTURE')
        failure('TARGET_REQUIRED', 'validate', 'REQUIRED_FACT_UNKNOWN');
      if (turn.media.length === 0) failure('IMAGE_REQUIRED', 'validate', 'REQUIRED_FACT_UNKNOWN');
      if (saved.intent.intendedWorldRef !== state.context.activeWorldRef ||
          placement.inspection.targetFacts.worldRef !== state.context.activeWorldRef)
        failure('WORLD_NOT_BOUND', 'validate', 'SCOPE_DENIED');
      requirePeer(this.painter,
        { wires: ['painter/v3'], factProfiles: ['target-facts/v3'] });
      if (!this.catalogue?.read || !this.safety?.read || !this.painter?.call)
        failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      const catalogue = validateType('Catalogue', await this.catalogue.read(state.context.activeWorldRef));
      const safetyProfile = validateType('SafetyProfile', await this.safety.read(state.context.activeWorldRef));
      if (digestValue('catalogue', catalogue).sha256 !==
          placement.inspection.targetFacts.catalogueDigest)
        failure('CATALOGUE_MISMATCH', 'validate', 'REVISION_CHANGED');
      const request = { contractVersion: 'painter/v3', actorRef: body.actorRef,
        sessionRef: body.sessionRef, requestId: body.requestId,
        authorizationRef: body.authorizationRef, worldRef: state.context.activeWorldRef,
        turnRevision: turn.turnRevision, painterId: 'picture-blocks',
        invocationId: `paint-${randomUUID()}`, intent: saved.intent,
        intentDigest: digestValue('intent', saved.intent).sha256,
        referenceBrief: saved.brief,
        referenceBriefDigest: digestValue('reference-brief', saved.brief).sha256,
        catalogue, targetFacts: placement.inspection.targetFacts,
        targetFactsDigest: placement.inspection.targetFactsDigest,
        safetyProfile, safetyProfileDigest: digestValue('safety-profile', safetyProfile).sha256,
        regionInspection: placement.inspection };
      validateBoundRequest('painter/v3', 'CreateBuildPlan', request);
      const response = validateResponse('painter/v3', 'CreateBuildPlan',
        await this.painter.call('CreateBuildPlan', request));
      if (response.error) { const error = new Error(response.error.code); error.publicError = response.error; throw error; }
      state.lastBuild = { turnRef: body.turnRef, worldRef: state.context.activeWorldRef,
        plan: response.result, catalogue, safetyProfile, inspection: placement.inspection };
      await this.#save(body.sessionRef, log, state);
      return response.result;
    });
  }

  async listObjects(body) {
    await this.#authorized(body, 'ListObjects');
    return this.#withLock(body.sessionRef, async () => {
      const { log, state } = await this.#load(body.sessionRef);
      const worldRef = state.context.activeWorldRef;
      if (!worldRef) failure('WORLD_NOT_BOUND', 'validate', 'SCOPE_DENIED');
      requirePeer(this.canvas,
        { wires: ['canvas/v4'], factProfiles: [] });
      const request = { contractVersion: 'canvas/v4', actorRef: body.actorRef,
        sessionRef: body.sessionRef, requestId: body.requestId,
        authorizationRef: body.authorizationRef, worldRef, expectedRevision: null };
      validateBoundRequest('canvas/v4', 'ListObjects', request);
      const response = validateResponse('canvas/v4', 'ListObjects',
        await this.canvas.call('ListObjects', request));
      if (response.error) { const error = new Error(response.error.code); error.publicError = response.error; throw error; }
      state.offeredInventory = response.result;
      await this.#save(body.sessionRef, log, state);
      return response.result;
    });
  }

  async selectObjects(body) {
    await this.#authorized(body, 'SelectObjects');
    return this.#withLock(body.sessionRef, async () => {
      const { log, state } = await this.#load(body.sessionRef);
      const inventory = state.offeredInventory;
      if (!inventory || inventory.worldRef !== state.context.activeWorldRef)
        failure('INVALID_SELECTION', 'validate', 'SCOPE_DENIED');
      const offered = new Set(inventory.objects.map(object => object.objectRef));
      if (!Array.isArray(body.objectRefs) ||
          new Set(body.objectRefs).size !== body.objectRefs.length ||
          !body.objectRefs.every(ref => offered.has(ref)))
        failure('INVALID_SELECTION', 'validate', 'SCOPE_DENIED');
      requirePeer(this.canvas,
        { wires: ['canvas/v4'], factProfiles: [] });
      const request = { contractVersion: 'canvas/v4', actorRef: body.actorRef,
        sessionRef: body.sessionRef, requestId: body.requestId,
        authorizationRef: body.authorizationRef, worldRef: inventory.worldRef,
        objectRefs: body.objectRefs,
        expectedSelectionRevision: state.context.selectionRevision };
      validateBoundRequest('canvas/v4', 'SetObjectSelection', request);
      const response = validateResponse('canvas/v4', 'SetObjectSelection',
        await this.canvas.call('SetObjectSelection', request));
      if (response.error) { const error = new Error(response.error.code); error.publicError = response.error; throw error; }
      state.context.orderedSelectedObjectRefs = response.result.selectedObjectRefs;
      state.context.selectionRevision = response.result.selectionRevision;
      state.pendingPlacement = null;
      state.lastPlacement = null;
      await this.#save(body.sessionRef, log, state);
      return response.result;
    });
  }

  async compileCurrentBuild(body) {
    await this.#authorized(body, 'CompileCurrentBuild');
    return this.#withLock(body.sessionRef, async () => {
      const { log, state } = await this.#load(body.sessionRef);
      const saved = state.lastBuild;
      if (!saved || saved.turnRef !== body.turnRef ||
          saved.worldRef !== state.context.activeWorldRef)
        failure('TARGET_REQUIRED', 'validate', 'REQUIRED_FACT_UNKNOWN');
      requirePeer(this.brush,
        { wires: ['BUILD/V2'], factProfiles: ['target-facts/v3'] });
      if (!this.brush?.compile || !this.compilerConfig?.read)
        failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      const settings = await this.compilerConfig.read(saved.worldRef);
      const compilationConfig = validateType('CompilationConfig', settings?.compilationConfig);
      const compilerRevision = settings?.compilerRevision;
      const request = { contractVersion: 'BUILD/V2', actorRef: body.actorRef,
        sessionRef: body.sessionRef, requestId: body.requestId,
        authorizationRef: body.authorizationRef, worldRef: saved.worldRef,
        build: saved.plan.build, buildDigest: saved.plan.buildDigest,
        catalogue: saved.catalogue,
        catalogueDigest: digestValue('catalogue', saved.catalogue).sha256,
        targetFacts: saved.inspection.targetFacts,
        targetFactsDigest: saved.inspection.targetFactsDigest,
        safetyProfile: saved.safetyProfile,
        safetyProfileDigest: digestValue('safety-profile', saved.safetyProfile).sha256,
        compilationConfig,
        compilationConfigDigest: digestValue('compilation-config', compilationConfig).sha256,
        compilerRevision };
      validateBoundRequest('BUILD/V2', 'BuildDocument', request);
      const response = validateResponse('BUILD/V2', 'BuildDocument',
        await this.brush.compile(request));
      if (response.error) { const error = new Error(response.error.code); error.publicError = response.error; throw error; }
      state.lastCompiled = { turnRef: body.turnRef, worldRef: saved.worldRef,
        compiled: response.result, build: saved.plan.build,
        inspection: saved.inspection };
      await this.#save(body.sessionRef, log, state);
      return response.result;
    });
  }

  async analyzeCurrentBuild(body) {
    await this.#authorized(body, 'AnalyzeCurrentBuild');
    return this.#withLock(body.sessionRef, async () => {
      const { log, state } = await this.#load(body.sessionRef);
      const saved = state.lastCompiled;
      if (!saved || saved.turnRef !== body.turnRef ||
          saved.worldRef !== state.context.activeWorldRef)
        failure('TARGET_REQUIRED', 'validate', 'REQUIRED_FACT_UNKNOWN');
      requirePeer(this.canvas,
        { wires: ['canvas/v4'], factProfiles: ['target-facts/v3'] });
      const base = { contractVersion: 'canvas/v4', actorRef: body.actorRef,
        sessionRef: body.sessionRef, authorizationRef: body.authorizationRef,
        worldRef: saved.worldRef };
      const inventoryRequest = { ...base, requestId: `inventory-${body.requestId}`,
        expectedRevision: null };
      validateBoundRequest('canvas/v4', 'ListObjects', inventoryRequest);
      const inventory = validateResponse('canvas/v4', 'ListObjects',
        await this.canvas.call('ListObjects', inventoryRequest));
      if (inventory.error) { const error = new Error(inventory.error.code); error.publicError = inventory.error; throw error; }
      const transactionId = `tx-${randomUUID()}`;
      const request = { ...base, requestId: body.requestId, transactionId,
        operations: saved.compiled.projection,
        operationDigest: saved.compiled.operationDigest,
        expectedRevision: saved.inspection.targetFacts.worldRevision,
        expectedRegistryRevision: inventory.result.registryRevision,
        expectedSelectionRevision: state.context.selectionRevision };
      validateBoundRequest('canvas/v4', 'AnalyzeAffectedObjects', request);
      const response = validateResponse('canvas/v4', 'AnalyzeAffectedObjects',
        await this.canvas.call('AnalyzeAffectedObjects', request));
      if (response.error) { const error = new Error(response.error.code); error.publicError = response.error; throw error; }
      state.lastAnalysis = { turnRef: body.turnRef, transactionId,
        analysis: response.result, analysisDigest: digestValue('affected-analysis', response.result).sha256 };
      await this.#save(body.sessionRef, log, state);
      return response.result;
    });
  }

  async applyCurrentBuild(body) {
    await this.#authorized(body, 'ApplyCurrentBuild');
    return this.#withLock(body.sessionRef, async () => {
      const { log, state } = await this.#load(body.sessionRef);
      const pending = state.pendingApply;
      if (pending?.status === 'RESERVED' && pending.turnRef !== body.turnRef)
        failure('RECOVERY_PENDING', 'restore', 'REQUIRED_FACT_UNKNOWN');
      if (pending?.turnRef === body.turnRef) {
        if (pending.status === 'VERIFIED') return pending.response.result;
        if (pending.status !== 'RESERVED')
          failure('RECOVERY_PENDING', 'restore', 'REQUIRED_FACT_UNKNOWN');
        if (pending.request.actorRef !== body.actorRef ||
            pending.request.authorizationRef !== body.authorizationRef)
          failure('AUTHORIZATION_REVOKED', 'authorize', 'GRANT_REVOKED');
        // Canvas owns durable transaction recovery. Reuse the exact reserved
        // request and idempotency key after an uncertain transport outcome.
        requirePeer(this.canvas,
          { wires: ['canvas/v4'], factProfiles: ['target-facts/v3'] });
        validateBoundRequest('canvas/v4', 'ApplyRecoverableCommit', pending.request);
        const retried = validateResponse('canvas/v4', 'ApplyRecoverableCommit',
          await this.canvas.call('ApplyRecoverableCommit', pending.request));
        state.pendingApply.status = retried.error?.mutationState === 'NONE' ||
          retried.error?.mutationState === 'ROLLED_BACK' ? 'FAILED' :
          retried.error ? 'RESERVED' : retried.result.status;
        state.pendingApply.response = retried;
        await this.#save(body.sessionRef, log, state);
        if (retried.error) { const error = new Error(retried.error.code); error.publicError = retried.error; throw error; }
        return retried.result;
      }
      const compiled = state.lastCompiled, analysis = state.lastAnalysis;
      const intent = state.confirmedIntents[body.turnRef]?.intent;
      if (!compiled || !analysis || !intent ||
          compiled.turnRef !== body.turnRef || analysis.turnRef !== body.turnRef ||
          state.context.activeWorldRef !== compiled.worldRef ||
          analysis.analysis.operationDigest !== compiled.compiled.operationDigest)
        failure('STALE_REVISION', 'validate', 'REVISION_CHANGED');
      if (analysis.analysis.affectedObjectRefs.length > 0)
        failure('OTHER_OBJECTS_AFFECTED', 'validate', 'SCOPE_DENIED');
      requirePeer(this.canvas,
        { wires: ['canvas/v4'], factProfiles: ['target-facts/v3'] });
      if (!this.applyAuthority?.issue)
        failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      const turnRevision = state.turns.find(row => row.turnRef === body.turnRef)?.turnRevision;
      const facts = { actorRef: body.actorRef, sessionRef: body.sessionRef,
        worldRef: compiled.worldRef, turnRevision,
        intentDigest: digestValue('intent', intent).sha256,
        transactionId: analysis.transactionId,
        operationDigest: compiled.compiled.operationDigest,
        worldRevision: analysis.analysis.worldRevision,
        selectionRevision: analysis.analysis.selectionRevision,
        analysisDigest: analysis.analysisDigest,
        decisionRevision: null, allowedAction: 'APPLY_RECOVERABLE' };
      const authorizationBinding = validateType('AuthProjection',
        await this.applyAuthority.issue(facts, body));
      if (!['actorRef','sessionRef','worldRef','turnRevision','intentDigest','transactionId',
        'operationDigest','worldRevision','selectionRevision','analysisDigest','decisionRevision',
        'allowedAction'].every(key => authorizationBinding[key] === facts[key]))
        failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
      const request = { contractVersion: 'canvas/v4', actorRef: body.actorRef,
        sessionRef: body.sessionRef, requestId: body.requestId,
        authorizationRef: body.authorizationRef, worldRef: compiled.worldRef,
        transactionId: analysis.transactionId,
        operations: compiled.compiled.projection,
        operationDigest: compiled.compiled.operationDigest,
        authorizationBinding,
        authorizationBindingDigest: digestValue('authorization-binding', authorizationBinding).sha256,
        analysisDigest: analysis.analysisDigest, decisionRevision: null,
        expectedWorldRevision: analysis.analysis.worldRevision,
        expectedObjectRevisions: {}, guarantee: 'RECOVERABLE_VERIFIED',
        regionInspectionBinding: { inspectionId: compiled.inspection.inspectionId,
          build: compiled.build } };
      validateBoundRequest('canvas/v4', 'ApplyRecoverableCommit', request);
      state.pendingApply = { request, turnRef: body.turnRef, status: 'RESERVED' };
      await this.#save(body.sessionRef, log, state);
      const response = validateResponse('canvas/v4', 'ApplyRecoverableCommit',
        await this.canvas.call('ApplyRecoverableCommit', request));
      const latest = await this.#load(body.sessionRef);
      latest.state.pendingApply.status = response.error?.mutationState === 'NONE' ||
        response.error?.mutationState === 'ROLLED_BACK' ? 'FAILED' :
        response.error ? 'RESERVED' : response.result.status;
      latest.state.pendingApply.response = response;
      await this.#save(body.sessionRef, latest.log, latest.state);
      if (response.error) { const error = new Error(response.error.code); error.publicError = response.error; throw error; }
      return response.result;
    });
  }

  async #dispatch(operation, body, proof) {
    if (operation === 'DeleteSession')
      failure('SESSION_DELETE_UNSUPPORTED', 'validate', 'POLICY_UNAVAILABLE');
    if (operation === 'ReopenExistingArtifact') {
      if (!this.resources?.reopen)
        failure('SAVED_RESOURCE_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      let reopened;
      try { reopened = await this.resources.reopen(body); }
      catch { failure('SAVED_RESOURCE_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE'); }
      const result = validateType('ReopenedArtifact', reopened);
      if (result.artifactRef !== body.artifactRef ||
          result.resourceManifestDigest !== body.resourceManifestDigest ||
          result.manifest.workRevision !== body.workRevision ||
          digestValue('saved-work-resources', result.manifest).sha256 !== body.resourceManifestDigest)
        failure('SAVED_RESOURCE_UNAVAILABLE', 'validate', 'DIGEST_MISMATCH');
      return result;
    }
    if (operation === 'StartOrResumeSession') {
      if (!this.capabilities)
        failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      let loaded;
      loaded = await this.#load(body.sessionRef, { allowUninitialized: true });
      if (!loaded.state) {
        if (body.expectedRevision !== null) failure('SESSION_NOT_FOUND', 'validate', 'SCOPE_DENIED');
        const state = initialState(body.sessionRef);
        state.context.sessionRevision = revision();
        if (!this.projectionStore?.create)
          failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
        await this.projectionStore.create(body.sessionRef,
          loaded.log.coreIdentity, state);
        return this.#snapshot(state);
      }
      if (body.expectedRevision !== null &&
          loaded.state.context.sessionRevision !== body.expectedRevision)
        failure('STALE_REVISION', 'validate', 'REVISION_CHANGED');
      return this.#snapshot(loaded.state);
    }
    const { log, state } = await this.#load(body.sessionRef);
    if (operation === 'InvokeAction') {
      const pending = state.pendingPlacement;
      if (!pending || !pending.frame ||
          state.context.activeWorldRef !== pending.worldRef)
        failure('INVALID_FRAME', 'validate', 'REVISION_CHANGED');
      if (pending.actorRef !== body.actorRef ||
          pending.authorizationRef !== body.authorizationRef)
        failure('PERMISSION_DENIED', 'authorize', 'IDENTITY_UNVERIFIED');
      validateChoiceSelection(pending.frame, body);
      const descriptor = pending.frame.actions.find(action => action.actionId === body.actionId);
      const projection = pending.projections[body.actionId];
      if (!projection || descriptor.surfaceActionDigest !== body.surfaceActionDigest ||
          digestValue('surface-action', projection).sha256 !== body.surfaceActionDigest ||
          JSON.stringify(projection) !== JSON.stringify(body.surfaceAction) ||
          body.turnRevision !== pending.frame.turnRevision ||
          !descriptor.inputKinds.includes(body.input.kind))
        failure('INVALID_FRAME', 'validate', 'REVISION_CHANGED');
      if (body.input.kind === 'SELECT_CHOICE' && proof.surface !== 'SHELL')
        failure('RENDERER_CAPABILITY_UNAVAILABLE', 'validate', 'SCOPE_DENIED');
      if (body.input.kind === 'PICK_WORLD_POINT' && proof.surface !== 'LUANTI')
        failure('RENDERER_CAPABILITY_UNAVAILABLE', 'validate', 'SCOPE_DENIED');
      const anchor = body.input.kind === 'SELECT_CHOICE' ?
        { kind: 'NAMED_PLAYER', engineActorName: body.input.value } :
        { kind: 'PICKED_POINT', pickRef: body.input.pickRef };
      requirePeer(this.canvas,
        { wires: ['canvas/v4'], factProfiles: ['target-facts/v3'] });
      const request = { contractVersion: 'canvas/v4', actorRef: body.actorRef,
        sessionRef: body.sessionRef, requestId: body.requestId,
        authorizationRef: body.authorizationRef, worldRef: pending.worldRef,
        anchor, footprint: pending.footprint };
      validateBoundRequest('canvas/v4', 'InspectPlacementRegion', request);
      const response = validateResponse('canvas/v4', 'InspectPlacementRegion',
        await this.canvas.call('InspectPlacementRegion', request));
      if (response.error) { const error = new Error(response.error.code); error.publicError = response.error; throw error; }
      const intent = state.confirmedIntents[pending.turnRef].intent;
      await this.#recordPlacement(state, { ...body, turnRef: pending.turnRef },
        response.result, pending.footprint, intent);
      await this.#save(body.sessionRef, log, state);
      return { invocationId: body.invocationId, resultRevision: revision(),
        ownerRef: 'hanaworlds-workshop', domainReceiptDigest: null, accepted: true };
    }
    if (operation === 'PersistRequiredArtifactResources') {
      if (!this.resources?.persist)
        failure('SAVED_RESOURCE_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      let persisted;
      try { persisted = await this.resources.persist(body); }
      catch { failure('SAVED_RESOURCE_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE'); }
      const result = validateType('SavedResourceReceipt', persisted);
      if (!result.durable || result.resourceManifestDigest !== body.resourceManifestDigest ||
          digestValue('saved-work-resources', result.manifest).sha256 !== body.resourceManifestDigest)
        failure('SAVED_RESOURCE_UNAVAILABLE', 'persist', 'POLICY_UNAVAILABLE');
      state.artifacts[body.artifactRef] = { workRevision: body.manifest.workRevision,
        resourceManifestDigest: body.resourceManifestDigest };
      await this.#save(body.sessionRef, log, state);
      return result;
    }
    if (operation === 'RecordActionReceipt') {
      if (state.context.sessionRevision !== body.expectedRevision)
        failure('STALE_REVISION', 'validate', 'REVISION_CHANGED');
      const turn = state.turns.find(row => row.turnRef === body.turnRef);
      const receipt = state.pendingApply?.response?.result;
      if (!turn || !receipt || receipt.status !== 'VERIFIED' ||
          state.pendingApply.request.sessionRef !== body.sessionRef ||
          digestValue('receipt', receipt).sha256 !== body.domainReceiptDigest)
        failure('RECOVERY_PENDING', 'validate', 'REQUIRED_FACT_UNKNOWN');
      turn.actionReceiptDigest = body.domainReceiptDigest;
      state.receipts.push({ turnRef: body.turnRef, actionId: body.actionId,
        domainReceiptDigest: body.domainReceiptDigest });
      await this.#save(body.sessionRef, log, state);
      return { sessionRef: body.sessionRef, turnRef: body.turnRef,
        turnRevision: turn.turnRevision, briefDigest: turn.referenceBriefDigest,
        model: 'gpt-5.6-luna', resultText: '已记录已验证的操作回执。', clarification: null };
    }
    if (operation === 'SwitchWorldContext') {
      if (state.context.sessionRevision !== body.expectedRevision)
        failure('STALE_REVISION', 'validate', 'REVISION_CHANGED');
      if (state.pendingApply?.status === 'RESERVED')
        failure('RECOVERY_PENDING', 'restore', 'REQUIRED_FACT_UNKNOWN');
      requirePeer(this.canvas,
        { wires: ['canvas/v4'], factProfiles: [] });
      if (!this.canvas?.call)
        failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
      const inventoryRequest = { contractVersion: 'canvas/v4', actorRef: body.actorRef,
        sessionRef: body.sessionRef, requestId: `world-proof-${body.requestId}`,
        authorizationRef: body.authorizationRef, worldRef: body.worldRef,
        expectedRevision: null };
      validateBoundRequest('canvas/v4', 'ListObjects', inventoryRequest);
      const inventory = validateResponse('canvas/v4', 'ListObjects',
        await this.canvas.call('ListObjects', inventoryRequest));
      if (inventory.error) { const error = new Error(inventory.error.code); error.publicError = inventory.error; throw error; }
      if (inventory.result.worldRef !== body.worldRef)
        failure('WORLD_NOT_BOUND', 'validate', 'SCOPE_DENIED');
      state.context.activeWorldRef = body.worldRef;
      state.context.orderedSelectedObjectRefs = [];
      state.context.selectionRevision = body.selectionRevision;
      state.offeredInventory = null;
      state.pendingPlacement = null;
      state.lastPlacement = null;
      return this.#snapshot(await this.#save(body.sessionRef, log, state));
    }
    if (operation === 'AppendMultimodalTurn') {
      if (state.context.sessionRevision !== body.expectedRevision)
        failure('STALE_REVISION', 'validate', 'REVISION_CHANGED');
      if (state.turns.some(turn => turn.turnRef === body.turnRef))
        failure('REPLAY_MISMATCH', 'replay', 'PAYLOAD_CHANGED');
      const { media, imageBlocks } = await this.#mediaForModel(body);
      const answer = await this.#modelTurn(body, imageBlocks,
        state.turns.filter(turn => state.turnWorldRefs?.[turn.turnRef] ===
          state.context.activeWorldRef));
      const proposal = parseStructureProposal(answer);
      const turnRevision = revision();
      const clarification = { sessionRef: body.sessionRef, turnRevision,
        invocationId: body.requestId, clarificationId: `clarify-${randomUUID()}`,
        code: 'AMBIGUOUS_INTENT', question: proposal ?
          `请确认在当前世界建造${proposal.text}，尺寸为${proposal.dimensions.width}×${proposal.dimensions.depth}×${proposal.dimensions.height}个节点。回复“确认”或说明修改。` : answer };
      state.turns.push({ turnRef: body.turnRef, turnRevision, text: body.text,
        media, referenceBriefDigest: null, intentDigest: null, actionReceiptDigest: null });
      state.turnWorldRefs ??= Object.create(null);
      state.turnWorldRefs[body.turnRef] = state.context.activeWorldRef;
      state.pendingClarification = { ...clarification, proposal, turnRef: body.turnRef,
        answers: [], afterSessionEventSeq: log.events.length - 1 };
      state.turnControls[body.turnRef] = body.controls;
      state.turnDetails[body.turnRef] = { resultText: clarification.question,
        confirmedBrief: null };
      await this.#save(body.sessionRef, log, state);
      return { sessionRef: body.sessionRef, turnRef: body.turnRef, turnRevision,
        briefDigest: null, model: 'gpt-5.6-luna', resultText: clarification.question, clarification };
    }
    if (operation === 'AnswerClarification') {
      if (state.context.sessionRevision !== body.expectedRevision)
        failure('STALE_REVISION', 'validate', 'REVISION_CHANGED');
      const pending = state.pendingClarification;
      if (!pending || pending.clarificationId !== body.clarificationId ||
          pending.turnRef !== body.turnRef)
        failure('TURN_REVISION_MISMATCH', 'validate', 'REVISION_CHANGED');
      const confirmationInputId = confirmingSessionInputId(log, pending, body);
      const confirmed = ['确认', 'yes', 'YES'].includes(body.answer.trim());
      if (!pending.proposal || !confirmed) {
        const original = state.turns.find(value => value.turnRef === body.turnRef);
        if (!original) failure('TURN_REVISION_MISMATCH', 'validate', 'REVISION_CHANGED');
        const answers = confirmed ? (pending.answers ?? []) :
          [...(pending.answers ?? []), body.answer];
        let answer = '请补充明确的建造意图和节点尺寸。';
        let proposal = null;
        if (!confirmed) {
          const { imageBlocks } = await this.#mediaForModel({ ...body, media: original.media });
          answer = await this.#modelTurn({ ...body,
            text: `${original.text}\n${answers.map((value, index) =>
              `用户补充${index + 1}：${value}`).join('\n')}` }, imageBlocks);
          proposal = parseStructureProposal(answer);
        }
        const next = { ...pending, proposal, answers,
          afterSessionEventSeq: log.events.length - 1,
          clarificationId: `clarify-${randomUUID()}`,
          question: proposal ?
            `请确认在当前世界建造${proposal.text}，尺寸为${proposal.dimensions.width}×${proposal.dimensions.depth}×${proposal.dimensions.height}个节点。回复“确认”或说明修改。` : answer };
        state.pendingClarification = next;
        state.turnDetails[body.turnRef] = { resultText: next.question,
          confirmedBrief: null };
        await this.#save(body.sessionRef, log, state);
        return { sessionRef: body.sessionRef, turnRef: body.turnRef,
          turnRevision: pending.turnRevision, briefDigest: null, model: 'gpt-5.6-luna',
          resultText: next.question, clarification: {
            sessionRef: next.sessionRef, turnRevision: next.turnRevision,
            invocationId: next.invocationId, clarificationId: next.clarificationId,
            code: 'AMBIGUOUS_INTENT', question: next.question } };
      }
      if (!state.context.activeWorldRef)
        failure('WORLD_NOT_BOUND', 'validate', 'SCOPE_DENIED');
      const turn = state.turns.find(value => value.turnRef === body.turnRef);
      const brief = validateType('BriefProjection', { contractVersion: 'ReferenceBrief/v2',
        sessionRef: body.sessionRef, turnRevision: turn.turnRevision,
        briefRevision: revision(), media: turn.media, text: turn.text,
        controls: state.turnControls[body.turnRef] });
      const briefDigest = digestValue('reference-brief', brief).sha256;
      const p = pending.proposal;
      const intent = validateType('IntentProjection', { contractVersion: 'session/v2',
        referenceBriefDigest: briefDigest,
        confirmedIntent: { kind: p.kind, text: p.text, purpose: p.purpose,
          dimensions: p.dimensions, entrancePortalRefs: p.entrancePortalRefs,
          confirmedTurnRevision: turn.turnRevision },
        intendedWorldRef: state.context.activeWorldRef, orderedTargetRefs: [] });
      turn.referenceBriefDigest = briefDigest;
      turn.intentDigest = digestValue('intent', intent).sha256;
      state.confirmedIntents[body.turnRef] = { brief, intent,
        confirmationInputId };
      state.pendingClarification = null;
      state.turnDetails[body.turnRef] = { resultText: '已确认建造意图。',
        confirmedBrief: brief };
      await this.#save(body.sessionRef, log, state);
      return { sessionRef: body.sessionRef, turnRef: body.turnRef,
        turnRevision: turn.turnRevision, briefDigest,
        model: 'gpt-5.6-luna', resultText: '已确认建造意图。', clarification: null };
    }
    failure('CAPABILITY_UNAVAILABLE', 'validate', 'POLICY_UNAVAILABLE');
  }
}

export const name = 'hanaworlds-workshop';
export const inject = [];
export function apply(ctx) {
  const projectionStore = new WorkshopProjectionStore(() => ctx.get?.('storageDomain'));
  ctx.effect?.(() => () => projectionStore.close(), 'hanaworlds-workshop.projection-close');
  const service = new WorkshopV1({ projectionStore });
  const ports = {
    sessionPersistence: 'sessionPersistence', attachments: 'attachments',
    llm: 'llm', authority: 'hanaworldsAuthority',
    capabilities: 'hanaworldsCapabilities', canvas: 'hanaworldsCanvasV4',
    painter: 'hanaworldsPainterV2PictureBlocks', brush: 'hanaworldsBrushV2',
    resources: 'hanaworldsRequiredResources', catalogue: 'hanaworldsCatalogue',
    safety: 'hanaworldsSafetyProfile', compilerConfig: 'hanaworldsCompilerConfig',
    applyAuthority: 'hanaworldsApplyAuthority',
    mediaAuthority: 'hanaworldsMediaAuthority', modelRoute: 'hanaworldsModelRoute',
  };
  for (const [field, port] of Object.entries(ports))
    Object.defineProperty(service, field, { enumerable: true,
      get: () => ctx.get?.(port) });
  ctx.provide?.('hanaworldsWorkshopV1', service);
  ctx.provide?.('hanaworldsWorkshop', service);
}
export default { name, inject, apply };
