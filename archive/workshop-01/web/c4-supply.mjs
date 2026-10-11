// Standalone Workshop developer-page assembly. No new Workshop wire/export,
// projection, request cache or producer of session/brief/connection facts.
import { symbols } from '@deepseek-ai/cordis';
import { ContractError } from 'hanaworlds-contracts';
import { randomUUID } from 'node:crypto';

const origin = value => value?.[symbols.original] ?? value;
const unavailable = () => new ContractError('CAPABILITY_UNAVAILABLE', 'validate', 'REQUIRED_FACT_UNKNOWN');

/** The existing Painter Host port, confined to the existing text getter.
 * getWorkshop resolves the current registered owner; no Session mutation lock
 * is held here, because Painter reenters while submitBuildProposal holds it.
 * Request validation and authentic durable/current facts remain Workshop-owned.
 */
export function createPainterLocalFactsPort(getWorkshop) {
 return Object.freeze({
  async read(request, operation, {signal}) {
   signal.throwIfAborted();
   if (operation !== 'ValidateBuildProposal') throw unavailable();
   const workshop = getWorkshop();
   if (typeof workshop?.readBuildProposalProviderFacts !== 'function') throw unavailable();
   const facts = await workshop.readBuildProposalProviderFacts(request);
   signal.throwIfAborted();
   if (origin(workshop) !== origin(getWorkshop())) throw unavailable();
   return facts;
  },
 });
}

/** Only the standalone page's checked, same-origin user-input receiver calls
 * this; never a model request or a synthetic confirmation recipe. SessionStore
 * remains the identity owner. A fresh conversation must first start through
 * the official Loop; this helper neither constructs its head nor wakes it.
 */
export async function appendStartedUserInput(ctx, sessionRef, text, signal) {
 signal.throwIfAborted();
 if (typeof text !== 'string' || !text.trim() || text.length > 4096) {
  throw Object.assign(new Error('INVALID_USER_INPUT'), {code:'INVALID_USER_INPUT'});
 }
 const sessions = ctx.sessions, session = sessions.get(sessionRef);
 if (!session) throw Object.assign(new Error('SESSION_NOT_FOUND'), {code:'SESSION_NOT_FOUND'});
 const head = session.surface.nodes[0];
 if (head === undefined || session.eventAt(head)?.type !== 'system/message') {
  throw Object.assign(new Error('CONVERSATION_NOT_STARTED_MODEL_PATH_UNPROVEN'), {code:'CONVERSATION_NOT_STARTED_MODEL_PATH_UNPROVEN'});
 }
 const inputId = `supply-input-${randomUUID()}`;
 session.append('user/message', {
  id: inputId, role:'user', source:{kind:'user'}, content:[{type:'text',text}],
 }, {surfaceOp:'append'});
 // An accepted Core append cannot be retracted because flush/cancellation
 // fails. Expose the committed identity so the caller cannot silently retry.
 try {
  await sessions.flush(session);
  signal.throwIfAborted();
  if (origin(sessions) !== origin(ctx.sessions) || sessions.get(sessionRef) !== session) {
   throw Error('SESSION_PROVIDER_CHANGED');
  }
 } catch (error) {
  error.committedInputId = inputId;
  throw error;
 }
 return {sessionRef,sourceMessageId:inputId,status:'CORE_INPUT_STORED'};
}
