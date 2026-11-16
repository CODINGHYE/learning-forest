(function(){
  'use strict';
  const DEFAULT_MODEL='gpt-4o-mini';
  const localOrigin=location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)?location.origin:'http://127.0.0.1:4173';
  function unavailable(){
    const error=Error(location.protocol==='file:'?'HTML 파일을 직접 열면 PDF 분석과 OpenAI 연결을 사용할 수 없어요. 로컬 앱 열기를 눌러주세요.':`학습 앱의 로컬 서버와 연결하지 못했어요. 서버가 실행 중인지 확인한 뒤 ‘서버 연결 다시 확인’을 눌러주세요. 앱 주소: ${localOrigin}`);
    error.serverUnavailable=true;
    window.dispatchEvent(new CustomEvent('forest:transport-error'));
    return error;
  }
  async function request(path,options={}){
    if(location.protocol!=='http:'||!['127.0.0.1','localhost'].includes(location.hostname))throw unavailable();
    let response;
    try{response=await fetch(path,{...options,credentials:'same-origin'});}
    catch(error){if(error.name==='AbortError')throw error;throw unavailable();}
    let result;
    try{
      if(!(response.headers.get('content-type')||'').includes('application/json'))throw Error();
      result=await response.json();
      if(!result||typeof result!=='object'||Array.isArray(result))throw Error();
    }catch(error){if(error.name==='AbortError')throw error;throw unavailable();}
    if(!response.ok){const error=Error(result.error||'요청을 마치지 못했어요. 잠시 후 다시 시도해주세요.');error.code=result.code;throw error;}
    return result;
  }
  window.ForestAPI={DEFAULT_MODEL,localOrigin,request};
})();
