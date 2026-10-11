const $=id=>document.getElementById(id),nonce=document.querySelector('meta[name="supply-nonce"]').content;
async function request(path,input){
 const options=input===undefined?{}:{method:'POST',headers:{'content-type':'application/json','x-supply-nonce':nonce},body:JSON.stringify(input)};
 const response=await fetch(path,options),data=await response.json();
 if(!response.ok)throw Object.assign(Error(data.error?.code??'读取失败'),{committedInputId:data.error?.committedInputId,createdSessionRef:data.error?.createdSessionRef});return data;
}
function display(data){
 const prior=$('sessions').value;$('sessions').replaceChildren();
 for(const session of data.sessions){const option=document.createElement('option');option.value=session.identity.sessionRef;option.textContent=session.label;$('sessions').append(option);}
 if(!data.sessions.length){const option=document.createElement('option');option.value='';option.textContent='尚无对话';$('sessions').append(option);}
 if(data.sessions.some(session=>session.identity.sessionRef===prior))$('sessions').value=prior;
 if(data.creationAttempted)$('create').dataset.consumed='true';
 $('create').disabled=$('create').dataset.consumed==='true';
 $('state').textContent=`已读回 ${data.sessions.length} 条官方对话；已提交输入 ${data.inputCommits} 条。确认 brief、请求保留和世界连接尚未完成。`;
}
async function act(button,operation){button.disabled=true;$('notice').textContent='';try{await operation();}catch(error){
 if(error.committedInputId){button.dataset.consumed='true';$('receipt').textContent=`Core 已接收输入 ${error.committedInputId}；持久化或后续检查未确认。`;$('notice').textContent='提交已锁定，请保留此身份并检查读回，勿重复提交。';}
 else if(error.createdSessionRef){$('notice').textContent=`官方会话 ${error.createdSessionRef} 已创建；后续检查失败：${error.message}。请刷新读回，勿再次创建。`;}
 else $('notice').textContent=error.message==='CONVERSATION_NOT_STARTED_MODEL_PATH_UNPROVEN'?'对话尚未开始：首次模型请求的零新增现金路径未核实，本次没有提交消息或确认。':error.message;
 }finally{button.disabled=button.dataset.consumed==='true';}}
$('create').onclick=()=>act($('create'),async()=>{$('create').dataset.consumed='true';display(await request('/api/supply/sessions',{}));});
$('refresh').onclick=()=>act($('refresh'),async()=>display(await request('/api/supply/status')));
$('input').onsubmit=event=>{event.preventDefault();act(event.submitter,async()=>{
 const data=await request('/api/supply/input',{sessionRef:$('sessions').value,text:$('text').value});
 // Retain the accepted receipt even if the following status read fails.
 event.submitter.dataset.consumed='true';
 $('receipt').textContent=`输入 ${data.sourceMessageId} 已存入官方对话；不代表已确认 brief。`;
 display(await request('/api/supply/status'));
 });};
request('/api/supply/status').then(display).catch(error=>$('notice').textContent=error.message);
