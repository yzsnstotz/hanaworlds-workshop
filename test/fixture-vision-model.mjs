import { createHash } from 'node:crypto';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
export const PROVIDER='hanaworlds-fixture',MODEL='fixture-vision-1';
const sha=b=>createHash('sha256').update(b).digest('hex');
export class FixtureVisionModel extends LlmAdapter {
 requests=[];
 constructor(attachments){super();this.attachments=attachments;}
 providerInfo(provider){return {id:provider,name:'FIXTURE vision (not a real model)'};}
 async resolveModel(provider,model){return {provider,id:model,name:'FIXTURE vision (not a real model)',inputModalities:['text','image'],context:{contextWindow:100000}};}
 async *stream(options){
  const images=[];
  for(const m of options.messages)for(const p of m.content)if(p.type==='image'){
   const ref=p.attachment??p;const stored=await this.attachments().readImage(ref);
   images.push({role:m.role,attachmentId:ref.attachmentId,mediaType:stored.ref.mediaType,width:stored.ref.width,height:stored.ref.height,bytes:stored.data.byteLength,sha256:sha(stored.data)});
  }
  const messages=options.messages.flatMap(m=>m.content).filter(p=>p.type==='text').map(p=>p.text).join('\n');
  const tools=(options.tools??[]).map(t=>t.name);
  const record={images,skillCatalog:messages.includes('<available_skills>')&&messages.includes('hanaworlds-building'),tools};this.requests.push(record);
  const text=['【FIXTURE 模型 · 不是真实模型，不会看图】',
   images.length?`本回合模型请求里收到 ${images.length} 张图片的真实字节：`:'本回合模型请求里没有图片。',
   ...images.map(i=>`- ${i.mediaType} ${i.width}×${i.height} px，${i.bytes} B，sha256 ${i.sha256.slice(0,16)}…`),
   '真实模型未授权（UNKNOWN），这里不描述图中结构，也不判断比例/用途是否需要追问。'].join('\n');
  yield {type:'block-start',index:0,blockType:'text'};
  yield {type:'text-delta',index:0,text};
  yield {type:'block-end',index:0,block:{type:'text',text}};
  yield {type:'finish',reason:'stop'};
 }
}
