import { defineTool } from '@deepseek-ai/dsh-tools';
// Workshop-owned skill port (PLAN-SAFETY-V1-BATCH-01 single-origin): replaces the Host-inline
// hanaworlds_context of Desktop bd964cdf19785b14aa1e2f6d2a2ee350190a038f skill-tools.ts
// blob 426ca1b1adef74d5bcaa85514cb4f48159f0d3dc L163-177 (which hard-coded entrancePortalRefs: []).
const output={schema:{type:'object',additionalProperties:false,properties:{result:{type:'string',required:true}}},
 render:(_args,value)=>[{type:'text',text:value.result}]};
export function registerContextTool(ctx,workshop) {
 ctx.inject(['tools'],scope=>scope.tools.register(defineTool({
  name:'hanaworlds_context',
  description:'Inspect a proposed place before prepare, confirm the latest human building request, then read its retained geometry context. Use hanaworlds-building skill.',
  parameters:{
   action:{type:'string',enum:['placement','prepare','confirm','read','images'],required:true},
   imageRefs:{type:'array',items:{type:'string'},description:'Actual references from action images or the download tool. Only relevant images in this conversation; an empty array selects text only.'},
   purpose:{type:'string'},width:{type:'integer'},depth:{type:'integer'},height:{type:'integer'},styleText:{type:'string'},
   placementSourceRef:{type:'string',description:'Own Session/current human request reference returned by action placement before prepare. Supply together with placementTarget; never fabricate a source.'},
   placementTarget:{description:'Select from the real inspection returned by action placement. The tool creates the official PlacementProposal and displays it for new human confirmation; omit both placement fields when no structured position is proposed.',oneOf:[
    {type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['EXACT_CELLS'],required:true},cells:{type:'array',required:true,items:{type:'array',items:{type:'integer'}}}}},
    {type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['ANCHORED_EXTENT'],required:true},bounds:{type:'object',required:true,additionalProperties:false,properties:{min:{type:'array',required:true,items:{type:'integer'}},max:{type:'array',required:true,items:{type:'integer'}}}}}},
   ]},
   entrancePortalRefs:{type:'array',items:{type:'string'},description:'Portal references the user chose for the entrance; omit or empty when none.'},
   siteRules:{type:'object',additionalProperties:false,description:'Your proposed site rules (contracts SiteRules), shown to the player for confirmation; values are yours to propose, there is no default. Omit only when not proposed yet.',properties:{
    requireEntranceConnectivity:{type:'boolean',required:true},
    entranceClearance:{required:true,oneOf:[{type:'null'},{type:'object',additionalProperties:false,description:'Design clearance of the entrance opening in whole nodes; a building value, not a body guarantee.',properties:{width:{type:'integer',required:true},height:{type:'integer',required:true},depth:{type:'integer',required:true},unit:{type:'string',enum:['node'],required:true}}}]},
    hazardPolicy:{type:'object',required:true,additionalProperties:false,properties:{forbidLiquid:{type:'boolean',required:true},maximumDamagePerSecond:{type:'number',required:true}}},
    optionalLightRule:{required:true,oneOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{minimumLight:{type:'integer',required:true},sourceRevision:{type:'string',required:true}}}]},
   }},
  },output,
  isConcurrencySafe:()=>false,
  execute:async({action,...args},exec)=>({result:JSON.stringify(await workshop.skillContext(action,args,exec))}),
 })));
}
