// Read-only public-contract probe. Demonstrates why no fake grant can bridge
// the owner-approved local-only MVP through contracts 0.3.10.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contractHandshake, validateType, validateBuildProposalRequest,
  validateBuildProposalContext, validateBoundRequest } from 'hanaworlds-contracts/v4';
const sample = JSON.parse(await readFile(new URL('../vendor/contracts/fixtures/v4/proposal/text-build-proposal.json', import.meta.url)));
const results = [];
validateBuildProposalContext(sample.request, sample.facts);
results.push({ case: 'unchanged admitted fixture', outcome: 'ACCEPTED_OLD_AUTH_CONTRACT_ONLY' });
function rejects(name, action) {
  let error;
  try { action(); } catch (e) { error = e; }
  assert.ok(error, `${name} unexpectedly accepted`);
  results.push({ case: name, outcome: 'REJECTED', code: error.publicError?.code ?? error.code ?? error.message });
}
const proposal = structuredClone(sample.request); delete proposal.authorizationRef;
rejects('local proposal without authorizationRef', () => validateBuildProposalRequest(proposal));
const facts = structuredClone(sample.facts);
delete facts.grantStatus;
for (const name of ['originalBinding', 'currentBinding']) {
  for (const key of ['expectedGrantRef', 'authorizationRef', 'grantEpoch', 'allowedActions']) delete facts[name][key];
}
rejects('local provider facts without grant/epoch/capabilities', () => validateType('BuildProposalProviderFacts', facts));
const advance = { contractVersion: 'session/v2', actorRef: 'local-user', sessionRef: 'local-session',
  requestId: 'local-advance', worldRef: 'local-world', expectedTurnRevision: 'local-turn' };
rejects('current build without authorizationRef', () => validateBoundRequest('session/v2', 'AdvanceCurrentBuild', advance));
console.log(JSON.stringify({ evidence: 'SOURCE/PUBLIC_CONTRACT_FIXTURE', contracts: contractHandshake.contracts,
  ownerDecision: '1dae1b9fcdc963eb9d51e522a14742b053a6dff9', results }, null, 2));
