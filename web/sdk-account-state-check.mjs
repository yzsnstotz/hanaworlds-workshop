// One PM-reviewed normal SDK login-configuration read, never a model probe.
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root='/Users/yzliu/.cache/hanaworlds-runs/F-WS-IMAGE-ASK-01/01a11e42-ab47-72e0-9321-6b624b08987c/sdk-account-state-01';
const credentialHome='/Users/yzliu/.cache/hanaworlds-runs/F-WS-IMAGE-ASK-01/25c69bed-3bd4-40b4-9434-50456e04a8e2/runtime-47609-v049/session-TA5ByA/dsh-home';
const source=dirname(dirname(fileURLToPath(import.meta.url)));
if(process.argv[2]!==root||process.argv[3]!=='--sdk-state-scope-go'||!process.argv[4])throw Error('EXACT_SDK_SCOPE_REQUIRED');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
if(sourceCommit!==process.argv[4])throw Error('SOURCE_REVISION_DRIFT');
if(process.version!=='v24.13.1'||process.execPath!=='/Users/yzliu/.local/share/fnm/node-versions/v24.13.1/installation/bin/node')throw Error('NODE_IDENTITY_DRIFT');
await fs.promises.mkdir(root,{mode:0o700}); // Exclusive ABSENT precondition; never retries.
const safeWrite=fs.promises.writeFile.bind(fs.promises);
const recordPath=join(credentialHome,'.credentials.yaml');
const metadata=async()=>{try{const s=await fs.promises.stat(recordPath);return {exists:true,bytes:s.size,mode:s.mode&0o777,mtimeMs:s.mtimeMs};}catch(e){if(e.code==='ENOENT')return {exists:false};throw e;}};
const before=await metadata();
const counters={network:0,prepareCall:0,stream:0,sdkWriteAttempt:0,sdkDiagnosticWrites:0,listProviders:0,describeRecord:0};
const fail=code=>{throw Object.assign(new Error(code),{code});};
const oldFetch=globalThis.fetch;globalThis.fetch=()=>{counters.network++;return fail('NETWORK_DISABLED');};
// Refuse additional SDK writes before they occur, including legacy-layout
// migration/lock creation. This guard belongs to this sole component process,
// not SDK source or a new credential broker. Reads stay inside official SDK.
const saved=[];
for(const method of ['mkdir','writeFile','appendFile','rename','unlink','rm','rmdir','chmod','chown','copyFile','link','symlink','truncate']){
 const old=fs.promises[method];if(typeof old!=='function')continue;
 saved.push([method,old]);fs.promises[method]=()=>{counters.sdkWriteAttempt++;return fail('SDK_ADDITIONAL_WRITE_DISABLED');};
}
const oldOpen=fs.promises.open;saved.push(['open',oldOpen]);
fs.promises.open=(path,flags,...rest)=>{
 const writable=typeof flags==='string'?/[wa+]/.test(flags):(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND))!==0;
 if(writable){counters.sdkWriteAttempt++;return fail('SDK_ADDITIONAL_WRITE_DISABLED');}
 return oldOpen(path,flags,...rest);
};
syncBuiltinESMExports();
// SDK diagnostics may contain parser context; suppress their payload rather
// than log/serialize any credentials. Failure is still explicit below.
const out=process.stdout.write,err=process.stderr.write;
const discard=function(_chunk,_encoding,callback){counters.sdkDiagnosticWrites++;if(typeof _encoding==='function')_encoding();else callback?.();return true;};
process.stdout.write=discard;process.stderr.write=discard;
let ctx,owners=[],result,packages=[],originalIdentities,stage='SDK_IMPORT';
try{
 const promiseFs=await import('node:fs/promises');
 if(promiseFs.open!==fs.promises.open)fail('SDK_WRITE_GUARD_NOT_BOUND');
 const {Context,symbols}=await import('@deepseek-ai/cordis');
 const {default:Llm}=await import('@deepseek-ai/dsh-llm');
 ctx=new Context();
 stage='LLM_LOAD';const llmOwner=ctx.plugin(Llm);owners.push(['llm',llmOwner]);await llmOwner.await();
 const llm=ctx.llm[symbols.original]??ctx.llm;
 llm.prepareCall=()=>{counters.prepareCall++;return fail('PREPARE_CALL_DISABLED');};
 llm.stream=()=>{counters.stream++;return fail('STREAM_DISABLED');};
 // These imports and route loading occur only after dispatch tripwires exist.
 const {default:CredentialsLocal}=await import('@deepseek-ai/dsh-credentials-local');
 const PiAi=await import('@deepseek-ai/dsh-llm-pi-ai');
 const {readRouteLoginRecordState}=await import('./sdk-auth-state.mjs');
 for(const name of ['@deepseek-ai/cordis','@deepseek-ai/dsh-llm','@deepseek-ai/dsh-credentials-local','@deepseek-ai/dsh-llm-pi-ai','@earendil-works/pi-ai']){
  const entry=fileURLToPath(import.meta.resolve(name)),packageRoot=dirname(dirname(entry));
  const manifest=JSON.parse(await fs.promises.readFile(join(packageRoot,'package.json'),'utf8'));
  const expected=name==='@deepseek-ai/cordis'?'4.0.4':name==='@earendil-works/pi-ai'?'0.87.1':'0.2.0-rc.2';
  if(manifest.version!==expected)fail('SDK_VERSION_DRIFT');
  packages.push({name:manifest.name,version:manifest.version,entry,entrySha256:createHash('sha256').update(await fs.promises.readFile(entry)).digest('hex')});
 }
 stage='CREDENTIALS_LOCAL_LOAD';
 const credentialOwner=ctx.plugin(CredentialsLocal,{dshHome:credentialHome,watch:false});owners.push(['credentialsLocal',credentialOwner]);await credentialOwner.await();
 stage='PIAI_ROUTE_LOAD';const piOwner=ctx.plugin(PiAi,{providers:{'openai-codex':{}}});owners.push(['piAi',piOwner]);await piOwner.await();
 const credentials=ctx.credentials[symbols.original]??ctx.credentials;
 const sameOriginal=()=>llm===(ctx.get('llm')?.[symbols.original]??ctx.get('llm'))&&credentials===(ctx.get('credentials')?.[symbols.original]??ctx.get('credentials'));
 originalIdentities={before:sameOriginal()};
 const describe=credentials.describeRecord.bind(credentials),list=llm.listProviders.bind(llm);
 credentials.describeRecord=(key)=>{counters.describeRecord++;if(counters.describeRecord!==1)fail('EXTRA_PUBLIC_METADATA_READ_DISABLED');return describe(key);};
 llm.listProviders=()=>{counters.listProviders++;if(counters.listProviders!==1)fail('EXTRA_PUBLIC_METADATA_READ_DISABLED');return list();};
 stage='PUBLIC_CONFIGURATION_READ';
 const configuration=await readRouteLoginRecordState(ctx,{signal:new AbortController().signal});
 originalIdentities.after=sameOriginal();
 if(!originalIdentities.before||!originalIdentities.after)fail('AUTH_CONFIGURATION_PROVIDER_CHANGED');
 result={classification:'REAL_OFFICIAL_LOGIN_CONFIGURATION_ONLY',sourceCommit,root,credentialHome,packages,configuration,modelRequests:0,sessionCreated:0,authRefresh:'NOT_REQUESTED',modelAccountAllowance:'UNKNOWN',zeroCashModelPath:'NO_EXECUTABLE_PATH_DECLARED_BY_PINNED_PUBLIC_API'};
} catch(error){
 result={classification:'SDK_COMPONENT_STOPPED',sourceCommit,root,credentialHome,packages,stage,errorCode:/^[A-Z0-9_]{1,80}$/.test(error?.code??'')?error.code:'SDK_OPERATION_FAILED',modelRequests:0,sessionCreated:0};
 process.exitCode=1;
} finally {
 const disposed=[];
 for(const [name,owner] of owners.reverse()){
  try{await owner.dispose();disposed.push({name,disposed:true});}catch{disposed.push({name,disposed:false});process.exitCode=1;}
 }
 try{await ctx?.fiber.dispose();disposed.push({name:'root',disposed:true});}catch{disposed.push({name:'root',disposed:false});process.exitCode=1;}
 let after;
 try{after=await metadata();}catch{after={unavailable:true};process.exitCode=1;}
 result={...result,originalIdentities,counters,disposed,credentialFileMetadataBefore:before,credentialFileMetadataAfter:after,credentialMetadataUnchanged:JSON.stringify(before)===JSON.stringify(after),credentialContentReadByWorker:false};
 if(counters.network||counters.prepareCall||counters.stream||counters.sdkWriteAttempt||!result.credentialMetadataUnchanged)process.exitCode=1;
 await safeWrite(join(root,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 for(const [method,old] of saved)fs.promises[method]=old;
 syncBuiltinESMExports();globalThis.fetch=oldFetch;process.stdout.write=out;process.stderr.write=err;
}
