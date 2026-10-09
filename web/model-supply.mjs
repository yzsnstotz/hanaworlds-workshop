// Independent developer Host supply. No wire service, model driver or account
// protocol. Public metadata declarations cannot establish account availability.
import {symbols} from '@deepseek-ai/cordis';
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import canonicalize from 'canonicalize';
import deleteSource from './session-delete-source.json' with {type:'json'};

const original=value=>value?.[symbols.original]??value;
const failure=code=>Object.assign(new Error(code),{code});
const digest=value=>createHash('sha256').update(canonicalize(value)).digest('hex');
const media=['image/png','image/jpeg','image/webp','image/gif'];
const provider='openai-codex',model='gpt-5.6-luna';
const freeze=value=>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);};

/** Hash installed public JS/declarations, never credential/config files.
 * This is artifact identity, not a remote revision or an account assertion. */
export async function readOfficialMetadataSources() {
 const names=['@deepseek-ai/dsh-llm','@deepseek-ai/dsh-llm-pi-ai','@earendil-works/pi-ai','@deepseek-ai/dsh-attachment','@deepseek-ai/dsh-attachment-local','@deepseek-ai/dsh-session-persistence','@deepseek-ai/dsh-session-persistence-jsonl'];
 const artifacts=[];
 for(const name of names){
  const entry=fileURLToPath(import.meta.resolve(name)),root=dirname(dirname(entry));
  const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  const paths=name==='@earendil-works/pi-ai'?['dist/providers/openai-codex.js','dist/providers/data/openai-codex.json']:['lib/index.js','lib/types/index.d.ts'];
  const files=[];
  for(const path of paths)files.push({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')});
  artifacts.push({name:manifest.name,version:manifest.version,repository:manifest.repository,files});
 }
 return freeze({kind:'INSTALLED_PUBLIC_ARTIFACTS',artifacts,artifactRevision:`sha256-${digest(artifacts)}`});
}

/** Optional onInvalidate is the consuming Host's existing owner.invalidate
 * callback. It must withdraw its publication and propagate release failures.
 * No timer/polling: public events withdraw immediately; each read rechecks.
 */
export function createModelMetadataSupply(ctx,{onInvalidate=()=>{}}={}) {
 let closed=false,generation=0,notificationError;
 const invalidate=async reason=>{
  generation++;
  try{await onInvalidate(reason);}catch(error){notificationError=error;throw error;}
 };
 const removers=[
  ctx.on('llm/adapters-updated',()=>invalidate('ADAPTER_REGISTRATION_CHANGED')),
  ctx.on('loader/volatile-update',()=>invalidate('PROVIDER_CONFIGURATION_CHANGED')),
  ctx.on('internal/service',name=>['llm','attachments','sessionPersistence'].includes(name)?invalidate('SERVICE_PROVIDER_CHANGED'):undefined),
 ];
 async function read({signal}) {
  signal.throwIfAborted();if(closed)throw failure('METADATA_OWNER_CLOSED');
  if(notificationError)throw notificationError;
  const epoch=generation,llm=ctx.get('llm'),attachments=ctx.get('attachments');
  const current=()=>{
   signal.throwIfAborted();if(closed)throw failure('METADATA_OWNER_CLOSED');
   if(notificationError)throw notificationError;
   if(epoch!==generation||original(llm)!==original(ctx.get('llm'))||original(attachments)!==original(ctx.get('attachments')))throw failure('METADATA_SOURCE_CHANGED');
  };
  if(!llm?.listProviders().some(entry=>entry.id===provider))throw failure('MODEL_ROUTE_NOT_REGISTERED');
  const sources=await readOfficialMetadataSources();current();
  async function observation(){
   const listed=await llm.listModels(provider);current();
   const entry=listed.find(entry=>entry.provider===provider&&entry.id===model);
   if(!entry)throw failure('MODEL_NOT_ADVERTISED');
   const resolved=await llm.resolveModelInfo(provider,model,signal);current();
   if(resolved.provider!==provider||resolved.id!==model)throw failure('MODEL_IDENTITY_MISMATCH');
   if(!Array.isArray(resolved.inputModalities))throw failure('MODEL_MODALITIES_UNKNOWN');
   const limits=attachments?.imageLimits;
   if(!Array.isArray(limits?.mediaTypes))throw failure('ATTACHMENT_MIME_SOURCE_REQUIRED');
   return {declaredModel:structuredClone(resolved),attachmentImageLimits:structuredClone(limits)};
  }
  const first=await observation(),second=await observation();current();
  if(digest(first)!==digest(second))throw failure('MODEL_METADATA_CHANGED');
  const value={modelRef:`${provider}/${model}`,route:{provider,model},
   imageMediaTypes:second.declaredModel.inputModalities.includes('image')?media.filter(type=>second.attachmentImageLimits.mediaTypes.includes(type)):[],
   ...second,sources,
   scope:'THIS_ROOT_REGISTERED_ROUTE_AND_WORKSHOP_ATTACHMENT_INGRESS_DECLARATION',
   availability:{registeredRoute:'OBSERVED',modelMetadata:'ADAPTER_DECLARED',imageIngress:'ATTACHMENT_DECLARED',modelVision:'NOT_RUN',account:'UNKNOWN',noAdditionalCash:'UNPROVEN'},
   generation:epoch};
  // Opaque identity of actual public declarations, not the full Host revision.
  return freeze({...value,sourceRevision:`sha256-${digest(value)}`});
 }
 return Object.freeze({read,
  async readSessionDelete({signal}){
   signal.throwIfAborted();if(closed)throw failure('METADATA_OWNER_CLOSED');if(notificationError)throw notificationError;
   const epoch=generation,value=await readSessionDeleteMetadata(ctx,{signal});
   if(closed||epoch!==generation)throw failure('METADATA_SOURCE_CHANGED');if(notificationError)throw notificationError;
   return value;
  },
  async assertCurrent(snapshot,options){
   const next=await read(options);
   if(next.sourceRevision!==snapshot.sourceRevision){await invalidate('METADATA_CONTENT_CHANGED');throw failure('MODEL_METADATA_CHANGED');}
   return next;
  },
  close(){if(closed)return;closed=true;for(const remove of removers)remove();return invalidate('METADATA_OWNER_CLOSED');},
 });
}

/** Exact official JSONL backend only. A missing/different provider is UNKNOWN,
 * never false by default. No session is created/read/closed/deleted here. */
export async function readSessionDeleteMetadata(ctx,{signal}) {
 signal.throwIfAborted();
 const persistence=ctx.get('sessionPersistence'),owner=original(persistence);
 if(!owner||Object.getPrototypeOf(owner)!==Jsonl.prototype)throw failure('OFFICIAL_SESSION_PERSISTENCE_REQUIRED');
 const relevant=[];
 for(const artifact of deleteSource.artifacts){
  const root=dirname(dirname(fileURLToPath(import.meta.resolve(artifact.package))));
  for(const file of artifact.installed_files_equal){
   const bytes=await readFile(join(root,file.path));signal.throwIfAborted();
   if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw failure('OFFICIAL_DELETE_SUPPORT_REVISION_UNREVIEWED');
  }
  relevant.push(structuredClone(artifact));
 }
 if(original(ctx.get('sessionPersistence'))!==owner)throw failure('METADATA_SOURCE_CHANGED');
 const value={sessionDeleteSupported:false,status:'UNSUPPORTED',scope:'EXACT_OFFICIAL_JSONL_0.2.0_RC.2_PERSISTENT_DELETE',sources:relevant,
  publicMethods:['create','open','flush','stat','list'],lifetime:'Only while this exact public provider remains bound; re-read before Host publication/use. dispose releases live ownership, not stored Session data.'};
 return freeze({...value,sourceRevision:`sha256-${digest(value)}`});
}

/** Fixed SDK has no public same-registration account/allowance/credit-control
 * capability to consume. No arbitrary caller assertion can unlock this gate.
 * Replace only after an actual upstream normal SDK capability is supplied. */
export function requireNoCashAccountCapability() {
 throw failure('ACCOUNT_PROVIDER_PUBLIC_CAPABILITY_MISSING');
}
