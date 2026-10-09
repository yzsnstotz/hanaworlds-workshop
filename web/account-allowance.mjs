// Account allowance read for the pinned openai-codex/gpt-5.6-luna route, before every REAL
// model dispatch. Same grant, same backend and same passive usage read the official Codex
// client uses (openai/codex codex-rs backend-client: GET {base}/wham/usage, no Luna-reserve
// opt-in; payload plan_type / rate_limit / credits / spend_control / rate_limit_reached_type).
// Auth comes only from the official SDK path: pi-ai Models.getAuth over the harness credential
// record that dsh-llm-pi-ai reads and refreshes (same record key, same locked modify). The
// token stays in this process for the one request; it is never logged, returned or copied.
import {createHash} from 'node:crypto';
import {symbols} from '@deepseek-ai/cordis';
import {createModels} from '@earendil-works/pi-ai';
import {openaiCodexProvider} from '@earendil-works/pi-ai/providers/openai-codex';
import {getPiUserAgent} from '@earendil-works/pi-ai/utils/pi-user-agent';
import {recordKeyFor} from '@deepseek-ai/dsh-llm-pi-ai';

const failure=(code,details)=>Object.assign(new Error(code),{code,...details===undefined?{}:{details}});
const jsonImage=value=>JSON.parse(JSON.stringify(value));
// Mirror of dsh-llm-pi-ai's record <-> pi-ai credential translation (not exported there):
// a `grant` record payload is pi-ai's own OAuth credential, stored verbatim.
const toPi=record=>record===undefined?undefined:record.kind==='api-key'?{type:'api_key',...record.key===undefined?{}:{key:record.key}}:record.payload;
function credentialStore(credentials) {
 return {
  async read(providerId){return toPi(await credentials.readRecord(recordKeyFor(providerId)));},
  async list(){return [];},
  async modify(providerId,mutate){return toPi(await credentials.modifyRecord(recordKeyFor(providerId),async current=>{
   const next=await mutate(toPi(current));return next===undefined?undefined:{kind:'grant',payload:jsonImage(next)};}));},
  async delete(){throw failure('ALLOWANCE_READER_NEVER_DELETES');},
 };
}

/** One passive usage read of the stored grant's own account. Sanitized result only. */
export async function readCodexAllowance(ctx,{signal,fetchImpl=fetch}) {
 signal.throwIfAborted();
 const credentials=ctx.get('credentials');
 if(typeof credentials?.readRecord!=='function'||typeof credentials?.modifyRecord!=='function')throw failure('OFFICIAL_CREDENTIAL_PROVIDER_UNAVAILABLE');
 const provider=openaiCodexProvider(),store=credentialStore(credentials);
 const models=createModels({credentials:store});models.setProvider(provider);
 const auth=await models.getAuth(provider.id,{signal});signal.throwIfAborted();
 const credential=await store.read(provider.id);
 if(!auth?.auth?.apiKey||credential?.type!=='oauth')throw failure('ROUTE_NOT_SIGNED_IN');
 if(typeof credential.accountId!=='string'||!credential.accountId)throw failure('GRANT_ACCOUNT_ID_MISSING');
 const response=await fetchImpl(`${provider.baseUrl}/wham/usage`,{signal,headers:{authorization:`Bearer ${auth.auth.apiKey}`,
  'chatgpt-account-id':credential.accountId,originator:'pi','user-agent':getPiUserAgent(),accept:'application/json','cache-control':'no-cache'}});
 if(!response.ok)throw failure('USAGE_READ_FAILED',{status:response.status});
 const p=await response.json();
 const window=w=>w==null?null:{usedPercent:w.used_percent,windowSeconds:w.limit_window_seconds,resetAfterSeconds:w.reset_after_seconds,resetAt:w.reset_at};
 return {route:{provider:'openai-codex',model:'gpt-5.6-luna',endpoint:`${provider.baseUrl}/wham/usage`},observedAt:new Date().toISOString(),
  accountRef:`sha256-${createHash('sha256').update(credential.accountId).digest('hex').slice(0,16)}`,
  planType:p.plan_type??null,
  rateLimit:p.rate_limit==null?null:{allowed:p.rate_limit.allowed,limitReached:p.rate_limit.limit_reached,primary:window(p.rate_limit.primary_window),secondary:window(p.rate_limit.secondary_window)},
  credits:p.credits==null?null:{hasCredits:p.credits.has_credits,unlimited:p.credits.unlimited,balance:p.credits.balance??null},
  spendControlReached:p.spend_control?.reached??null,
  rateLimitReachedType:p.rate_limit_reached_type?.type??null};
}

