(function(){
  'use strict';
  const $=id=>document.getElementById(id),dialog=$('openai-dialog');
  let status={serverOpenaiAvailable:false,defaultModel:ForestAPI.DEFAULT_MODEL,connection:{connected:false}},busy=false,revision=0,expiryTimer=null,blockedPersonal=false,pendingName='';
  const emit=(type)=>window.dispatchEvent(new CustomEvent(type));
  function message(text,error=false){const node=$('openai-connect-message');node.hidden=!text;node.textContent=text;node.classList.toggle('error',error);}
  function serverHelp(show){document.querySelectorAll('[data-server-help]').forEach(node=>node.hidden=!show);document.querySelectorAll('[data-server-home]').forEach(node=>node.href=ForestAPI.localOrigin+'/');}
  function update(){
    const connected=status.connection.connected,server=status.serverOpenaiAvailable&&!blockedPersonal;
    $('openai-connection-status').textContent=connected?`내 키 연결됨 · ${status.connection.model} · 최대 1시간 동안 사용해요.`:server?'서버의 기본 OpenAI 연결을 사용할 수 있어요. 내 키로 바꿀 수도 있어요.':'개인 API 키를 연결해서 PDF 전체 개념지도를 만들어요.';
    $('home-openai-status').textContent=$('openai-connection-status').textContent;$('home-openai-settings').textContent=connected?'✦ 내 OpenAI 연결 관리':'✦ 내 OpenAI 연결';
    $('openai-settings').textContent=connected?'내 OpenAI 연결 관리':'내 OpenAI 연결';document.querySelector('.connection-bar').classList.toggle('is-connected',connected);
    $('openai-disconnect').hidden=!connected;$('openai-current').hidden=!connected;
    $('openai-current').textContent=connected?`현재 연결: 내 API 키 · ${status.connection.model}. 키를 바꾸려면 새 키를 입력해주세요.`:'';
    clearTimeout(expiryTimer);if(connected)expiryTimer=setTimeout(()=>refresh(),Math.max(1000,status.connection.expiresIn*1000));
  }
  async function refresh(){
    const current=++revision;
    try{const result=await ForestAPI.request('/api/status',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(current!==revision)return;if(status.connection.connected&&!result.connection?.connected){blockedPersonal=true;emit('forest:connection-expired');}status={...result,connection:result.connection||{connected:false}};serverHelp(false);update();if(dialog.open)message('로컬 서버에 연결됐어요. API 키를 입력해 연결할 수 있어요.');}
    catch(error){if(current===revision){$('openai-connection-status').textContent=error.name==='TimeoutError'?'로컬 서버의 응답이 늦어지고 있어요. 서버 연결을 다시 확인해주세요.':error.message;$('home-openai-status').textContent=$('openai-connection-status').textContent;serverHelp(true);if(dialog.open)message($('openai-connection-status').textContent,true);}}
  }
  function setBusy(value){busy=value;['openai-key','openai-model','openai-close','openai-key-visibility','openai-connect-submit','openai-disconnect'].forEach(id=>$(id).disabled=value);$('openai-connect-submit').textContent=value?'연결 확인 중…':pendingName?'연결하고 선택한 PDF 분석':'연결하고 OpenAI 분석 선택';}
  function open(pdfName=''){
    pendingName=pdfName;
    $('openai-key').value='';$('openai-key').type='password';$('openai-key-visibility').setAttribute('aria-pressed','false');$('openai-key-visibility').textContent='키 보기';$('openai-model').value=status.connection.model||ForestAPI.DEFAULT_MODEL;
    message(pdfName?`선택한 PDF: ${pdfName}. 아직 전송하지 않았어요. 연결하면 이 PDF의 개념지도 분석을 시작합니다.`:'');
    $('openai-connect-submit').textContent=pdfName?'연결하고 선택한 PDF 분석':'연결하고 OpenAI 분석 선택';dialog.showModal();
  }
  $('openai-settings').addEventListener('click',()=>open());
  $('home-openai-settings').addEventListener('click',()=>open());
  $('openai-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{$('openai-key').value='';$('openai-key').type='password';if(!status.connection.connected)emit('forest:connect-cancelled');});
  $('openai-key-visibility').addEventListener('click',()=>{const show=$('openai-key').type==='password';$('openai-key').type=show?'text':'password';$('openai-key-visibility').textContent=show?'키 숨기기':'키 보기';$('openai-key-visibility').setAttribute('aria-pressed',String(show));});
  $('openai-connect-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;++revision;setBusy(true);message('내 키로 선택한 모델에 접근할 수 있는지 확인하고 있어요.');
    const body=JSON.stringify({apiKey:$('openai-key').value.trim(),model:$('openai-model').value.trim()});$('openai-key').value='';
    try{const result=await ForestAPI.request('/api/openai/connect',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(25000)});status.connection=result;status.available=true;blockedPersonal=false;serverHelp(false);update();dialog.close();emit('forest:connected');}
    catch(error){message(error.message||'로컬 서버에 연결하지 못했습니다.',true);}
    finally{setBusy(false);}
  });
  $('openai-disconnect').addEventListener('click',async()=>{
    if(busy)return;++revision;setBusy(true);
    try{await ForestAPI.request('/api/openai/disconnect',{method:'POST',signal:AbortSignal.timeout(8000)});status.connection={connected:false};blockedPersonal=true;serverHelp(false);update();dialog.close();emit('forest:disconnected');}
    catch(error){message(error.message,true);}
    finally{setBusy(false);}
  });
  window.ForestConnection={open,refresh,canAnalyze:()=>status.connection.connected||status.serverOpenaiAvailable&&!blockedPersonal,source:()=>status.connection.connected?'personal':'server'};
  document.querySelectorAll('[data-server-retry]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await refresh();}finally{button.disabled=false;}}));
  window.addEventListener('forest:transport-error',()=>serverHelp(true));
  window.addEventListener('focus',()=>{if(!busy)refresh();});
  ForestConnection.ready=refresh();
})();
