// Configuration metadata through the existing official seam. No credential
// reader/copy/broker, auth resolver or second account truth.
import {symbols} from '@deepseek-ai/cordis';
import {recordKeyFor} from '@deepseek-ai/dsh-llm-pi-ai';
import {createHash} from 'node:crypto';
import canonicalize from 'canonicalize';

const original=value=>value?.[symbols.original]??value;
const failure=code=>Object.assign(new Error(code),{code});
const provider='openai-codex',model='gpt-5.6-luna';

export async function readRouteLoginRecordState(ctx,{signal}) {
 signal.throwIfAborted();
 const llm=ctx.get('llm'),credentials=ctx.get('credentials');
 if(!llm?.listProviders().some(route=>route.id===provider))throw failure('MODEL_ROUTE_NOT_REGISTERED');
 if(typeof credentials?.describeRecord!=='function')throw failure('OFFICIAL_CREDENTIAL_METADATA_UNAVAILABLE');
 const current=()=>{
  signal.throwIfAborted();
  if(original(llm)!==original(ctx.get('llm'))||original(credentials)!==original(ctx.get('credentials')))throw failure('AUTH_CONFIGURATION_PROVIDER_CHANGED');
 };
 const recordKey=recordKeyFor(provider);
 const describe=async()=>{
  const info=await credentials.describeRecord(recordKey);current();
  if(typeof info.configured!=='boolean'||typeof info.writable!=='boolean'||info.kind!==undefined&&!['api-key','grant'].includes(info.kind))throw failure('INVALID_CREDENTIAL_RECORD_METADATA');
  // Allowlist the public configuration fields; no raw record ever enters
  // this consumer. Presence does not resolve/refresh or validate OAuth.
  return {configured:info.configured,writable:info.writable,...info.kind===undefined?{}:{kind:info.kind}};
 };
 const record=Object.freeze(await describe());
 const value={route:Object.freeze({provider,model}),recordKey,record,
  source:'OFFICIAL_CREDENTIAL_PROVIDER_DESCRIBE_RECORD',scope:'THIS_ROOT_ROUTE_LOGIN_CONFIGURATION_ONLY',
  authentication:'NOT_RESOLVED',accountAssociation:'UNKNOWN',allowance:'UNKNOWN',paidCreditRestriction:'UNDECLARED',modelDispatch:'BLOCKED_BEFORE_PREPARE_CALL'};
 return Object.freeze({...value,sourceRevision:`sha256-${createHash('sha256').update(canonicalize(value)).digest('hex')}`});
}

/** Shared record home is only for the official SDK's normal credential use.
 * A browser must not start login/logout in that home. SDK-owned automatic
 * OAuth refresh/modify remains governed by its normal locked record path.
 */
export function assertBrowserCredentialMutationAllowed(credentialHome) {
 if(credentialHome!==undefined)throw failure('SHARED_LOGIN_RECORD_BROWSER_MUTATION_DISABLED');
}
