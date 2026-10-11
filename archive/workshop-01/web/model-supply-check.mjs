// PM-approved isolated metadata component check. No model/user/Session entry.
import {Context,symbols} from '@deepseek-ai/cordis';
import Llm from '@deepseek-ai/dsh-llm';
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai';
import Attachments from '@deepseek-ai/dsh-attachment-local';
import {writeFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {createModelMetadataSupply,readOfficialMetadataSources,requireNoCashAccountCapability} from './model-supply.mjs';

const root=process.argv[2];
if(!isAbsolute(root??'')||process.argv[3]!=='--metadata-scope-go')throw Error('EXACT_PM_METADATA_SCOPE_REQUIRED');
const counters={network:0,auth:0,prepareCall:0,stream:0};
const forbidden=kind=>()=>{counters[kind]++;throw Error(`${kind.toUpperCase()}_DISABLED`);};
const oldFetch=globalThis.fetch;globalThis.fetch=forbidden('network');
const ctx=new Context();let owner,invalidations=[];
try {
 // Public adapter metadata operations never invoke the official empty record
 // bridge. Reject even a lookup of auth/credential/ambient environment seams.
 ctx.on('internal/get',(_ctx,name,_error,next)=>['credentials','authorization','launchEnvironment','fs'].includes(name)?forbidden('auth')():next());
 await ctx.plugin(Llm).await();
 const piOwner=ctx.plugin(PiAi,{providers:{'openai-codex':{}}});await piOwner.await();
 const llm=ctx.llm[symbols.original]??ctx.llm;
 llm.prepareCall=forbidden('prepareCall');llm.stream=forbidden('stream');
 await ctx.plugin(Attachments,{dshHome:join(root,'unused-attachment-root')}).await();
 owner=createModelMetadataSupply(ctx,{onInvalidate:reason=>{invalidations.push(reason);}});
 const signal=new AbortController().signal;
 const snapshot=await owner.read({signal});
 await owner.assertCurrent(snapshot,{signal});
 // Dispose the actual adapter registration via its own official plugin fiber.
 await piOwner.dispose();
 let afterUnload;
 try{await owner.assertCurrent(snapshot,{signal});afterUnload='UNEXPECTED_SUCCESS';}catch(error){afterUnload=error.code;}
 let dispatchGuard;
 try{requireNoCashAccountCapability();}catch(error){dispatchGuard=error.code;}
 const sources=await readOfficialMetadataSources();
 await owner.close();owner=undefined;
 const result={classification:'OFFICIAL_REGISTERED_CATALOG_AND_ATTACHMENT_DECLARATION_ONLY',snapshot,sources,afterUnload,invalidations,counters,dispatchGuard,modelRequests:0,sessionCreated:0,oldStoreOpened:false,worldWrites:0,realModelVision:'NOT_RUN',accountRouteAvailability:'UNKNOWN'};
 if(afterUnload!=='MODEL_ROUTE_NOT_REGISTERED'||Object.values(counters).some(Boolean))throw Error('METADATA_SCOPE_VIOLATION');
 await writeFile(join(root,'official-component-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
} finally {
 try{await owner?.close();}finally{await ctx.fiber.dispose();globalThis.fetch=oldFetch;}
}
