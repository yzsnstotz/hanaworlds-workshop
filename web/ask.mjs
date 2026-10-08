const $=id=>document.getElementById(id);
const explain={IMAGE_TYPE_UNSUPPORTED:'这不是支持的图片（只收 PNG / JPEG / WebP / GIF）。',IMAGE_HTTP_FAILED:'图片下载失败（对方返回错误或要求跳转；请贴直达图片的链接）。',IMAGE_URL_REQUIRED:'请填写 HTTP/HTTPS 图片链接。',IMAGE_TOO_LARGE:'图片超过大小上限。',IMAGE_EMPTY:'图片是空的。',IMAGE_BYTES_REQUIRED:'没有读到图片字节。',QUESTION_REQUIRED:'请先写下问题。',AGENT_BUSY:'模型还在回答上一个问题。',MODEL_TURN_NO_REPLY:'模型回合结束了，但没有回答。',CONVERSATION_NOT_FOUND:'找不到这个对话。','fetch failed':'图片下载失败（连不上该地址）。'};
let state={conversation:null,busy:false,limits:null};
const show=e=>{const code=e.message;$('error').textContent=`未完成：${code}${explain[code]?` — ${explain[code]}`:''}${e.details?` ${JSON.stringify(e.details)}`:''}　页面可继续使用。`;$('error').hidden=false;};
const status=t=>{$('status').textContent=t;};
function lock(on){state.busy=on;for(const id of ['upload','link','ask','new','sample','conversation'])$(id).disabled=on||(id!=='new'&&id!=='sample'&&id!=='conversation'&&!state.conversation);}
async function call(path,args={}){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:state.conversation,...args})});let body;try{body=await r.json();}catch{throw Error(`HTTP ${r.status}`);}if(!r.ok||body.error){const e=Error(body.error??`HTTP ${r.status}`);e.details=body.details;throw e;}return body.result;}
async function run(label,fn){if(state.busy)return;$('error').hidden=true;lock(true);status(label);try{await fn();}catch(e){show(e);status('上一步没有完成，已保持原状态。');}finally{lock(false);}}
const statusText={QUEUED_FOR_NEXT_TURN:'已排入：下一次提问时随消息一起交给模型',ATTACHED:'已在对话中'};
function thumb(img){const fig=document.createElement('figure');fig.className='thumb';if(img.data){const i=document.createElement('img');i.src=`data:${img.mediaType};base64,${img.data}`;i.alt='附图缩略图';fig.append(i);}const c=document.createElement('figcaption');c.textContent=`${img.mediaType} · ${img.width}×${img.height} px · ${Number(img.bytes).toLocaleString()} B · ${statusText[img.status]??img.status}`;fig.append(c);return fig;}
function renderTranscript(t){
 $('conv-state').textContent=t.started?'已开始的对话':'新对话（还没有回合）';
 const chat=$('chat');chat.replaceChildren();const atts=$('attachments');atts.replaceChildren();
 const all=[...t.items,...t.queued];
 if(!all.length){const p=document.createElement('p');p.className='empty';p.textContent='附一张图，再提问。模型回答会显示在这里。';chat.append(p);}
 for(const m of all){
  const d=document.createElement('div');d.className=`msg ${m.role}${m.queued?' queued':''}`;
  const who=document.createElement('b');who.textContent=m.role==='assistant'?'模型（FIXTURE）':m.queued?'你 · 排队中':'你';d.append(who);
  if(m.text){const p=document.createElement('p');p.textContent=m.text;d.append(p);}
  for(const img of m.images??[]){d.append(thumb(img));atts.append(thumb(img));}
  chat.append(d);
 }
 chat.scrollTop=chat.scrollHeight;
}
async function refresh(){renderTranscript(await call('/api/ask/transcript'));}
async function loadState(select){
 const r=await fetch('/api/ask/state');if(!r.ok)throw Error(`HTTP ${r.status}`);const s=await r.json();
 if(s.fixture?.kind!=='FIXTURE')throw Error('FIXTURE_LABEL_REQUIRED');
 $('fixture-model').textContent=`模型 ${s.fixture.model} · ${s.fixture.realModel}`;state.limits=s.limits;
 $('limits').textContent=`上限 ${Math.floor(s.limits.maxImageBytes/1024/1024)} MiB · 类型 ${s.limits.mediaTypes.join(' / ')}`;
 const sel=$('conversation');sel.replaceChildren();s.conversations.forEach((c,i)=>{const o=document.createElement('option');o.value=c.id;o.textContent=`对话 ${i+1}${c.started?'':'（新）'} · ${c.id.slice(4,12)}`;sel.append(o);});
 const want=select??state.conversation;state.conversation=s.conversations.some(c=>c.id===want)?want:s.initial;sel.value=state.conversation;
}
$('conversation').addEventListener('change',()=>run('正在切换对话…',async()=>{state.conversation=$('conversation').value;await refresh();status('已切换。');}));
$('new').addEventListener('click',()=>run('正在新建对话…',async()=>{const t=await call('/api/ask/new');await loadState(t.conversationId);renderTranscript(t);status('新对话已就绪：可以附图。');}));
$('sample').addEventListener('click',()=>{$('url').value=new URL('/sample.png',location.href).href;status('已填入本机示例 PNG（FIXTURE）。');});
$('upload-form').addEventListener('submit',e=>{e.preventDefault();run('正在读取并附加本机图片…',async()=>{
 const file=$('file').files[0];if(!file)throw Error('IMAGE_BYTES_REQUIRED');
 if(file.size>state.limits.maxImageBytes)throw Error('IMAGE_TOO_LARGE');
 const data=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]??'');r.onerror=()=>no(Error('IMAGE_BYTES_REQUIRED'));r.readAsDataURL(file);});
 const out=await call('/api/ask/upload',{mediaType:file.type,data});await refresh();await loadState();status(`本机图片已附加：${statusText[out.status]}。`);});});
$('link-form').addEventListener('submit',e=>{e.preventDefault();run('正在下载链接图片…',async()=>{const out=await call('/api/ask/link',{url:$('url').value});await refresh();await loadState();status(`链接图片已附加：${statusText[out.status]}。`);});});
$('ask-form').addEventListener('submit',e=>{e.preventDefault();run('已提交，模型回合进行中…',async()=>{const out=await call('/api/ask/turn',{text:$('question').value});renderTranscript(out.transcript);await loadState();status(`模型已回答（FIXTURE）。本回合模型收到 ${out.request?.images?.length??0} 张图片字节。`);});});
run('正在连接…',async()=>{await loadState(new URLSearchParams(location.search).get('conversation'));await refresh();status('已就绪：附一张图（本机或链接），再提交问题。');});
