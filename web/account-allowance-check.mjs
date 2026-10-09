// One passive account allowance read through the official SDK credential seam (no model request).
// Usage: node web/account-allowance-check.mjs <absolute out.json> <absolute existing dsh-home>
// Network is allowlisted to the usage endpoint and the official OAuth refresh (only if the SDK
// decides the token expires soon). Output is the sanitized allowance and the dispatch decision.
import {writeFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local';
import {readCodexAllowance,noCashDecision} from './account-allowance.mjs';

const [out,credentialHome]=process.argv.slice(2);
if(!isAbsolute(out??'')||!isAbsolute(credentialHome??''))throw Error('ABSOLUTE_OUT_AND_CREDENTIAL_HOME_REQUIRED');
const calls=[];const real=globalThis.fetch;
const allowed=url=>url==='https://chatgpt.com/backend-api/wham/usage'||url==='https://auth.openai.com/oauth/token';
globalThis.fetch=(input,init)=>{const url=String(input?.url??input);calls.push(url);if(!allowed(url))throw Error(`NETWORK_NOT_ALLOWLISTED ${url}`);return real(input,init);};
const ctx=new Context();
try{
 await ctx.plugin(CredentialsLocal,{dshHome:credentialHome,watch:false}).await();
 const allowance=await readCodexAllowance(ctx,{signal:AbortSignal.timeout(30000)});
 const decision=noCashDecision(allowance);
 const result={classification:'REAL_ACCOUNT_ALLOWANCE_READ',credentialHome,network:calls,modelRequests:0,decision:{allow:decision.allow,code:decision.code,why:decision.why},allowance};
 await writeFile(out,JSON.stringify(result,null,1)+'\n');console.log(JSON.stringify({allow:decision.allow,code:decision.code}));
}catch(error){
 await writeFile(out,JSON.stringify({classification:'REAL_ACCOUNT_ALLOWANCE_READ_FAILED',network:calls,modelRequests:0,code:error.code??null,message:String(error.message).slice(0,300),details:error.details??null},null,1)+'\n');
 console.log(JSON.stringify({failed:error.code??error.message}));process.exitCode=1;
}finally{await ctx.fiber.dispose();}
