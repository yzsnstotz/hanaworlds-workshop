const $=id=>document.getElementById(id);
const explain={IMAGE_TYPE_UNSUPPORTED:'这不是支持的图片（只收 PNG / JPEG / WebP / GIF）。',IMAGE_HTTP_FAILED:'图片下载失败（对方返回错误或要求跳转；请贴直达图片的链接）。',IMAGE_URL_REQUIRED:'请填写 HTTP/HTTPS 图片链接。',IMAGE_TOO_LARGE:'图片超过大小上限。',IMAGE_EMPTY:'图片是空的。',IMAGE_BYTES_REQUIRED:'没有读到图片字节。',QUESTION_REQUIRED:'请先写下问题。',AGENT_BUSY:'模型还在回答上一个问题。',MODEL_TURN_NO_REPLY:'模型回合结束了，但没有回答。',CONVERSATION_NOT_FOUND:'找不到这个对话。',REAL_MODEL_SIGN_IN_REQUIRED:'这个对话用的是真实模型，请先在上方「真实模型登录」登录。',MODEL_NOT_AVAILABLE:'这个模型现在不可用。',SIGN_IN_ALREADY_RUNNING:'已有一次登录在进行中。',SIGN_IN_FLOW_UNAVAILABLE:'登录流程不可用。',SIGN_IN_PROMPT_MISMATCH:'登录页的问题已变化，请看最新提示。','fetch failed':'图片下载失败（连不上该地址）。'};
let state={conversation:null,busy:false,limits:null,conversations:[],auth:null};let authTimer=null;
const show=e=>{const code=e.message;$('error').textContent=`未完成：${code}${explain[code]?` — ${explain[code]}`:''}${e.details?` ${JSON.stringify(e.details)}`:''}　页面可继续使用。`;$('error').hidden=false;};
const status=t=>{$('status').textContent=t;};
function lock(on){state.busy=on;for(const id of ['upload','link','ask','new','sample','conversation','model'])$(id).disabled=on||(id!=='new'&&id!=='sample'&&id!=='conversation'&&id!=='model'&&!state.conversation);}
async function call(path,args={}){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:state.conversation,...args})});let body;try{body=await r.json();}catch{throw Error(`HTTP ${r.status}`);}if(!r.ok||body.error){const e=Error(body.error??`HTTP ${r.status}`);e.details=body.details;throw e;}return body.result;}
async function run(label,fn){if(state.busy)return;$('error').hidden=true;lock(true);status(label);try{await fn();}catch(e){show(e);status('上一步没有完成，已保持原状态。');}finally{lock(false);}}
const statusText={QUEUED_FOR_NEXT_TURN:'已排入：下一次提问时随消息一起交给模型',ATTACHED:'已在对话中'};
function thumb(img){const fig=document.createElement('figure');fig.className='thumb';if(img.data){const i=document.createElement('img');i.src=`data:${img.mediaType};base64,${img.data}`;i.alt='附图缩略图';fig.append(i);}const c=document.createElement('figcaption');c.textContent=`${img.mediaType} · ${img.width}×${img.height} px · ${Number(img.bytes).toLocaleString()} B · ${statusText[img.status]??img.status}`;fig.append(c);return fig;}
function renderTranscript(t){
 $('conv-state').textContent=t.started?'已开始的对话':'新对话（还没有回合）';const cm=$('conv-model');cm.textContent=t.model?.kind==='REAL'?`真实模型 ${t.model.model}`:'FIXTURE 模型';cm.classList.toggle('real',t.model?.kind==='REAL');
 const chat=$('chat');chat.replaceChildren();const atts=$('attachments');atts.replaceChildren();
 const all=[...t.items,...t.queued];
 if(!all.length){const p=document.createElement('p');p.className='empty';p.textContent='附一张图，再提问。模型回答会显示在这里。';chat.append(p);}
 for(const m of all){
  const d=document.createElement('div');d.className=`msg ${m.role}${m.queued?' queued':''}`;
  const real=t.model?.kind==='REAL';if(m.role==='assistant'&&real)d.classList.add('real');const who=document.createElement('b');who.textContent=m.role==='assistant'?(real?`模型（真实 · ${t.model.model}）`:'模型（FIXTURE）'):m.queued?'你 · 排队中':'你';d.append(who);
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
 $('fixture-model').textContent=`默认模型 ${s.fixture.model}（FIXTURE）· 真实模型需先登录`;state.limits=s.limits;state.conversations=s.conversations;
 const ms=$('model'),keep=ms.value;ms.replaceChildren();for(const m of s.models){const o=document.createElement('option');o.value=m.id;o.textContent=m.label;ms.append(o);}if([...ms.options].some(o=>o.value===keep))ms.value=keep;
 renderAuth(s.auth);
 $('limits').textContent=`上限 ${Math.floor(s.limits.maxImageBytes/1024/1024)} MiB · 类型 ${s.limits.mediaTypes.join(' / ')}`;
 const sel=$('conversation');sel.replaceChildren();s.conversations.forEach((c,i)=>{const o=document.createElement('option');o.value=c.id;o.textContent=`对话 ${i+1}${c.started?'':'（新）'} · ${c.model?.kind==='REAL'?'真实':'FIXTURE'} · ${c.id.slice(4,12)}`;sel.append(o);});
 const want=select??state.conversation;state.conversation=s.conversations.some(c=>c.id===want)?want:s.initial;sel.value=state.conversation;
}
$('conversation').addEventListener('change',()=>run('正在切换对话…',async()=>{state.conversation=$('conversation').value;await refresh();status('已切换。');}));
$('new').addEventListener('click',()=>run('正在新建对话…',async()=>{const t=await call('/api/ask/new',{model:$('model').value});await loadState(t.conversationId);renderTranscript(t);status('新对话已就绪：可以附图。');}));
$('sample').addEventListener('click',()=>{$('url').value=new URL('/sample.png',location.href).href;status('已填入本机示例 PNG（FIXTURE）。');});
$('upload-form').addEventListener('submit',e=>{e.preventDefault();run('正在读取并附加本机图片…',async()=>{
 const file=$('file').files[0];if(!file)throw Error('IMAGE_BYTES_REQUIRED');
 if(file.size>state.limits.maxImageBytes)throw Error('IMAGE_TOO_LARGE');
 const data=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]??'');r.onerror=()=>no(Error('IMAGE_BYTES_REQUIRED'));r.readAsDataURL(file);});
 const out=await call('/api/ask/upload',{mediaType:file.type,data});await refresh();await loadState();status(`本机图片已附加：${statusText[out.status]}。`);});});
