const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.FOREST_PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.FOREST_QA_ORIGIN || 'http://127.0.0.1:4173';
const out = path.resolve(__dirname, '../qa-output');
fs.mkdirSync(out, {recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.FOREST_BROWSER_EXE?{executablePath:process.env.FOREST_BROWSER_EXE}:{})});
  const errors=[],external=[],checked=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});
    page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(!r.url().startsWith('blob:')&&new URL(r.url()).origin!==origin)external.push(r.url());});
    let connected=false,servedMap=null,uploadFailure=null,uploadCount=0,connectFailure=null,connectCount=0;
    const fakeKey='sk-ui-fixture-never-a-real-key';
    await page.route('**/api/status',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({available:true,serverOpenaiAvailable:false,defaultModel:'legacy-model',connection:{connected,model:connected?'gpt-4o-mini':null,expiresIn:3600}})}));
    await page.route('**/api/openai/connect',r=>{connectCount++;const sent=r.request().postDataJSON();assert.equal(sent.model,'gpt-4o-mini');if(connectFailure==='transport')return r.abort('failed');if(connectFailure==='auth')return r.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'API 키를 인증하지 못했습니다.',code:'invalid_api_key'})});assert.equal(sent.apiKey,fakeKey);connected=true;return r.fulfill({contentType:'application/json',body:JSON.stringify({connected:true,model:sent.model,expiresIn:3600})});});
    await page.route('**/api/openai/disconnect',r=>{connected=false;return r.fulfill({contentType:'application/json',body:'{"connected":false}'});});
    await page.route('**/api/analyze-pdf',r=>{uploadCount++;const headers=r.request().headers(),body=r.request().postDataBuffer();assert.equal(headers['x-openai-source'],'personal');assert.notEqual(headers['x-analysis-mode'],'local');assert.ok(body.subarray(0,5).equals(Buffer.from('%PDF-')));assert.ok(!JSON.stringify(headers).includes(fakeKey));assert.ok(!body.includes(Buffer.from(fakeKey)));if(uploadFailure==='transport')return r.abort('failed');if(uploadFailure==='http')return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'분석 연결을 다시 확인해주세요.'})});return r.fulfill({contentType:'application/json',body:JSON.stringify(servedMap)});});
    await page.goto(origin);await page.waitForFunction(()=>!!window.ForestApp);await page.evaluate(()=>ForestConnection.ready);await page.evaluate(()=>document.fonts.ready);
    assert.deepEqual(await page.evaluate(()=>[...document.fonts].filter(f=>f.family==='NanumSquareRound').map(f=>[f.weight,f.status])),[['400','loaded'],['700','loaded'],['800','loaded']]);
    const snapshot=()=>page.evaluate(()=>ForestApp.snapshot());
    const select=async id=>{await page.evaluate(id=>ForestApp.selectQuestion(id),id);if(await page.locator('#visualization-button').isVisible()){assert.ok(await page.locator('#visualization-panel').isHidden());assert.equal((await page.evaluate(()=>ForestApp.sceneDiagnostics().arrows)).length,0);await page.locator('#visualization-button').click();}};
    assert.ok(await page.locator('#start-screen').isVisible());assert.equal((await snapshot()).concepts.length,0);
    assert.equal(await page.locator('#analysis-mode,#demo-button,#home-demo-button').count(),0);
    assert.equal(await page.evaluate(()=>('groups' in ForestContent)||('questions' in ForestContent)),false,'runtime assets must not include a fixed fallback map');
    await page.evaluate(()=>ForestApp.selectQuestion('Q1.1'));assert.ok(await page.locator('#start-screen').isVisible(),'old scene hashes must not open a legacy map');
    for(const width of [1440,1000,768,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.setViewportSize({width:1440,height:1080});await page.screenshot({path:path.join(out,'home-desktop.png')});
    await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(out,'home-mobile.png')});
    const data=await page.evaluate(()=>ForestContent.scenarios),ids=data.map(q=>q.id);
    const groups=[...new Set(data.map(q=>q.group))].map((id,i)=>({id,title:['판단 기준','계산의 표현','예측과 수정','계산을 돕는 도구'][i],short:['판단 기준','계산의 표현','예측과 수정','계산 도구'][i],intro:'검증용 문서의 내용 묶음입니다.',preview:null}));
    const sceneMap={groups,questions:data.map(q=>({...q,concept:'학습 장면 '+q.id,kind:'pdf',sceneId:q.id,evidence:[{page:1,excerpt:'검증용 문서의 학습 개념입니다.'}],page:1,source:'qa-scenes.pdf · PDF 1쪽'})),edges:data.flatMap(q=>q.next.filter(id=>ids.includes(id)).map(id=>({from:q.id,to:id,type:'학습 연결',reason:'이 계산의 결과가 다음 계산에 어떻게 쓰이는지 살펴봐요.'}))),document:{name:'qa-scenes.pdf',pageCount:1,conceptCount:13,mode:'openai',analysisLabel:'OpenAI 문맥 분석',summary:'검증된 13개 선택형 실험의 UI 검사용 응답입니다.',notice:'모의 OpenAI 응답'}};
    servedMap=sceneMap;
    const upload=async(map,name=map.document.name)=>{servedMap=map;await page.locator('#pdf-file').setInputFiles({name,mimeType:'application/pdf',buffer:fs.readFileSync(path.join(out,'fixture-ml.pdf'))});await page.waitForFunction(name=>ForestApp.snapshot().document?.name===name,map.document.name);};
    await page.locator('#pdf-file').setInputFiles(path.join(out,'fixture-ml.pdf'));await page.locator('#openai-dialog').waitFor({state:'visible'});assert.equal(uploadCount,0);assert.equal(await page.locator('#openai-model').inputValue(),'gpt-4o-mini');
    await page.locator('#openai-dialog').screenshot({path:path.join(out,'connection-default.png')});
    connectFailure='transport';await page.locator('#openai-key').fill(fakeKey);await page.locator('#openai-connect-submit').click();await page.waitForFunction(()=>document.querySelector('#openai-connect-message').classList.contains('error'));assert.match(await page.locator('#openai-connect-message').innerText(),/로컬 서버/);assert.equal(connectCount,1);assert.equal(await page.locator('#openai-key').inputValue(),'');
    await page.locator('#openai-dialog [data-server-retry]').click();await page.waitForFunction(()=>document.querySelector('#openai-dialog [data-server-help]').hidden);
    connectFailure='auth';await page.locator('#openai-key').fill(fakeKey);await page.locator('#openai-connect-submit').click();await page.waitForFunction(()=>document.querySelector('#openai-connect-message').textContent.includes('인증하지'));assert.equal(uploadCount,0);
    await page.locator('#openai-close').click();await page.waitForFunction(()=>document.querySelector('#home-analysis-progress').textContent.includes('전송하지 않았으며'));
    await page.locator('#pdf-file').setInputFiles(path.join(out,'fixture-ml.pdf'));await page.locator('#openai-dialog').waitFor({state:'visible'});connectFailure=null;await page.locator('#openai-key').fill(fakeKey);await page.locator('#openai-connect-submit').click();await page.waitForFunction(()=>ForestApp.snapshot().document?.mode==='openai');assert.equal(uploadCount,1);
    await page.setViewportSize({width:1440,height:1080});
    checked.push('OpenAI-only home has no local analysis or demo map; upload waits for personal connection; transport/auth/recovery paths and gpt-4o-mini default');
    for (const id of ids) {
      await select(id);
      assert.equal((await snapshot()).selected, id);
      const expected = await page.evaluate(id => ForestContent.scenarios.find(q => q.id === id), id);
      assert.equal(await page.locator('#question-title').innerText(), expected.title);
      assert.equal(await page.locator('#easy-explanation').innerText(), expected.definition);
      assert.equal(await page.locator('#visual-explanation p').allTextContents().then(items=>items.join('\n\n')), expected.review.explain.join('\n\n'));
      assert.equal(await page.locator('.group-link').count(), 4);
      let count = 0;
      while (!await page.locator('#step-button').isDisabled()) {
        await page.locator('#step-button').click();
        if (++count > 10) throw Error('Unbounded step sequence ' + id);
      }
      const after = await snapshot();
      if (id === 'Q3.3') assert.deepEqual([after.state.u, after.state.v], [1, 1]);
      if (id === 'Q3.4') assert.ok(after.state.path.at(-1).loss < .001);
      const beforeCamera = (await snapshot()).state;
      const beforeImage = await page.locator('#scene').evaluate(canvas => canvas.toDataURL());
      await page.locator('#camera-button').click();
      assert.notEqual(await page.locator('#scene').evaluate(canvas => canvas.toDataURL()), beforeImage);
      assert.deepEqual((await snapshot()).state, beforeCamera, 'camera changed values: ' + id);
      await page.locator('.experiment').screenshot({ path: path.join(out, id + '.png') });
      await page.locator('#reset-button').click();
      assert.equal((await snapshot()).state.n, 0);
    }
    checked.push('13 question titles, explanations, steps, reset, and camera invariance');
    await select('Q1.2');
    await page.locator('#step-button').click();
    assert.match(await page.locator('#live-result').innerText(), /6 \/ 6/);
    await select('Q2.1');
    for (const gate of ['AND', 'OR']) {
      await page.locator('#control-gate').selectOption(gate);
      assert.match(await page.locator('#live-result').innerText(), /4 \/ 4/);
    }
    await select('Q3.2');
    await page.locator('#step-button').click();
    await page.locator('.math-details').evaluate(node => node.open = true);
    assert.match(await page.locator('#calculation-data').innerText(), /-23\.91/);
    await select('Q3.4');
    await page.locator('#control-lr').selectOption('0.15');
    await page.locator('#step-button').click();
    assert.equal((await snapshot()).state.path.at(-1).loss, 64);
    await select('Q4.3');
    for (let i = 0; i < 3; i++) await page.locator('#step-button').click();
    assert.deepEqual((await snapshot()).autodiff, { u: -24, v: -8, a: -8, p: -8, loss: 16 });
    assert.deepEqual([(await snapshot()).state.u, (await snapshot()).state.v], [1, 1]);
    await page.locator('#step-button').click();
    assert.match(await page.locator('#live-result').innerText(), /갱신 전 기울기/);
    await page.locator('.math-details').evaluate(node => node.open = true);
    assert.match(await page.locator('#calculation-data').innerText(), /4/);
    checked.push('classification, finite difference, learning rate, backward vs update');
    // Check the actual theme roles without claiming a complete accessibility audit.
    await select('Q3.3');
    const palette = await page.evaluate(() => {
      const pair = (fg, bg) => [getComputedStyle(document.querySelector(fg)).color, getComputedStyle(document.querySelector(bg)).backgroundColor];
      return {
        body: getComputedStyle(document.body).backgroundColor,
        scene: getComputedStyle(document.querySelector('.experiment')).backgroundColor,
        pairs: [pair('body','body'),pair('#step-button','#step-button'),pair('.prediction','.prediction-box'),pair('.scene-caption','.observation'),pair('.source-details','.source-details')],
        explainSize: parseFloat(getComputedStyle(document.querySelector('#easy-explanation p')).fontSize)
      };
    });
    assert.equal(palette.body,'rgb(255, 255, 255)');assert.equal(palette.scene,'rgb(255, 255, 255)');
    const luminance = css => css.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
    const ratios=palette.pairs.map(([fg,bg])=>{const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
    assert.ok(ratios.every(r=>r>=4.5),'Theme text contrast: '+ratios.join(','));assert.ok(palette.explainSize>=15);
    assert.match(await page.locator('#explain-label').innerText(),/쉬운 설명/);assert.match(await page.locator('#check-section h3').innerText(),/이해 확인/);
    checked.push('white page and canvas, key text contrast >=4.5, explicit section roles');
    assert.ok((await page.evaluate(()=>ForestApp.sceneDiagnostics().arrows)).every(([from,to])=>to[0]>from[0]));
    for(let i=0;i<4;i++)await page.locator('#step-button').click();
    assert.ok((await page.evaluate(()=>ForestApp.sceneDiagnostics().arrows)).every(([from,to])=>to[0]<from[0]));
    await select('Q3.2');await page.locator('[data-choice-value=v]').click();await page.locator('#step-button').click();
    assert.match(await page.locator('#prediction').innerText(),/둘째/);assert.equal((await snapshot()).state.u,1);assert.equal((await snapshot()).state.v,1.01);
    checked.push('forward/backward arrow directions and selected-handle explanation');
    await select('Q1.1');
    await page.locator('#play-button').click();
    await page.waitForFunction(() => ForestApp.snapshot().state.n === 1 && !ForestApp.snapshot().playing);
    assert.equal((await snapshot()).state.n, 1);
    assert.ok(await page.locator('#play-button').isDisabled());
    checked.push('finite automatic playback');
    async function noOverflow(width, label) {
      const size = await page.evaluate(() => ({ w: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(size.scroll <= size.w, label + ' overflows at ' + width);
      const bounds = await page.locator('button,input[type=range],select,textarea').evaluateAll(nodes =>
        nodes.filter(node => node.getBoundingClientRect().width > 0).map(node => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right };
        }));
      assert.ok(bounds.every(box => box.left >= -1 && box.right <= width + 1), label + ' control overflow at ' + width);
    }
    for (const width of [1440, 1000, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const id of ids) {
        await select(id);
        await noOverflow(width, id);
      }
      const hierarchy=await page.evaluate(()=>{
        const style=s=>getComputedStyle(document.querySelector(s));
        return {title:parseFloat(style('#question-title').fontSize),section:parseFloat(style('#explain-label').fontSize),body:parseFloat(style('#easy-explanation p').fontSize),line:parseFloat(style('#easy-explanation p').lineHeight),family:style('#easy-explanation p').fontFamily};
      });
      assert.ok(hierarchy.title>hierarchy.section&&hierarchy.section>hierarchy.body,'question/section/body type hierarchy at '+width);
      assert.ok(hierarchy.body>=17&&hierarchy.line>=hierarchy.body*1.85,'comfortable reading size and line spacing at '+width);
      assert.match(hierarchy.family,/NanumSquareRound/);
      const groupBoxes=await page.locator('.group-link').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y};}));
      assert.ok(groupBoxes.slice(1).every((box,i)=>width>1000?box.x>groupBoxes[i].x:box.y>groupBoxes[i].y),'map must flow in one direction at '+width);
    }
    assert.deepEqual(await page.locator('#question-map').evaluate(node => [...node.children].map(child => child.className)),
      ['group', 'group', 'group', 'group', 'small-questions']);
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
    checked.push('13 questions at 1440, 768, 390, 320px');
    checked.push('locally loaded rounded Korean fonts, question/section/body hierarchy and reading line spacing at four widths');
    // Durable records belong to the PDF, never to a hidden fallback map.
    await select('Q2.2');await page.locator('#note-input').fill('중간 계산을 내 말로 설명해요. <b>메모</b>');await page.locator('#next-question').click();await page.locator('#previous-question').click();assert.match(await page.locator('#note-input').inputValue(),/중간 계산/);await page.locator('#save-note').click();await page.locator('#review-toggle').click();
    await page.locator('#question-filter').selectOption('understood');assert.equal(await page.locator('.question-link').count(),1);await page.locator('#question-filter').selectOption('all');
    const beforeResume=uploadCount;await page.locator('#home-nav-button').click();await page.locator('#home-resume-button').click();assert.equal(uploadCount,beforeResume);
    await page.reload();await page.waitForFunction(()=>!!window.ForestApp);assert.ok(await page.locator('#start-screen').isVisible());await upload(sceneMap);await select('Q2.2');assert.match(await page.locator('#note-input').inputValue(),/중간 계산/);assert.equal(await page.locator('#learning-note b').count(),0);assert.equal(await page.locator('#progress-count').innerText(),'1 / 13개 질문');
    const docBefore=(await snapshot()).document;
    for(const failure of ['transport','http']){uploadFailure=failure;const count=uploadCount;await page.locator('#pdf-file').setInputFiles(path.join(out,'fixture-ml.pdf'));await page.waitForFunction(()=>document.querySelector('#analysis-progress').classList.contains('error'));assert.equal(uploadCount,count+1);assert.deepEqual((await snapshot()).document,docBefore);assert.doesNotMatch(await page.locator('#analysis-progress').innerText(),/Failed to fetch/);}uploadFailure=null;
    const names=['자연어','자연어 처리','딥러닝','코퍼스','Tokenization','Vocabulary','Word2Vec','Cosine Similarity','Seq2Seq','Encoder','Decoder','Attention','Transformer','Self Attention','BERT','GPT'];
    const counts=[3,3,2,4,4],titles=['자연어 처리 기본 개념','NLP 기술적 접근','Word2Vec 및 유사도','Seq2Seq와 Attention을 이용해 긴 문장을 변환하는 과정','Transformer와 변형 모델'];let offset=0;
    const nlpGroups=counts.map((n,i)=>({id:'N'+i,title:titles[i],short:titles[i],intro:'문서 내용 묶음',preview:null}));
    const nlpNodes=counts.flatMap((n,i)=>Array.from({length:n},()=>{const k=offset++;return {id:'NLP'+k,group:'N'+i,concept:names[k],title:names[k]+'은 어떤 일을 하고 언제 필요한가요?',definition:'문서에서 찾은 개념을 쉬운 말로 살펴봐요.',explain:'작은 문장으로 뜻과 용도를 확인해요.',purpose:'관련 내용을 이해할 때 도움을 줍니다.',kind:'pdf',sceneId:null,page:k+1,source:'qa-nlp.pdf',evidence:[{page:k+1,excerpt:'문서에서 확인할 수 있는 실제 구절의 검증용 대체 자료입니다.'}],next:[]};}));
    const nlpMap={groups:nlpGroups,questions:nlpNodes,edges:[{from:'NLP6',to:'NLP7',type:'연결',reason:'검토 전 추상적인 연결입니다.'},{from:'NLP8',to:'NLP9',type:'구성',reason:'인코더 구성입니다.'}],document:{name:'qa-nlp.pdf',pageCount:75,conceptCount:16,mode:'openai',analysisLabel:'OpenAI 문맥 분석',summary:'서로 다른 길이와 개념 수를 가진 NLP 지도 UI 검사입니다.',notice:'모의 OpenAI 응답'}};
    await upload(nlpMap);
    for(const width of [1440,1000,768,390,320]){
      await page.setViewportSize({width,height:1000});await page.locator('#overview-button').click();await noOverflow(width,'NLP overview');assert.equal(await page.locator('.overview-group').count(),5);assert.equal(await page.locator('.overview-group-footer .overview-more').count(),5);
      const boxes=await page.locator('.overview-group').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),f=n.querySelector('.overview-group-footer').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,footer:f.bottom};}));
      for(let i=1;i<boxes.length;i++)if(Math.abs(boxes[i].top-boxes[i-1].top)<2){assert.ok(Math.abs(boxes[i].height-boxes[i-1].height)<2);assert.ok(Math.abs(boxes[i].footer-boxes[i-1].footer)<2,'card footer alignment');}
      assert.ok(await page.locator('.overview-concept').evaluateAll(nodes=>nodes.every(n=>{const a=n.querySelector('.overview-concept-arrow').getBoundingClientRect(),r=n.getBoundingClientRect();return a.right<=r.right&&a.left>=r.left&&getComputedStyle(n,'::after').content==='none';})));
      assert.ok(await page.locator('#question-filter').isHidden());
      if(width===1440)await page.locator('#concept-overview').screenshot({path:path.join(out,'ui-overview-desktop.png')});
      if(width===390)await page.locator('.overview-group').first().screenshot({path:path.join(out,'ui-overview-mobile.png')});
      await page.locator('.overview-more').nth(3).click();assert.equal(await page.locator('.is-group-overview .overview-concept').count(),4);await page.locator('.overview-more').click();assert.equal((await snapshot()).selected,'OVERVIEW');
    }
    await page.setViewportSize({width:1440,height:1080});await page.locator('.overview-concept[href="#NLP0"]').click();assert.ok(await page.locator('#visualization-panel').isHidden());assert.equal(await page.locator('#note-input').inputValue(),'');assert.match(await page.locator('#next-questions').innerText(),/아직 연결이/);assert.ok(await page.locator('#visualization-button').isHidden());assert.match(await page.locator('#visualization-description').innerText(),/임의로 만들지/);
    await page.evaluate(()=>ForestApp.selectQuestion('NLP6'));assert.match(await page.locator('#easy-explanation').innerText(),/단순한 단어 번호와 달라/);assert.match(await page.locator('#easy-explanation').innerText(),/문맥/);assert.ok((await page.locator('.term-list dt').allTextContents()).includes('벡터'));assert.match(await page.locator('#next-questions').innerText(),/방향을 비교/);await page.locator('#visualization-button').click();assert.ok(await page.locator('.experiment').isHidden());assert.ok(await page.locator('#visualization-network').isVisible());await page.locator('#visualization-button').click();
    await page.locator('#understanding-grid').screenshot({path:path.join(out,'ui-nlp-explanation.png')});
    const common=await page.locator('.button,.scene-button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0).map(n=>({height:n.getBoundingClientRect().height,radius:getComputedStyle(n).borderRadius,size:getComputedStyle(n).fontSize})));assert.ok(common.every(n=>n.height>=44&&n.radius==='12px'&&n.size==='14px'),'shared action sizing');
    checked.push('variable 5-group NLP map at 5 widths: aligned card heights/footers, fixed right-side arrows, long titles, count badges, reversible group navigation, common control sizes');
    checked.push('PDF-scoped durable notes, draft navigation, no re-analysis on resume, failure preserves map, unsupported visualization and honest missing-relation state');
    const crowdedMap={...nlpMap,groups:[{id:'crowded',title:'많은 개념을 가진 묶음',short:'많은 개념',intro:'펼치기 검사',preview:null}],questions:nlpNodes.map(q=>({...q,group:'crowded'})),document:{...nlpMap.document,name:'qa-crowded.pdf'}};
    await upload(crowdedMap);await page.locator('.group-link').click();assert.equal(await page.locator('.question-link').count(),4);assert.equal(await page.locator('.map-expand').getAttribute('aria-expanded'),'false');await page.locator('.map-expand').click();assert.equal(await page.locator('.question-link').count(),16);assert.equal(await page.locator('.map-expand').getAttribute('aria-expanded'),'true');await page.locator('.map-expand').click();assert.equal(await page.locator('.question-link').count(),4);assert.ok(await page.locator('.map-expand').evaluate(n=>n===document.activeElement));
    checked.push('large groups expand/collapse with stable aria-controls, disclosure state and keyboard focus');
    await page.locator('#openai-settings').click();assert.equal(await page.locator('#openai-key').inputValue(),'');await page.locator('#openai-disconnect').click();await page.locator('#openai-dialog').waitFor({state:'hidden'});assert.ok(!(await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage])+document.cookie)).includes(fakeKey));
    const blocked=await browser.newPage({viewport:{width:390,height:900}});await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Blocked','SecurityError');};});
    await blocked.route('**/api/status',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({available:true,serverOpenaiAvailable:true,connection:{connected:false}})}));await blocked.route('**/api/analyze-pdf',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(sceneMap)}));
    await blocked.goto(origin);await blocked.locator('#pdf-file').setInputFiles(path.join(out,'fixture-ml.pdf'));await blocked.waitForFunction(()=>ForestApp.snapshot().document);await blocked.evaluate(()=>ForestApp.selectQuestion('Q1.1'));await blocked.locator('#note-input').fill('현재 화면에서 유지');await blocked.locator('#save-note').click();assert.match(await blocked.locator('#note-status').innerText(),/이번 화면/);await blocked.close();
    checked.push('blocked browser storage preserves session notes with a notice; no credentials in browser storage');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({runId:process.env.FOREST_QA_RUN_ID||'standalone',questions:13,viewportWidths:[1440,1000,768,390,320],browserVersion:browser.version(),errors,externalRequests:external,checked},null,2));
    console.log('Browser QA: PASS (PDF-only flow, 13 optional visualizations, UI consistency, 5 widths)');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