// Personal subscription plans whose Codex usage is the plan's included limits plus optional
// prepaid credits. Workspace/usage-based plans bill differently and are refused by name.
const INCLUDED_PLANS=new Set(['plus','pro','prolite','promax','go']);
const zero=b=>b===null||(typeof b==='string'||typeof b==='number')&&Number(b)===0;
/** Visible setting (page state + REPORT): the most of any included window a REAL model call may
 * start at. Credits are only drawn after the included limit is reached (official Codex pricing),
 * so every call is re-checked against this bound right before dispatch. */
export const DEFAULT_MAX_INCLUDED_USED_PERCENT=97;
/** Decision right before one REAL model call: dispatch only while the call is served from the
 * plan's included limits. A credits balance is reported, not spent: once included usage is not
 * available the call is refused here, before any request can fall back to credits. */
export function noCashDecision(a,{maxIncludedUsedPercent=DEFAULT_MAX_INCLUDED_USED_PERCENT}={}) {
 const refuse=(code,why)=>({allow:false,code,why,allowance:a});
 if(!INCLUDED_PLANS.has(a.planType))return refuse('PLAN_NOT_INCLUDED_SUBSCRIPTION',`plan_type ${a.planType} is not a personal subscription with included Codex limits`);
 if(a.credits===null)return refuse('CREDITS_STATE_UNKNOWN','usage read returned no credits state');
 if(a.credits.unlimited)return refuse('CREDITS_UNLIMITED','unlimited credits: included-only use cannot be told apart');
 if(a.rateLimit===null||!a.rateLimit.allowed||a.rateLimit.limitReached||a.rateLimitReachedType!==null||a.spendControlReached===true)return refuse('INCLUDED_LIMIT_NOT_AVAILABLE','included usage is not currently allowed');
 for(const w of [a.rateLimit.primary,a.rateLimit.secondary])if(w!==null&&!(w.usedPercent<=maxIncludedUsedPercent))return refuse('INCLUDED_HEADROOM_BELOW_SETTING',`an included window is ${w.usedPercent}% used, above the ${maxIncludedUsedPercent}% setting`);
 const credits=a.credits.hasCredits||!zero(a.credits.balance);
 return {allow:true,code:credits?'INCLUDED_ONLY_CREDITS_GUARDED':'INCLUDED_ONLY_NO_CREDITS',
  why:credits?'included usage allowed with headroom; the account also holds prepaid credits, which this call does not reach: each call is re-checked here and refused once included usage is not available':'included usage allowed with headroom and the account holds no credits: a call is served from included limits or refused by the platform',allowance:a};
}

/** Install the per-call guard on this Host's own LLM service (not SDK source): every REAL
 * openai-codex prepareCall first re-reads the allowance and refuses by name, before dispatch. */
export function guardRealDispatch(ctx,{provider='openai-codex',read=signal=>readCodexAllowance(ctx,{signal}),settings,record}) {
 // Cordis hands out a caller proxy per get; the guard belongs on the service itself.
 const proxy=ctx.get('llm'),llm=proxy?.[symbols.original]??proxy,original=llm.prepareCall.bind(llm);
 llm.prepareCall=async(config,signal)=>{
  if(config?.provider===provider){
   const decision=noCashDecision(await read(signal??AbortSignal.timeout(30000)),settings());record?.(decision);
   if(!decision.allow)throw failure(`REAL_DISPATCH_REFUSED_${decision.code}`,{why:decision.why});
  }
  return original(config,signal);
 };
 return ()=>{llm.prepareCall=original;};
}