$('link-form').addEventListener('submit',e=>{e.preventDefault();run('正在下载链接图片…',async()=>{const out=await call('/api/ask/link',{url:$('url').value});await refresh();await loadState();status(`链接图片已附加：${statusText[out.status]}。`);});});
$('ask-form').addEventListener('submit',e=>{e.preventDefault();run('已提交，模型回合进行中…',async()=>{const out=await call('/api/ask/turn',{text:$('question').value});renderTranscript(out.transcript);await loadState();status(out.model?.kind==='REAL'?`真实模型 ${out.model.model} 已回答。`:`模型已回答（FIXTURE）。本回合模型收到 ${out.request?.images?.length??0} 张图片字节。`);});});
run('正在连接…',async()=>{await loadState(new URLSearchParams(location.search).get('conversation'));await refresh();status('已就绪：附一张图（本机或链接），再提交问题。');});

const authText={idle:'未登录',running:'登录进行中…',authorized:'已登录',cancelled:'已取消',failed:'登录失败'};
function renderAuth(a){
 if(!a)return;state.auth=a;
 $('auth-route').textContent=a.route.label;$('auth-cost').textContent=`费用：${a.route.cost}`;$('auth-storage').textContent=`存储：${a.route.storage}`;
 const st=$('auth-status');st.textContent=a.signedIn&&a.status!=='running'?'已登录':authText[a.status]??a.status;st.classList.toggle('ok',a.signedIn);
 const running=a.status==='running';
 $('auth-begin').disabled=!a.flow||running||a.signedIn;$('auth-begin').textContent=a.flow?`登录 ${a.flow.methods?.[0]?.label??a.flow.label}`:'登录不可用';
 $('auth-cancel').disabled=!running;$('auth-signout').disabled=running||!a.signedIn;
 const ul=$('auth-notices');ul.replaceChildren();for(const n of a.notices){const li=document.createElement('li');li.append(n.message);if(n.url){const link=document.createElement('a');link.href=n.url;link.target='_blank';link.rel='noopener';link.textContent=' 打开登录页';li.append(link);}if(n.code){const c=document.createElement('code');c.textContent=` ${n.code}`;li.append(c);}ul.append(li);}
 const f=$('auth-prompt-form');f.hidden=!a.prompt;if(a.prompt){f.dataset.id=a.prompt.id;$('auth-prompt-label').textContent=a.prompt.message;const sel=a.prompt.kind==='select';$('auth-select').hidden=!sel;$('auth-answer').hidden=sel;$('auth-answer').type=a.prompt.kind==='secret'?'password':'text';$('auth-answer').placeholder=a.prompt.placeholder??'';if(sel&&$('auth-select').dataset.id!==a.prompt.id){$('auth-select').dataset.id=a.prompt.id;$('auth-select').replaceChildren(...a.prompt.options.map(o=>{const x=document.createElement('option');x.value=o.id;x.textContent=o.label;return x;}));}}
 $('auth-error').hidden=!a.error;$('auth-error').textContent=a.error?`登录未完成：${a.error}`:'';
 clearTimeout(authTimer);if(running)authTimer=setTimeout(()=>fetch('/api/ask/auth').then(r=>r.json()).then(renderAuth,()=>{}),1500);
}
const authCall=async(path,args)=>{try{renderAuth(await call(path,args));}catch(e){show(e);}};
$('auth-begin').addEventListener('click',()=>authCall('/api/ask/auth/begin'));
$('auth-cancel').addEventListener('click',()=>authCall('/api/ask/auth/cancel'));
$('auth-signout').addEventListener('click',()=>authCall('/api/ask/auth/signout'));
$('auth-prompt-form').addEventListener('submit',e=>{e.preventDefault();const sel=!$('auth-select').hidden;authCall('/api/ask/auth/answer',{promptId:$('auth-prompt-form').dataset.id,text:sel?$('auth-select').value:$('auth-answer').value});$('auth-answer').value='';});
