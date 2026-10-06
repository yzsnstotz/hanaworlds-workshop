import { contractHandshake, digestValue, deriveCurrentBuildAuthorization } from 'hanaworlds-contracts/v4';

// Current typed external Host fixture for legacy orchestration regression tests.
// Actual Host authentication/issuance is NOT proven by this helper.
export function buildAuthority(capturedParent) {
  let issued = null;
  const context = facts => {
    const p = capturedParent;
    const binding = { actorRef: p.actorRef, sessionRef: p.sessionRef, worldRef: p.worldRef,
      authorizationRef: p.authorizationRef, sessionIncarnationRef: 'fixture-incarnation',
      hostIssuerRef: 'fixture-host', engineActorName: 'player', expectedGrantRef: 'native-grant',
      bindingRef: 'fixture-binding', grantEpoch: 'epoch-1', allowedActions: ['APPLY_RECOVERABLE'] };
    return { capturedParent, capturedApply: facts.apply, originalBinding: binding, currentBinding: binding,
      verifiedBinding: { authorizerRef: 'fixture-engine', actorRef: binding.actorRef, bindingRef: binding.bindingRef,
        worldRef: binding.worldRef, grantEpoch: binding.grantEpoch, allowedActions: binding.allowedActions },
      liveSessionIncarnationRef: binding.sessionIncarnationRef, workshopServiceRef: 'workshop', expectedWorkshopServiceRef: 'workshop',
      canvasServiceRef: 'canvas', expectedCanvasServiceRef: 'canvas', grantStatus: 'CURRENT', invocationStatus: 'ACTIVE',
      currentTurnRef: facts.turnRef, currentTurnRevision: p.expectedTurnRevision,
      currentConfirmationInputId: facts.confirmationInputId, currentIntentDigest: digestValue('intent', facts.intent).sha256,
      currentOperationDigest: facts.apply.operationDigest, currentAnalysisDigest: facts.apply.analysisDigest,
      turnStatus: 'CURRENT_CONFIRMED', currentStage: 'APPLY', replay: issued ? 'EXACT_REPLAY' : 'NEW', priorAuthorization: issued };
  };
  return { contractHandshake, async issue(facts) { issued = deriveCurrentBuildAuthorization(facts, context(facts)); return issued; },
    async readCurrentBuildContext(facts) { return context(facts); } };
}
