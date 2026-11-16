const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.FOREST_PLAYWRIGHT_PATH||'playwright');
const origin=process.env.FOREST_QA_ORIGIN||'http://127.0.0.1:4173';
const out=path.resolve(__dirname,'../qa-output');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.FOREST_BROWSER_EXE?{executablePath:process.env.FOREST_BROWSER_EXE}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const external=[];page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:'))external.push(r.url());});
  await page.goto(origin);await page.waitForFunction(()=>!!window.ForestApp);
  const ids=await page.evaluate(()=>ForestContent.questions.map(q=>q.id));assert.equal(ids.length,13);
  for(const id of ids){
    await page.evaluate(id=>ForestApp.selectQuestion(id),id);
    const initial=await page.evaluate(()=>ForestApp.snapshot());assert.equal(initial.selected,id);
    assert.ok((await page.locator('#easy-explanation').innerText()).length>30);
    assert.equal(await page.locator('.group-link').count(),4);
    let count=0;
    while(!await page.locator('#step-button').isDisabled()){await page.locator('#step-button').click();if(++count>10)throw Error('Unbounded step sequence '+id);}
    const state=await page.evaluate(()=>ForestApp.snapshot());
    if(id==='Q3.3')assert.deepEqual([state.state.u,state.state.v],[1,1]);
    if(id==='Q3.4')assert.ok(state.state.path.at(-1).loss<.001);
    await page.locator('.experiment').screenshot({path:path.join(out,id+'.png')});
    await page.locator('#reset-button').click();assert.equal((await page.evaluate(()=>ForestApp.snapshot())).state.n,0);
  }
  await page.evaluate(()=>ForestApp.selectQuestion('Q1.2'));await page.locator('#step-button').click();assert.match(await page.locator('#live-result').innerText(),/6 \/ 6/);
  await page.evaluate(()=>ForestApp.selectQuestion('Q2.1'));await page.locator('#control-gate').selectOption('AND');assert.match(await page.locator('#live-result').innerText(),/4 \/ 4/);await page.locator('#control-gate').selectOption('OR');assert.match(await page.locator('#live-result').innerText(),/4 \/ 4/);
  await page.evaluate(()=>ForestApp.selectQuestion('Q3.2'));await page.locator('#step-button').click();await page.locator('.math-details').evaluate(e=>e.open=true);assert.match(await page.locator('#calculation-data').innerText(),/-23\.91/);
  await page.evaluate(()=>ForestApp.selectQuestion('Q3.4'));await page.locator('#control-lr').selectOption('0.15');await page.locator('#step-button').click();assert.equal((await page.evaluate(()=>ForestApp.snapshot())).state.path.at(-1).loss,64);
  await page.evaluate(()=>ForestApp.selectQuestion('Q4.3'));for(let i=0;i<3;i++)await page.locator('#step-button').click();assert.deepEqual((await page.evaluate(()=>ForestApp.snapshot())).autodiff,{u:-24,v:-8,a:-8,p:-8,loss:16});assert.match(await page.locator('#live-result').innerText(),/u\s+1/);await page.locator('#step-button').click();assert.match(await page.locator('#live-result').innerText(),/손실\s+4/);
  assert.match(await page.locator('#live-result').innerText(),/갱신 전 기울기/);
  const beforeCamera=await page.evaluate(()=>ForestApp.snapshot().state),beforeImage=await page.locator('#scene').evaluate(c=>c.toDataURL());await page.locator('#camera-button').click();const afterImage=await page.locator('#scene').evaluate(c=>c.toDataURL());assert.notEqual(beforeImage,afterImage);assert.deepEqual(await page.evaluate(()=>ForestApp.snapshot().state),beforeCamera);
  await page.evaluate(()=>ForestApp.selectQuestion('Q1.1'));await page.locator('#play-button').click();await page.waitForFunction(()=>ForestApp.snapshot().state.n===1&&!ForestApp.snapshot().playing);assert.equal(await page.locator('#play-button').innerText(),'순서대로 보기');
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});
    for(const id of ids){
      await page.evaluate(id=>ForestApp.selectQuestion(id),id);
      const dimensions=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.w,`${id} overflows at ${width}`);
      const controls=await page.locator('button,input[type=range],select').evaluateAll(nodes=>nodes.filter(n=>!n.hidden&&n.getBoundingClientRect().width>0).map(n=>({text:n.textContent,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})));
      assert.ok(controls.every(c=>c.left>=-1&&c.right<=width+1),`${id}: control overflow at ${width}`);
    }
  }
  await page.evaluate(()=>ForestApp.selectQuestion('Q3.3'));
  assert.deepEqual(await page.locator('#question-map').evaluate(n=>[...n.children].map(c=>c.className)),['group','group','group','group','small-questions']);
  await page.setViewportSize({width:1440,height:1080});await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  await page.evaluate(()=>ForestApp.selectQuestion('Q1.1'));
  await page.locator('#pdf-file').setInputFiles({name:'local-demo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')});
  assert.ok((await page.locator('#source-content a').first().getAttribute('href')).startsWith('blob:'));
  assert.deepEqual(external,[],'App should load and calculate without external assets or uploads');assert.deepEqual(errors,[]);
  const report={questions:13,viewportWidths:[1440,768,390,320],errors,externalRequests:external,checked:['all question steps','reset','finite playback','classification','XOR controls','finite difference','backward vs update','large learning rate','responsive controls','local-only PDF link']};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
