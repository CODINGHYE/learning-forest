(function(){
  'use strict';
  const M=ForestMath,C=ForestColors,demoContent=ForestContent;
  let content=demoContent;
  const $=id=>document.getElementById(id);
  const el=(tag,cls='',text='')=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const fmt=x=>Number.isFinite(x)?(Math.abs(x)>=100000?x.toExponential(2):Number(x.toFixed(4)).toLocaleString('en-US',{maximumFractionDigits:4})):String(x);
  let questions=new Map(content.questions.map(q=>[q.id,q]));
  const hints={
    'Q1.1':'새 예시의 정답은 그대로 두고, 지금 사용하는 판단 규칙이 충분한지 살펴봅니다. 명확한 규칙을 직접 적는 방법도 여전히 유용합니다.',
    'Q1.2':'예시의 위치와 정답은 그대로였습니다. 바뀐 것은 각 입력을 얼마나 반영할지 정하는 가중치와 기준을 옮기는 편향입니다.',
    'Q1.3':'한 번 우연히 맞는 것과 여러 새로운 예시에도 잘 맞는 것은 다릅니다. 학습에 쓰지 않은 예시로도 확인해야 합니다.',
    'Q2.1':'XOR에서는 선 하나라는 표현 방식에 한계가 있습니다. 같은 선을 오래 조정하는 것과 계산 방식을 바꾸는 것은 다른 접근입니다.',
    'Q2.2':'새로운 입력을 추가한 것이 아닙니다. 같은 입력을 정해진 함수로 계산해 중간 값으로 표현했습니다.',
    'Q2.3':'층 수는 같았습니다. 음수를 0으로 바꾸는 비선형 계산을 넣었기 때문에 결과가 달라졌습니다.',
    'Q3.1':'두 예측은 정답에서 똑같이 4만큼 떨어져 있습니다. 제곱오차도 둘 다 16입니다.',
    'Q3.2':'미분은 현재 위치 근처의 변화에 대한 정보입니다. 멀리 움직인 뒤에는 방향을 다시 확인해야 합니다.',
    'Q3.3':'아직 u와 v는 1입니다. 역전파에서는 기울기를 구했고, 실제 값을 바꾸는 것은 다음 갱신 단계입니다.',
    'Q3.4':'같은 시작점에서 걸음 크기를 줄여 비교해보세요. 너무 큰 학습률은 이 예제에서 손실을 더 크게 만듭니다.',
    'Q4.1':'배치와 표의 모양이 바뀌어도 0부터 11까지의 숫자는 그대로입니다. 행렬곱을 수행할 때는 새로운 출력이 계산됩니다.',
    'Q4.2':'마지막 결과뿐 아니라 어떤 연산들이 연결되었는지가 필요합니다. 도구는 이 연결과 연산별 미분 규칙을 이용합니다.',
    'Q4.3':'backward()는 기울기를 만듭니다. 실제 파라미터를 바꾸는 optimizer.step()과는 별도 단계입니다.'
  };
  const stage=new ForestStage($('scene'));
  const expandedGroups=new Set();
  let selected='Q1.1',group=content.groups[0],q=questions.get(selected),state={},timer=null,pdfUrl=null,pdfName='',analysisRequest=null;
  function sceneId(){return q?(q.sceneId||(!q.kind?q.id:null)):group.preview;}
  function review(){return q?(q.review?.instruction?q.review:(demoContent.questions.find(item=>item.id===sceneId())?.review||{})):{};}
  const maxSteps=()=>!q?1:({'Q1.1':1,'Q1.2':1,'Q1.3':2,'Q2.1':1,'Q2.2':2,'Q2.3':1,'Q3.1':2,'Q3.2':5,'Q3.3':4,'Q3.4':8,'Q4.1':2,'Q4.2':5,'Q4.3':4}[sceneId()]);
  function initialState(){return {n:0,u:1,v:1,pred:4,axis:'u',lr:.025,path:[M.values()],gate:'XOR',angle:45,threshold:1,w1:0,w2:0,b:0,cell:0,manual:false};}
  function stop(){if(timer){clearInterval(timer);timer=null;}const play=$('play-button');play.textContent='전체 단계 자동 재생';play.disabled=!!q&&state.n>=maxSteps();}
  function go(id,push=true){
    stop();selected=id==='OVERVIEW'||questions.has(id)||content.groups.some(g=>g.id===id)?id:'OVERVIEW';q=questions.get(selected)||null;group=selected==='OVERVIEW'?{id:'OVERVIEW',short:'전체 개념지도',title:content.document?content.document.name:'딥러닝 기초 · 전체 개념지도',intro:'큰 흐름에서 궁금한 개념을 선택하세요.',preview:null}:content.groups.find(g=>g.id===(q?q.group:selected));state=initialState();stage.resetCamera();
    if(push)history.pushState(null,'','#'+selected);
    renderNavigation();renderLesson();
    if(push&&q&&matchMedia('(max-width:680px)').matches)$('lesson').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});
  }
  function navLink(id,cls,text){const a=el('a',cls,text);a.href='#'+id;a.addEventListener('click',e=>{e.preventDefault();go(id);});return a;}
  function renderNavigation(){
    const nav=$('question-map');nav.replaceChildren();let mobileQuestions=null;
    content.groups.forEach((g,i)=>{
      const wrapper=el('div','group'),a=navLink(g.id,'group-link','');a.setAttribute('aria-current',String(group.id===g.id));a.append(el('span','group-number',String(i+1)),el('span','',g.title));wrapper.append(a);nav.append(wrapper);
      if(group.id===g.id){const list=el('ol','small-questions'),all=content.questions.filter(item=>item.group===g.id);let visible=all;if(all.length>5&&!expandedGroups.has(g.id)){visible=all.slice(0,4);if(q&&q.group===g.id&&!visible.includes(q))visible.push(q);}visible.forEach(item=>{const li=el('li'),link=navLink(item.id,'question-link','');if(item.id===selected)link.setAttribute('aria-current','page');if(item.concept)link.append(el('span','concept-name',item.concept));else link.append(el('span','qid',item.id.replace('Q','')));link.append(el('span','',item.title));li.append(link);list.append(li);});if(visible.length<all.length){const li=el('li');li.append(button(`이 묶음의 개념 ${all.length}개 모두 보기`,()=>{expandedGroups.add(g.id);renderNavigation();},'button map-expand'));list.append(li);}if(matchMedia('(max-width:680px)').matches)mobileQuestions=list;else wrapper.append(list);}
    });
    if(mobileQuestions)nav.append(mobileQuestions);
  }
  function renderLesson(){
    $('breadcrumb').textContent=`${content.document?'업로드한 PDF':'예시 지도'} / ${group.short}${q?' / '+(q.concept||q.id.replace('Q','')):''}`;
    $('question-title').textContent=q?q.title:group.title;
    const r=review(),hasScene=!!sceneId(),isOverview=group.id==='OVERVIEW'||!!content.document&&!q;
    $('takeaway').textContent=q?(q.kind==='pdf'?q.explain:r.takeaway||q.goal):group.intro;
    $('prediction').textContent=q?(q.kind==='pdf'?q.predict:r.predict||q.predict):group.intro;document.querySelector('.prediction-box').hidden=!q;
    $('easy-explanation').replaceChildren();
    const paragraphs=q?(q.kind==='pdf'?[q.explain]:(r.explain||[q.explain])):[group.intro];
    paragraphs.forEach(text=>$('easy-explanation').append(el('p','',text)));
    $('experiment-heading').hidden=!hasScene||isOverview;document.querySelector('.experiment').hidden=!hasScene||isOverview;$('results-section').hidden=!hasScene||isOverview;
    $('experiment-instruction').textContent=(q?.kind==='pdf'?'이해를 돕는 별도 예제입니다. 교재의 수치와 다를 수 있어요. ':'')+(r.instruction||'버튼을 눌러 달라지는 부분을 확인하세요.');
    $('scene-legend').textContent=r.legend||'점을 선택하거나 시점을 돌려 계산의 관계를 살펴보세요.';
    $('concept-reading').hidden=!q||hasScene;
    $('check-section').hidden=!q;$('check-question').textContent=q?q.check:'';$('check-hint').textContent=q?(hints[sceneId()]||'원문에서 확인한 내용과 비교해, 이 개념이 하는 일과 연결되는 개념을 설명해보세요.'):'';$('check-section').querySelector('details').open=false;
    document.querySelector('.explanation').hidden=isOverview;document.querySelector('.connections').hidden=isOverview;$('source-details').hidden=isOverview;
    renderOverview(isOverview);
    setupControls();renderExtra();renderLinks();renderSource();refresh();
  }
  function renderOverview(show){
    const box=$('concept-overview');box.hidden=!show;box.replaceChildren();if(!show)return;
    box.append(el('p','overview-summary',content.document?`${content.document.pageCount}쪽에서 ${content.questions.length}개 개념을 찾았습니다. 개념 이름을 누르면 쉬운 설명, 관련 질문, 실제 PDF 근거를 볼 수 있습니다.`:'네 가지 큰 질문에 연결된 13개 질문입니다. 궁금한 질문부터 선택할 수 있습니다.'));
    const grid=el('div','concept-overview-grid');const groups=group.id==='OVERVIEW'?content.groups:content.groups.filter(g=>g.id===group.id);
    groups.forEach(g=>{const card=el('section','overview-group'),all=content.questions.filter(item=>item.group===g.id),visible=group.id==='OVERVIEW'?all.slice(0,3):all;card.append(el('h3','',`${g.title} · ${all.length}개`));visible.forEach(item=>{const a=navLink(item.id,'overview-concept',item.concept||item.title);if(item.concept)a.append(el('small','',item.title));if(item.page)a.append(el('small','',`PDF ${item.page}쪽부터 확인`));card.append(a);});if(visible.length<all.length)card.append(navLink(g.id,'overview-more',`이 묶음의 ${all.length}개 개념 모두 보기 →`));grid.append(card);});box.append(grid);
    if(content.edges?.length)box.append(el('p','overview-summary','개념을 열면 관련 개념과 이어지는 이유도 확인할 수 있어요. 연결은 발명 순서가 아닌, 학습을 돕는 관계입니다.'));
  }
  function button(text,fn,cls='button'){const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;}
  function rangeControl(label,key,min,max,step,change){
    const wrap=el('div','control'),lab=el('label'),name=el('span','',label),value=el('span','value',fmt(state[key]));value.dataset.value=key;
    const input=el('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=state[key];input.id='control-'+key;input.dataset.control=key;lab.htmlFor=input.id;lab.append(name,value);wrap.append(lab,input);
    input.addEventListener('input',()=>{state[key]=Number(input.value);if(change)change();refresh();});return wrap;
  }
  function choiceControl(label,key,choices,change){const wrap=el('div','control'),text=el('span','',label),row=el('div','choice-row');choices.forEach(([value,title])=>{const b=button(title,()=>{state[key]=value;if(change)change();refresh();},'');b.dataset.choiceKey=key;b.dataset.choiceValue=String(value);b.setAttribute('aria-pressed',String(state[key]===value));row.append(b);});wrap.append(text,row);return wrap;}
  function selectControl(label,key,choices,change){const wrap=el('div','control'),lab=el('label','',label),select=el('select');select.id='control-'+key;select.dataset.control=key;lab.htmlFor=select.id;choices.forEach(([value,title])=>{const o=el('option','',title);o.value=value;select.append(o);});select.value=state[key];select.addEventListener('change',()=>{state[key]=typeof choices[0][0]==='number'?Number(select.value):select.value;if(change)change();refresh();});wrap.append(lab,select);return wrap;}
  function setupControls(){
    const box=$('experiment-controls');box.replaceChildren();if(!q||!sceneId())return;
    if(sceneId()==='Q1.2'){box.append(rangeControl('크기 반영 · w1','w1',-1,1,.025,()=>state.manual=true),rangeControl('색 반영 · w2','w2',-1,1,.025,()=>state.manual=true),rangeControl('기준 옮기기 · b','b',-1,1,.025,()=>state.manual=true));}
    if(sceneId()==='Q2.1'){
      box.append(selectControl('정답 규칙','gate',[['XOR','XOR · 서로 다를 때 1'],['AND','AND · 둘 다 1일 때 1'],['OR','OR · 하나라도 1일 때 1']],()=>{state.angle=45;state.threshold=state.gate==='AND'?1.5:state.gate==='OR'?.5:1;state.n=0;}),rangeControl('선의 방향 · 도','angle',-180,180,1),rangeControl('나누는 기준','threshold',-2,2,.05));
    }
    if(sceneId()==='Q3.1')box.append(rangeControl('예측값 · 정답은 8','pred',0,16,.1));
    if(sceneId()==='Q3.2')box.append(choiceControl('조금 바꿔볼 숫자','axis',[['u','u'],['v','v']],()=>{state.n=0;state.u=1;state.v=1;}));
    if(sceneId()==='Q3.4')box.append(selectControl('한 걸음의 크기 · 학습률','lr',[[.005,'0.005 · 작은 걸음'],[.025,'0.025 · 중간 걸음'],[.15,'0.15 · 큰 걸음']],()=>{stop();state.n=0;state.u=1;state.v=1;state.path=[M.values()];}));
    if(sceneId()==='Q4.1')box.append(selectControl('따라가 볼 숫자','cell',Array.from({length:12},(_,i)=>[i,`${i} · 예시 ${Math.floor(i/6)+1}, 행 ${Math.floor(i%6/3)+1}, 열 ${i%3+1}`])));
  }
  function syncControls(){document.querySelectorAll('[data-control]').forEach(input=>{input.value=state[input.dataset.control];});document.querySelectorAll('[data-value]').forEach(span=>span.textContent=fmt(state[span.dataset.value]));document.querySelectorAll('[data-choice-key]').forEach(b=>b.setAttribute('aria-pressed',String(String(state[b.dataset.choiceKey])===b.dataset.choiceValue)));}
  function renderExtra(){
    const extra=$('extra-content');extra.replaceChildren();if(!q)return;
    const definitions=review().terms||(!q.kind?[[q.terms,q.explain]]:[]);if(definitions.length){const terms=el('details','terms-details');terms.append(el('summary','','전문용어 풀이 · 실험에서 쓴 이름 이해하기'));const list=el('dl','term-list');definitions.forEach(([name,meaning])=>list.append(el('dt','',name),el('dd','',meaning)));terms.append(list);extra.append(terms);}
    if(sceneId()){const math=el('details','math-details');math.append(el('summary','','계산 확인 · 사용한 숫자와 수식 펼치기'));const pre=el('pre');pre.id='calculation-data';math.append(pre);if(q.caution)math.append(el('p','',q.caution));extra.append(math);}
  }
  function renderLinks(){const links=$('next-questions');links.replaceChildren();$('connection-reason').textContent=q?(review().bridge||'다른 개념과 어떤 관계가 있는지 확인해보세요.'):'';if(q&&content.edges){const relations=content.edges.filter(e=>e.from===q.id||e.to===q.id);relations.forEach(edge=>{const other=questions.get(edge.from===q.id?edge.to:edge.from);if(!other)return;const row=el('div','relation-item');row.append(el('span','relation-type',edge.type),navLink(other.id,'',other.concept||other.title),el('div','',edge.reason));links.append(row);});if(!relations.length)links.append(el('p','source-note','이 개념의 연결은 원문에서 더 확인할 수 있어요. 전체 지도로 돌아가 다른 개념을 선택해보세요.'));return;}let ids=q?q.next:content.questions.filter(item=>item.group===group.id).map(item=>item.id);if(!ids.length)ids=['Q1.2'];ids.forEach(id=>{const item=questions.get(id);if(item)links.append(navLink(id,'next-link',item.title));});}
  function renderSource(){
    const source=$('source-content');source.replaceChildren();
    if(q){source.append(el('p','',q.source));if(pdfUrl&&q.page){const a=el('a','',`원문 PDF ${q.page}쪽 열기`);a.href=pdfUrl+'#page='+q.page;a.target='_blank';a.rel='noopener';source.append(a);}else source.append(el('p','source-note','PDF를 선택하면 실제 문서에서 새 지도가 생성되고, 근거 페이지를 열 수 있습니다.'));}
    else source.append(el('p','','교재의 개념을 연결한 학습 지도입니다. 개별 질문을 선택하면 관련 페이지와 실습 위치를 확인할 수 있어요.'));
    if(q?.evidence){q.evidence.forEach(e=>{const item=el('div','evidence-item');item.append(el('strong','',`PDF ${e.page}쪽 · 원문에서 확인`),el('blockquote','',e.excerpt));if(pdfUrl){const a=el('a','',`${e.page}쪽 원문 열기`);a.href=pdfUrl+'#page='+e.page;a.target='_blank';a.rel='noopener';item.append(a);}source.append(item);});source.append(el('p','source-note',q.supplement?'쉬운 설명과 학습용 연결은 검토된 보충 설명입니다. 위 인용은 업로드한 PDF에서 추출한 원문입니다.':'설명과 함께 원문 근거를 확인하세요. 로컬 구조 분석의 제목 묶음은 역사적 인과를 뜻하지 않습니다.'));$('source-details').open=true;}
    else source.append(el('p','source-note','학습 장면은 이 서비스를 위해 구성한 가상 예제입니다. 원본 교재와 노트북 파일은 배포하지 않습니다.'));
    const a=el('a','','기술 확인 자료 · '+(group.id==='G4'?'PyTorch 공식 문서':'Google 머신러닝 학습 자료'));a.href=group.id==='G4'?'https://docs.pytorch.org/tutorials/beginner/basics/autogradqs_tutorial.html':'https://developers.google.com/machine-learning/crash-course/neural-networks/activation-functions';a.target='_blank';a.rel='noopener';source.append(a);
  }
  function lineBoundary(w1,w2,t,y=0,color=C.gold){
    const points=[];const add=(x,z)=>{if(x>=-.00001&&x<=1.00001&&z>=-.00001&&z<=1.00001&&!points.some(p=>Math.hypot(p[0]-x,p[1]-z)<1e-6))points.push([x,z]);};
    if(Math.abs(w2)>1e-9){add(0,t/w2);add(1,(t-w1)/w2);}if(Math.abs(w1)>1e-9){add(t/w1,0);add((t-w2)/w1,1);}
    if(points.length>=2){const p=points.map(([x,z])=>[x*4-2,y+.025,z*4-2]);stage.line(p[0],p[1],color,2.5);stage.poly([p[0],p[1],[p[1][0],y+1.1,p[1][2]],[p[0][0],y+1.1,p[0][2]]],'#b4530915');}
  }
  function fruitScene(id){
    stage.clear([0,.4,0],7.5);stage.grid({labels:['크기 →','색 측정값 →']});let params={w1:1,w2:0,b:-.5},data=M.fruit;
    if(id==='Q1.1')data=M.fruit.slice(0,state.n?6:4);
    if(id==='Q1.2')params={w1:state.w1,w2:state.w2,b:state.b-.5*(state.w1+state.w2)};
    if(id==='Q1.3')params=[{w1:1,w2:0,b:-.5},{w1:-1,w2:.5,b:.1},{w1:.2,w2:.6,b:-.4}][state.n%3];
    let wrong=0;
    data.forEach(([x,z,label],i)=>{const score=params.w1*x+params.w2*z+params.b,pred=Number(score>=-1e-10),bad=pred!==label;if(bad)wrong++;stage.point([x*4-2,.06,z*4-2],{color:label?C.gold:C.green,shape:label?'triangle':'circle',label:`${i>=4?'새 ':''}${String.fromCharCode(65+i)} · ${label}${bad?' · 틀림':''}`,radius:8,offset:[i%2?16:-9,-20]});});
    if(Math.abs(params.w1)+Math.abs(params.w2)>1e-10)lineBoundary(params.w1,params.w2,-params.b);
    else stage.label([0,.8,0],'모든 예측 확률 = 0.5',{plate:true});
    stage.label([1.5,.05,2.2],'○ 종류 0     △ 종류 1',{offset:[0,35],color:C.muted,size:11});
    return {space:'입력 공간 · 가상의 2D 자료',caption:id==='Q1.1'?(state.n?'새 예시에서는 기존의 크기 규칙이 맞지 않습니다.':'크기가 0.5 이상이면 종류 1이라는 규칙입니다.'):id==='Q1.2'?(state.manual?'손잡이를 직접 조절한 설정입니다. 데이터와 정답은 그대로입니다.':state.n?'시작값 0에서 실제로 한 번 계산한 학습 결과입니다.':'아직 학습 전입니다. 손잡이 값이 모두 0이라 예측이 같습니다.'):'정답과 데이터는 고정하고 시작 설정만 바꿉니다.',stats:[['맞힌 예시',`${data.length-wrong} / ${data.length}`],['w1',fmt(params.w1)],['w2',fmt(params.w2)],['기준 b',fmt(params.b)]],calc:`입력과 정답: ${JSON.stringify(data)}\n원래 좌표의 점수 = ${fmt(params.w1)} × 크기 + ${fmt(params.w2)} × 색 + ${fmt(params.b)}\n점수 >= 0이면 종류 1\n${id==='Q1.2'?'확률 = sigmoid(점수)\n학습은 앞의 네 예시만 사용했습니다. 확인 예시 두 개는 갱신에 쓰지 않았습니다.':''}`};
  }
  function gateScene(){
    stage.clear([0,.4,0],7.5);stage.grid({labels:['입력 x1 →','입력 x2 →']});
    const a=state.angle*Math.PI/180,w1=Math.cos(a)*Math.SQRT2,w2=Math.sin(a)*Math.SQRT2;let correct=0;
    const labels=M.inputs.map(([x,z])=>state.gate==='AND'?Number(x&&z):state.gate==='OR'?Number(x||z):Number(x!==z));
    M.inputs.forEach(([x,z],i)=>{const pred=Number(w1*x+w2*z-state.threshold>=-1e-9),good=pred===labels[i];if(good)correct++;stage.point([4*x-2,.04,4*z-2],{color:labels[i]?C.gold:C.green,shape:labels[i]?'triangle':'circle',label:`${String.fromCharCode(65+i)} (${x},${z})${good?'':' · 틀림'}`,offset:[0,-22],radius:9});});
    lineBoundary(w1,w2,state.threshold);
    if(state.n&&state.gate==='XOR'){stage.line([-2,.09,-2],[2,.09,2],C.green,2,true);stage.line([-2,.09,2],[2,.09,-2],C.gold,2,true);stage.label([0,.4,0],'같은 종류를 이은 대각선이 교차',{plate:true});}
    return {space:'입력 공간 · 2D 논리 문제',caption:state.gate==='XOR'?'XOR: 서로 다른 입력일 때 정답이 1입니다. 카메라를 돌려도 분류 결과는 바뀌지 않습니다.':`${state.gate}: 방향과 기준을 바꾸며 네 점을 나눠보세요.`,stats:[['정답 규칙',state.gate],['맞힌 예시',`${correct} / 4`]],calc:`점수 = ${fmt(w1)} × x1 + ${fmt(w2)} × x2 - ${fmt(state.threshold)}\n점수 >= 0이면 1\n현재 네 예측의 정답: ${JSON.stringify(labels)}\nXOR 배치에서는 어떤 직선도 네 점을 모두 나눌 수 없습니다.`};
  }
  function layersScene(id){
    const nonlinear=id==='Q2.2'||state.n>0,depth=id==='Q2.2'?state.n:2;
    stage.clear([0,1.5,0],10);
    const records=M.inputs.map(([x,z],i)=>({x,z,i,...M.xor(x,z,nonlinear)}));
    stage.grid({size:1.5,steps:4,y:0,labels:['','']});stage.label([-2.1,0,0],'① 입력 (x1,x2)',{plate:true,offset:[-15,0]});
    if(depth>=1){stage.grid({size:1.5,steps:4,y:1.7,labels:['','']});stage.label([-2.1,1.7,0],'② 중간 (h1,h2)',{plate:true,offset:[-15,0]});}
    if(depth>=2){stage.grid({size:1.5,steps:4,y:3.4,labels:['','']});stage.label([-2.1,3.4,0],'③ 출력 (h1+h2)',{plate:true,offset:[-15,0]});}
    const positions=(r,step)=>step===0?[(r.x-.5)*2.3,.06,(r.z-.5)*2.3]:step===1?[r.h1*1.15,1.76,r.h2*1.15]:[r.out*1.15,3.46,0];
    for(let s=0;s<=depth;s++){
      const grouped=new Map();records.forEach(r=>{const p=positions(r,s),k=p.join(',');if(!grouped.has(k))grouped.set(k,{p,records:[]});grouped.get(k).records.push(r);if(s>0)stage.line(positions(r,s-1),p,'#93a5be99',1,true);});
      grouped.forEach(({p,records:rs})=>{const r=rs[0],label=(s===0||s===depth)?rs.map(t=>String.fromCharCode(65+t.i)).join('·')+(s===2?' = '+fmt(r.out):''):'';stage.point(p,{color:r.x!==r.z?C.gold:C.green,shape:r.x!==r.z?'triangle':'circle',label,radius:7,offset:[0,-18]});});
    }
    stage.label([2.4,1.5,0],'↑ 계산 단계',{color:C.muted,size:11});
    return {space:'중간 표현 공간 · 깊이는 계산 단계',caption:id==='Q2.2'?['같은 입력 네 개에서 시작합니다.','원본을 두 가지 차이의 계산 결과로 표현했습니다.','중간 값 두 개를 합치면 XOR 정답과 같습니다.'][state.n]:nonlinear?'음수를 0으로 바꾸니 두 입력이 서로 다른 경우를 구분할 수 있습니다.':'음수 처리를 끄면, 이 구성에서 반대되는 두 값의 합은 모두 0입니다.',stats:[['음수 처리',nonlinear?'켜짐 · ReLU':'꺼짐'],['보이는 단계',`${depth+1} / 3`]],calc:records.map(r=>`${String.fromCharCode(65+r.i)} (${r.x},${r.z}) → (${fmt(r.h1)},${fmt(r.h2)}) → ${fmt(r.out)}`).join('\n')+'\n\n중간 함수: h1=ReLU(x1-x2), h2=ReLU(x2-x1)\n출력=h1+h2. 가중치를 학습한 장면이 아닌, 정해진 계산을 따라가는 장면입니다.'};
  }
  function lossScene(){
    stage.clear([0,.7,0],8);stage.grid({labels:['예측값 →',''],size:2.7,steps:8});
    const world=p=>[(p-8)*.32,(p-8)**2/26,0];
    for(let p=0;p<16;p+=.25)stage.line(world(p),world(p+.25),'#7896c0',1.5);
    const p=state.pred,l=(p-8)**2,current=world(p);
    stage.line([current[0],0,0],current,C.gold,4);stage.point(current,{color:C.gold,label:`예측 ${fmt(p)} · 손실 ${fmt(l)}`,offset:[0,-24],radius:8});stage.point([0,.02,0],{color:C.green,label:'정답 8 · 손실 0',offset:[0,23],radius:7});
    stage.label([-2.8,2,0],'높이 = 제곱오차',{size:11,color:C.muted});
    return {space:'숫자 예제 · 정답은 8',caption:'정답의 왼쪽과 오른쪽 모두, 멀어질수록 제곱오차가 커집니다.',stats:[['예측',fmt(p)],['정답','8'],['차이',fmt(p-8)],['제곱오차',fmt(l)]],calc:`차이 = 예측 - 정답 = ${fmt(p)} - 8 = ${fmt(p-8)}\n손실 = (예측 - 정답)² = ${fmt(l)}\n예측 4와 12는 손실이 모두 16입니다.\n여러 예시의 제곱오차를 평균하면 MSE입니다.`};
  }
  function landscapeScene(id){
    const path=id==='Q3.4'?state.path:[M.values(),M.values(state.u,state.v)];
    let umin=-.1,umax=2.8,vmin=-.1,vmax=2.2;
    if(id==='Q3.4'){path.forEach(s=>{umin=Math.min(umin,s.u-.3);umax=Math.max(umax,s.u+.3);vmin=Math.min(vmin,s.v-.3);vmax=Math.max(vmax,s.v+.3);});}
    const maxLoss=Math.max(...[umin,umax].flatMap(u=>[vmin,vmax].map(v=>M.values(u,v).loss)),1),height=L=>3*L/maxLoss;
    const pos=(u,v)=>[(u-umin)/(umax-umin)*5.4-2.7,height(M.values(u,v).loss),(v-vmin)/(vmax-vmin)*4.2-2.1];
    stage.clear([0,1,0],8);stage.grid({size:2.7,steps:8,labels:['조절값 u →','조절값 v →']});
    const count=18;
    for(let i=0;i<count;i++)for(let j=0;j<count;j++){
      const u=umin+(umax-umin)*i/count,v=vmin+(vmax-vmin)*j/count,du=(umax-umin)/count,dv=(vmax-vmin)/count;
      const ratio=M.values(u+du/2,v+dv/2).loss/maxLoss,light=Math.round(96-ratio*20);
      stage.poly([pos(u,v),pos(u+du,v),pos(u+du,v+dv),pos(u,v+dv)],`hsl(216 40% ${light}%)`,'#8099bd60');
    }
    path.forEach((s,i)=>{const p=pos(s.u,s.v);if(i)stage.line(pos(path[i-1].u,path[i-1].v),p,C.gold,2.4);if(i===0||i===path.length-1)stage.point(p,{color:i===0?C.blue:C.gold,label:i===0?'시작':`현재 · 손실 ${fmt(s.loss)}`,offset:i===0?[-20,23]:[20,-22],radius:7});});
    const s=M.values(state.u,state.v);
    if(id==='Q3.2'){
      const u2=state.u+(state.axis==='u'?.18:0),v2=state.v+(state.axis==='v'?.18:0);stage.line(pos(state.u,state.v),pos(u2,v2),C.gold,3);stage.label(pos(u2,v2),`+${state.axis} 방향`,{offset:[30,-20],plate:true});
    }
    stage.label([-2.7,2.9,-2],'높이 = 손실',{size:11,color:C.muted});
    const previous=id==='Q3.2'?M.values(state.u-(state.n&&state.axis==='u'?.01:0),state.v-(state.n&&state.axis==='v'?.01:0)):path[Math.max(0,path.length-2)];
    const quotient=state.n?(s.loss-previous.loss)/.01:null;
    return {space:'설정 공간 · 바닥은 u,v / 높이는 손실',caption:id==='Q3.2'?'작은 변화의 결과를 확인합니다. 골짜기 바닥은 3u+v=8인 여러 설정입니다.':`높이축 범위 0~${fmt(maxLoss)}${maxLoss>100?' · 큰 걸음을 포함하도록 축 범위를 넓혔습니다.':' · 표시된 점은 계산으로 갱신한 위치입니다.'}`,stats:[['u',fmt(s.u)],['v',fmt(s.v)],['예측',fmt(s.p)],['손실',fmt(s.loss)]],calc:`p=3u+v, 정답=8, L=(p-8)²\nu=${fmt(s.u)}, v=${fmt(s.v)}, p=${fmt(s.p)}, L=${fmt(s.loss)}\n${id==='Q3.2'?`바꾸기 전 손실: ${fmt(previous.loss)}\n작은 변화에서 관찰한 비율: ${quotient===null?'아직 바꾸지 않음':fmt(quotient)}\n바꾸기 전 정확한 미분값: ${fmt(state.axis==='u'?previous.gu:previous.gv)}\n유한한 0.01의 변화와 정확한 미분값을 구분합니다.`:`학습률: ${state.lr}\nu_new=u-lr×6(p-8)\nv_new=v-lr×2(p-8)\n갱신 횟수: ${state.n}. 전체 데이터 순회를 뜻하는 epoch과는 구분합니다.`}`};
  }
  function graphScene(id){
    const tool=id==='Q4.3',remember=id==='Q4.2',n=state.n;
    const updated=tool&&n>=4,s=updated?M.update(1,1,.025):M.values();
    const phase=tool?(n===3?4:0):remember?Math.max(0,n-1):n;
    const showGraph=!remember||n>0;
    stage.clear([0,.35,0],8.3);
    const points={u:[-2.8,1.1,-.7],v:[-2.8,-.65,1],a:[-.85,1.25,-1],p:[1.05,.25,0],L:[2.8,.25,0]};
    const labels={u:`첫째 손잡이 u\n${fmt(s.u)}`,v:`둘째 손잡이 v\n${fmt(s.v)}`,a:`u 두 배 · a\n${fmt(s.a)}`,p:`예측한 답 p\n${fmt(s.p)}`,L:`틀린 정도 L\n${fmt(s.loss)}`};
    const edges=[['u','a',3,'×2'],['a','p',2,'+a'],['u','p',2,'+u'],['v','p',2,'+v'],['p','L',1,'차이²']];
    if(showGraph){
      edges.forEach(([from,to,at,label])=>{const a=points[from],b=points[to],active=phase>=at;stage.arrow(active?b:a,active?a:b,active?C.gold:'#7185a5',active?2.8:1.5);const mid=a.map((x,i)=>(x+b[i])/2);if(phase===0||phase===at)stage.label(mid,active?(from==='p'?'-8':from==='u'&&to==='a'?'-16':'-8'):label,{offset:from==='u'&&to==='p'?[0,23]:[0,-12],color:active?C.gold:C.muted,size:11,plate:true});});
    }
    Object.entries(points).forEach(([key,p])=>{if(!showGraph&&key!=='p'&&key!=='L')return;stage.point(p,{radius:key==='L'?11:9,color:key==='L'?C.gold:key==='u'&&phase>=4?C.gold:C.green});stage.label(p,labels[key],{offset:[0,key==='a'?-42:20],plate:true,size:12});});
    if(phase>=4){stage.label([-2.7,2,-.7],'u의 영향 = -16 + -8 = -24',{plate:true,color:C.gold,size:12});stage.label([-2.7,-1.6,1],'v의 영향 = -8',{plate:true,color:C.gold,size:12});}
    if(updated)stage.label([0,2,0],'갱신에 쓴 이전 기울기 · u=-24, v=-8',{plate:true,color:C.gold,size:12});
    const captions=['먼저 앞으로 계산합니다. 아직 u와 v는 바뀌지 않았습니다.','손실에서 예측값으로: 변화율 -8을 구합니다.','같은 -8을 세 경로에서 다시 사용합니다.','두 배 계산을 거친 경로의 영향은 -16입니다.','u로 오는 두 경로를 더합니다. 기울기는 -24, -8입니다.'];
    const stages=['이전 기울기 비우기','예측값 만들기','손실 계산하기','기울기 구하기 · backward','실제 값 고치기 · step'];
    const grad=tool&&n>=3?M.autodiff():null;
    return {space:'계산 그래프 · 위치는 계산의 연결을 표현',caption:tool?`${stages[n]}${updated?' · 새 예측과 손실을 다시 표시합니다. 사용한 기울기는 갱신 전 위치의 값입니다.':' · 갱신 단계 전까지 u와 v는 그대로입니다.'}`:remember?(n===0?'예측 4와 손실 16이라는 결과만으로는 계산 경로를 알 수 없습니다.':captions[phase]):captions[phase],stats:[['u',fmt(s.u)],['v',fmt(s.v)],['예측',fmt(s.p)],['손실',fmt(s.loss)],...(phase>=4||updated?[[updated?'갱신 전 기울기':'기울기','-24, -8']]:[])],calc:tool?`브라우저에서 작은 계산 그래프의 역방향 자동미분을 실행합니다.\n직접 계산: du=-24, dv=-8\n자동 계산: ${grad?`du=${fmt(grad.u)}, dv=${fmt(grad.v)}`:'아직 기울기 계산 전'}\n${updated?'표시된 기울기는 갱신 전 위치에서 구한 값입니다. 새 위치의 기울기는 다음 순전파 후 구합니다.':''}\n\n같은 연산의 PyTorch 표현 (이 브라우저에서 PyTorch를 실행하는 것은 아님):\noptimizer.zero_grad()\na = 2*u\np = a + u + v\nloss = (p - 8)**2\nloss.backward()  # 기울기 계산\noptimizer.step() # 파라미터 갱신`:`u=1, v=1\na=2u=2\np=a+u+v=4\nL=(p-8)²=16\ndL/dp=-8\nu의 영향: (-8×2)+(-8×1)=-24\nv의 영향: -8\n아직 u,v를 갱신하지 않았습니다.`};
  }
  function tensorScene(){
    stage.clear([0,.2,0],8.3);const n=state.n,out=M.tensorProduct();
    if(n<2){
      for(let i=0;i<12;i++){const b=Math.floor(i/6),r=Math.floor(i%6/3),c=i%3;const p=n===0?[(c-1)*.85,.8-r*.85,(b-.5)*1.8]:[(i%6-2.5)*.85,.7-b*1.25,0];stage.box(p,.62,{label:String(i),fill:i===state.cell?'#f8d9b5':b?'#e4dcf3':'#d7e5fc',selected:i===state.cell,id:i});}
      stage.label([0,2,-.5],n===0?'예시 2 × 행 2 × 열 3':'예시 2 × 펼친 숫자 6',{plate:true});
      stage.label([-3.2,-.8,0],n===0?'깊이: 예시 번호':'행: 예시 번호',{size:11,color:C.muted,offset:[0,25]});
    }else{
      out.forEach((row,i)=>row.forEach((value,j)=>stage.box([(j-.5)*1.4,.7-i*1.3,0],.85,{label:String(value),fill:'#d7e5fc'})));
      stage.label([0,2,0],'(2 × 6) @ (6 × 2) → (2 × 2)',{plate:true});
      stage.label([0,-1.7,0],'첫 출력: 0+2+4=6 / 다음 출력: 1+3+5=9',{size:11,color:C.muted});
    }
    const b=Math.floor(state.cell/6),r=Math.floor(state.cell%6/3),c=state.cell%3;
    return {space:'배열 공간 · 축은 숫자의 자리 / 블록은 숫자 하나',caption:['예시 두 개, 각각 2행 3열입니다. 블록을 누르면 선택한 숫자의 위치를 확인할 수 있어요.','숫자는 바꾸지 않고, 예시마다 여섯 숫자를 한 줄에 놓았습니다.','행렬곱으로 새로운 출력 네 개를 계산했습니다.'][n],stats:[['모양',['(2, 2, 3)','(2, 6)','(2, 2)'][n]],['원소 수',n<2?'12':'4'],...(n<2?[['선택한 값',String(state.cell)]]:[])],calc:`선택 원소 (0부터 센 인덱스): [${b},${r},${c}] = ${state.cell}\n펼친 뒤: [${b},${state.cell%6}] = ${state.cell}\n화면의 행·열은 1부터, 코드의 인덱스는 0부터 셉니다.\n\nX = [[0,1,2,3,4,5], [6,7,8,9,10,11]]\nW = [[1,0],[0,1],[1,0],[0,1],[1,0],[0,1]]\nX @ W = ${JSON.stringify(out)}\n선택한 원소의 값과, 새로 계산한 출력값은 구분합니다.`};
  }
  function actionLabel(){
    if(!q)return '첫 질문 열기';
    const labels={'Q1.1':'새 예시 2개 추가','Q1.2':'학습 전후 비교','Q1.3':'다른 시작 설정으로 비교','Q2.1':'같은 종류끼리 연결해보기','Q2.2':state.n===0?'중간 계산 보기':'두 결과 합치기','Q2.3':'음수를 0으로 바꾸기 적용','Q3.1':state.n===0?'예측을 정답 8로 바꿔보기':'예측 12의 차이도 비교','Q3.2':`${state.axis==='u'?'첫째':'둘째'} 손잡이 0.01 키우기`,'Q3.3':'영향을 한 단계 거슬러 계산','Q3.4':'손잡이 값을 한 번 고치기','Q4.1':state.n===0?'숫자 12개를 표로 펼치기':'묶어서 계산한 결과 보기','Q4.2':state.n===0?'결과를 만든 계산 과정 펼치기':'영향을 한 단계 거슬러 계산','Q4.3':'학습 과정을 한 단계 진행'};return labels[sceneId()];
  }
  function refresh(){
    syncControls();let id=sceneId();
    if(!id||group.id==='OVERVIEW'||content.document&&!q){stage.clear();stage.draw();$('live-result').replaceChildren();return;}
    let info;
    if(id.startsWith('Q1.'))info=fruitScene(id);
    else if(id==='Q2.1')info=gateScene();
    else if(id.startsWith('Q2.'))info=layersScene(id);
    else if(id==='Q3.1')info=lossScene();
    else if(id==='Q3.2'||id==='Q3.4')info=landscapeScene(id);
    else if(id==='Q4.1')info=tensorScene();
    else info=graphScene(id);
    stage.onPick=q&&sceneId()==='Q4.1'&&state.n<2?i=>{state.cell=i;refresh();}:null;
    if(id==='Q3.2'){const last=M.values(state.u,state.v),before=M.values(state.u-(state.n&&state.axis==='u'?.01:0),state.v-(state.n&&state.axis==='v'?.01:0));$('prediction').textContent=`${state.axis==='u'?'첫째 손잡이 u':'둘째 손잡이 v'}를 조금 키우면 틀린 정도가 줄어들까요?`;info.caption=state.n?`이번에는 ${state.axis}를 0.01 키웠습니다. 예측은 ${fmt(before.p)} → ${fmt(last.p)}, 틀린 정도는 ${fmt(before.loss)} → ${fmt(last.loss)}로 바뀌었습니다.`:'바닥의 점은 예시 데이터가 아니라 손잡이 설정 하나입니다. 손잡이를 조금 바꾼 뒤, 틀린 정도가 줄어드는지 숫자로도 확인하세요.';}
    if(id==='Q3.3')info.caption=['첫째 손잡이 u와 둘째 손잡이 v로 예측 4를 만들었습니다. 정답 8과 비교한 틀린 정도는 16입니다.','예측이 조금 커질 때 틀린 정도가 어떻게 변하는지 먼저 계산합니다. 그 영향이 -8입니다.','더하기로 연결된 세 경로에서 같은 영향 -8을 다시 사용합니다. 아직 손잡이는 바꾸지 않습니다.','u가 두 배 되는 길에서는 영향도 두 배가 됩니다. -8 × 2 = -16입니다.','u로 오는 두 길의 영향 -16과 -8을 합쳐 -24를 얻었습니다. u와 v의 값은 여전히 1입니다.'][state.n];
    stage.draw();$('scene-space').textContent=info.space;$('scene-caption').textContent=info.caption;$('scene').setAttribute('aria-label',(q?q.title:group.title)+'. '+info.caption);
    const friendly={u:'첫째 손잡이 u',v:'둘째 손잡이 v',w1:'크기 반영',w2:'색 반영','기준 b':'판단 기준 위치','예측':'예측한 답','손실':'틀린 정도','제곱오차':'틀린 정도 · 제곱오차','기울기':'계산한 영향','원소 수':'숫자 개수','선택한 값':'선택한 숫자'};
    const result=$('live-result');result.replaceChildren();info.stats.forEach(([label,value])=>{const item=el('div','result-item');item.append(el('small','',friendly[label]||label),el('strong','',String(value)));result.append(item);});
    const calc=$('calculation-data');if(calc)calc.textContent=info.calc;
    $('step-button').textContent=actionLabel();$('step-button').disabled=!!q&&state.n>=maxSteps();$('play-button').hidden=!q;$('reset-button').hidden=!q;$('play-button').disabled=!!q&&state.n>=maxSteps()&&!timer;$('step-count').textContent=q?`${state.n} / ${maxSteps()} 단계${state.n>=maxSteps()?' · 마지막 단계':''}`: '전체 흐름에서 궁금한 질문을 선택하세요';
    if(q&&state.n>=maxSteps()&&timer)stop();
    if(q&&sceneId()==='Q4.1'){const input=$('control-cell');if(input)input.disabled=state.n>=2;}
  }
  function advance(){
    if(!q){go(content.questions.find(item=>item.group===group.id).id);return;}
    if(state.n>=maxSteps())return;
    state.n++;
    if(sceneId()==='Q1.2'){const w=M.trainOnce();state.w1=w.w1;state.w2=w.w2;state.b=w.b;state.manual=false;}
    if(sceneId()==='Q3.1')state.pred=state.n===1?8:12;
    if(sceneId()==='Q3.2')state[state.axis]=Number((state[state.axis]+.01).toFixed(8));
    if(sceneId()==='Q3.4'){const s=M.update(state.u,state.v,state.lr);state.u=s.u;state.v=s.v;state.path.push(s);}
    refresh();
  }
  $('step-button').addEventListener('click',()=>{stop();advance();});
  $('play-button').addEventListener('click',()=>{if(timer){stop();return;}if(!q||!sceneId()||state.n>=maxSteps())return;$('play-button').textContent='자동 재생 멈추기';timer=setInterval(()=>advance(),matchMedia('(prefers-reduced-motion:reduce)').matches?1800:1500);});
  $('reset-button').addEventListener('click',()=>{stop();state=initialState();setupControls();refresh();});
  $('camera-button').addEventListener('click',()=>stage.toggleCamera());
  $('pdf-button').addEventListener('click',()=>$('pdf-file').click());
  function showAnalysis(message,error=false){const node=$('analysis-progress');node.hidden=false;node.classList.toggle('error',error);node.textContent=message;}
  function updateDocument(){const doc=content.document;$('document-name').textContent=doc?doc.name:'딥러닝 기초 · 13개 질문 예시 지도';$('analysis-notice').textContent=doc?`${doc.analysisLabel} · ${doc.pageCount}쪽 · ${doc.conceptCount}개 개념. ${doc.notice}`:'PDF를 선택하면 본문과 근거 페이지를 분석해 새 개념지도를 만듭니다.';$('demo-button').hidden=!doc;}
  $('overview-button').addEventListener('click',()=>go('OVERVIEW'));
  $('evidence-button').addEventListener('click',()=>{$('source-details').open=true;$('source-details').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});});
  $('demo-button').addEventListener('click',()=>{if(analysisRequest)analysisRequest.abort();expandedGroups.clear();content=demoContent;questions=new Map(content.questions.map(item=>[item.id,item]));if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=null;pdfName='';updateDocument();$('analysis-progress').hidden=true;go('OVERVIEW');});
  $('analysis-mode').addEventListener('change',()=>{$('analysis-notice').textContent=$('analysis-mode').value==='openai'?'PDF에서 추출한 텍스트를 OpenAI로 보내 문맥을 분석합니다. 파일을 선택하면 시작합니다.':'PDF 텍스트를 이 PC에서 구조 분석합니다. 파일을 선택하면 시작합니다.';});
  $('pdf-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    if(file.size>30*1024*1024){showAnalysis('30MB 이하 PDF를 선택해주세요.',true);return;}
    if(analysisRequest)analysisRequest.abort();const request=new AbortController();analysisRequest=request;stop();
    showAnalysis(`${file.name}에서 텍스트와 주제를 읽고 개념의 연결을 정리하고 있습니다…`);
    try{
      const response=await fetch('/api/analyze-pdf',{method:'POST',headers:{'Content-Type':'application/pdf','X-Filename':encodeURIComponent(file.name),'X-Analysis-Mode':$('analysis-mode').value},body:file,signal:request.signal});
      if(!(response.headers.get('content-type')||'').includes('application/json'))throw Error('PDF 분석 서버가 실행되지 않았습니다. 로컬 분석 서버로 화면을 열어주세요.');
      const result=await response.json();if(!response.ok)throw Error(result.error||'PDF 분석을 완료하지 못했습니다.');if(analysisRequest!==request)return;
      if(!Array.isArray(result.questions)||!result.questions.length||!Array.isArray(result.groups))throw Error('PDF에서 개념을 찾지 못했습니다. 다른 파일을 선택해주세요.');
      if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=URL.createObjectURL(file);pdfName=file.name;expandedGroups.clear();content=result;questions=new Map(content.questions.map(item=>[item.id,item]));
      updateDocument();showAnalysis(`개념지도 생성 완료 · ${result.document.pageCount}쪽에서 ${result.questions.length}개 개념을 찾았습니다. 아래에서 개념을 선택해보세요.`);go('OVERVIEW');
    }catch(error){if(error.name!=='AbortError')showAnalysis(error.message||'분석 연결에 실패했습니다. 현재 지도는 유지됩니다.',true);}
    finally{if(analysisRequest===request)analysisRequest=null;}
  });
  window.addEventListener('popstate',()=>go(location.hash.slice(1)||'G1',false));
  let mobile=matchMedia('(max-width:680px)').matches;window.addEventListener('resize',()=>{const next=matchMedia('(max-width:680px)').matches;if(mobile!==next){mobile=next;renderNavigation();}});
  document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();go('G1');});
  window.ForestApp={selectQuestion:go,advance,snapshot:()=>({selected,sceneId:sceneId(),group:group.id,state:JSON.parse(JSON.stringify(state)),document:content.document||null,concepts:content.questions.map(item=>({id:item.id,title:item.title,sceneId:item.sceneId,concept:item.concept})),autodiff:M.autodiff(),playing:!!timer}),sceneDiagnostics:()=>({width:stage.w,height:stage.h,labels:stage.labelBounds||[],arrows:stage.commands.filter(item=>item.arrow).map(item=>item.points)}),setControl:(key,value)=>{if(!(key in state))throw Error('Unknown control');state[key]=value;refresh();}};
  go(location.hash.slice(1)||'OVERVIEW',false);
  fetch('/api/status').then(response=>response.ok?response.json():null).then(status=>{if(status?.openaiAvailable){const option=$('analysis-mode').querySelector('[value=openai]');option.disabled=false;option.textContent='OpenAI 문맥 분석 · 추출 텍스트 전송';}}).catch(()=>{});
})();
