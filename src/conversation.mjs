import { randomUUID } from 'node:crypto';

/** Read public Core facts. Next selection can differ from the model used by the
 * last request; a receipt always names the request already made. No model default
 * belongs to Workshop: the native Host supplies the initial selection. */
export function sessionModel(events,{next=false,initial}={}) {
 const header=events.findLast(e=>e.type==='request/header');
 const chosen=next?events.findLast(e=>e.type==='model/selection'&&(!header||e.seq>header.seq)):null;
 const value=chosen?.data??header?.data?.header?.config??(typeof initial==='function'?initial():initial);
 if(typeof value?.provider!=='string'||!value.provider||typeof value?.model!=='string'||!value.model)
  throw Error('MODEL_SELECTION_UNAVAILABLE');
 return {provider:value.provider,model:value.model};
}
export function conversationView(session,agent,initial) {
 const events=session.snapshotEvents(),items=[];
 for(const e of events){
  if(e.surfaceOp!=='append')continue;
  const m=e.type==='assistant/message'?e.data.message:e.type==='user/message'&&e.data.source?.kind==='user'?e.data:null;
  if(!m)continue;
  const text=m.content.filter(p=>p.type==='text').map(p=>p.text).join('\n');
  if(!text)continue;
  items.push({id:m.id,role:m.role,text,...m.role==='assistant'?{provider:m.source.provider,model:m.source.model}:{}});
 }
 return {sessionRef:session.header.id,model:sessionModel(events,{next:true,initial}),status:agent.status,items};
}
export async function sendConversation(service,session,text,signal) {
 signal.throwIfAborted();
 if(typeof text!=='string'||!text.trim())throw Error('QUESTION_REQUIRED');
 const agent=service.conversationAgent(session);
 if(agent.status!=='idle'||service.conversationSends.has(agent))throw Error('AGENT_BUSY');
 // Refuse before inbox admission when the Host has supplied no model.
 await service.readConversationForPanel(session,signal);
 if(agent.status!=='idle'||service.conversationSends.has(agent))throw Error('AGENT_BUSY');
 service.conversationSends.add(agent);
 let failure;
 const stop=()=>agent.cancel({kind:'user'},{keepInbox:true});
 const off=agent.ctx.on('agent/error',event=>{if(event.agent===agent)failure=event.error;});
 const before=session.snapshotEvents().length;
 const promptId=`workshop-prompt-${randomUUID()}`;
 try{
  signal.throwIfAborted();service.conversationAgent(session);
  agent.followup({id:promptId,role:'user',source:{kind:'user'},content:[{type:'text',text:text.trim()}]});
  signal.addEventListener('abort',stop,{once:true});
  if(signal.aborted)stop();
  await agent.whenIdle();await service.sessions.flush(session);
  signal.throwIfAborted();service.conversationAgent(session);
  if(failure)throw failure;
  const added=session.snapshotEvents().slice(before);
  const admitted=added.findIndex(e=>e.type==='user/message'&&e.data.id===promptId);
  const turn=admitted<0?null:added.slice(0,admitted).findLast(e=>e.type==='turn/start')?.data.turn;
  if(turn===null||turn===undefined||!added.some(e=>e.type==='assistant/message'&&e.data.turn===turn&&e.surfaceOp==='append'&&e.data.message.content.some(p=>p.type==='text'&&p.text.trim())))
   throw Error('MODEL_TURN_NO_REPLY');
  return service.readConversationForPanel(session,signal);
 }finally{signal.removeEventListener('abort',stop);off();service.conversationSends.delete(agent);}
}
