const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.FOREST_PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.FOREST_QA_ORIGIN || 'http://127.0.0.1:4173';
const out = path.resolve(__dirname, '../qa-output');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FOREST_BROWSER_EXE ? { executablePath: process.env.FOREST_BROWSER_EXE } : {})
  });
  const errors = [], external = [];
  const checked = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = request.url();
      if (!url.startsWith('blob:') && new URL(url).origin !== origin) external.push(url);
    });
    await page.goto(origin);
    await page.waitForFunction(() => !!window.ForestApp);
    await page.evaluate(()=>document.fonts.ready);
    const fontFaces=await page.evaluate(()=>[...document.fonts].filter(face=>face.family==='NanumSquareRound').map(face=>[face.weight,face.status]));
    assert.deepEqual(fontFaces,[['400','loaded'],['700','loaded'],['800','loaded']],'bundled Korean font weights must actually load');
    const snapshot = () => page.evaluate(() => ForestApp.snapshot());
    const select = id => page.evaluate(id => ForestApp.selectQuestion(id), id);
    const ids = await page.evaluate(() => ForestContent.questions.map(q => q.id));
    assert.equal(ids.length, 13);
    for (const id of ids) {
      await select(id);
      assert.equal((await snapshot()).selected, id);
      const expected = await page.evaluate(id => ForestContent.questions.find(q => q.id === id), id);
      assert.equal(await page.locator('#question-title').innerText(), expected.title);
      assert.equal(await page.locator('#easy-explanation').innerText(), expected.review.explain.join('\n\n'));
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
    for (const width of [1440, 768, 390, 320]) {
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
    }
    assert.deepEqual(await page.locator('#question-map').evaluate(node => [...node.children].map(child => child.className)),
      ['group', 'group', 'group', 'group', 'small-questions']);
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
    checked.push('13 questions at 1440, 768, 390, 320px');
    checked.push('locally loaded rounded Korean fonts, question/section/body hierarchy and reading line spacing at four widths');
    // Exercise the public navigation and durable learner controls, not only the QA API.
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.locator('#overview-button').click();
    await page.locator('.group-link[href="#G2"]').click();
    assert.ok(await page.locator('#concept-overview').isVisible());
    assert.ok(await page.locator('.experiment').isHidden());
    await page.locator('.question-link[href="#Q2.2"]').click();
    assert.equal((await snapshot()).selected,'Q2.2');
    await page.locator('#note-input').fill('중간 계산을 내 말로 설명해요. <b>메모</b>');
    await page.locator('#next-question').click();
    assert.equal((await snapshot()).selected,'Q2.3');
    await page.locator('#previous-question').click();
    assert.equal(await page.locator('#note-input').inputValue(),'중간 계산을 내 말로 설명해요. <b>메모</b>');
    await page.locator('#save-note').click();
    await page.locator('#review-toggle').click();
    assert.equal(await page.locator('#progress-count').innerText(),'1 / 13개 질문');
    assert.equal(await page.locator('#review-toggle').getAttribute('aria-pressed'),'true');
    await page.locator('#question-filter').selectOption('understood');
    assert.equal(await page.locator('.question-link').count(),1);
    assert.equal(await page.locator('.question-link').getAttribute('href'),'#Q2.2');
    await page.locator('#question-filter').selectOption('remaining');
    assert.equal(await page.locator('.question-link[href="#Q2.2"]').count(),0);
    assert.equal((await snapshot()).selected,'Q2.2','filter must not replace the open lesson');
    await page.reload();await page.waitForFunction(()=>!!window.ForestApp);
    assert.equal(await page.locator('#progress-count').innerText(),'1 / 13개 질문');
    assert.match(await page.locator('#note-input').inputValue(),/<b>메모<\/b>/);
    assert.equal(await page.locator('#learning-note b').count(),0,'notes must remain plain text');
    await select('Q1.1');assert.ok(await page.locator('#previous-question').isDisabled());
    await select('Q4.3');assert.ok(await page.locator('#next-question').isDisabled());
    checked.push('roadmap drill-down, previous/next bounds, draft retention, durable notes and explicit understanding filters');
    await page.setViewportSize({ width: 390, height: 900 });
    assert.ok(await page.locator('#analysis-mode option[value=openai]').isDisabled());
    await page.locator('#pdf-file').setInputFiles(path.join(out, 'fixture-ml.pdf'));
    await page.waitForFunction(() => ForestApp.snapshot().document?.mode === 'local');
    assert.match(await page.locator('#progress-count').innerText(),/^0 \//);
    assert.ok((await snapshot()).concepts.length >= 4);
    const supported = (await snapshot()).concepts.find(q => q.sceneId);
    await select(supported.id);
    assert.equal(await page.locator('#note-input').inputValue(),'');
    await page.locator('#note-input').fill('PDF에만 남기는 메모');await page.locator('#save-note').click();
    await page.locator('#review-toggle').click();
    assert.ok(await page.locator('.experiment').isVisible());
    assert.match(await page.locator('#experiment-instruction').innerText(), /별도 예제/);
    const pdfLink = await page.locator('#source-content a').first().getAttribute('href');
    assert.ok(pdfLink.startsWith('blob:') && pdfLink.includes('#page=1'));
    assert.ok(await page.locator('.evidence-item').count());
    const documentBeforeError = (await snapshot()).document;
    await page.locator('#pdf-file').setInputFiles({
      name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nbroken')
    });
    await page.waitForFunction(() => document.querySelector('#analysis-progress').classList.contains('error'));
    assert.deepEqual((await snapshot()).document, documentBeforeError);
    // Simulate a transport/server failure only; successful PDF analysis above uses real HTTP.
    await page.route('**/api/analyze-pdf', route => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ error: '분석 연결을 다시 확인해주세요.' })
    }));
    await page.locator('#pdf-file').setInputFiles(path.join(out, 'fixture-ml.pdf'));
    await page.waitForFunction(() => document.querySelector('#analysis-progress').textContent.includes('연결을 다시'));
    assert.deepEqual((await snapshot()).document, documentBeforeError);
    await page.unroute('**/api/analyze-pdf');
    await page.locator('#pdf-file').setInputFiles(path.join(out, 'fixture-general.pdf'));
    await page.waitForFunction(() => ForestApp.snapshot().document?.name === 'fixture-general.pdf');
    assert.ok((await snapshot()).concepts.every(q => q.sceneId === null));
    await select((await snapshot()).concepts[0].id);
    assert.equal(await page.locator('#note-input').inputValue(),'');
    assert.match(await page.locator('#progress-count').innerText(),/^0 \//);
    assert.ok(await page.locator('#concept-reading').isVisible());
    assert.ok(await page.locator('.experiment').isHidden());
    await noOverflow(390, 'unsupported PDF concept');
    await page.locator('#overview-button').click();
    assert.ok(await page.locator('#concept-overview').isVisible());
    await page.locator('#demo-button').click();
    assert.equal((await snapshot()).document, null);
    assert.equal((await snapshot()).concepts.length, 13);
    await select('Q2.2');
    assert.equal(await page.locator('#progress-count').innerText(),'1 / 13개 질문');
    assert.match(await page.locator('#note-input').inputValue(),/중간 계산을 내 말로/);
    await select('Q3.3');
    assert.ok(await page.locator('.experiment').isVisible());
    checked.push('real local PDF upload, evidence, errors preserve map, unsupported scene, overview and demo return');
    checked.push('notes and understanding records are separate for demo and each analyzed PDF');
    const blocked=await browser.newPage({viewport:{width:390,height:900}});
    await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage unavailable','QuotaExceededError');};});
    await blocked.goto(origin+'/#Q1.1');await blocked.waitForFunction(()=>!!window.ForestApp);
    await blocked.locator('#note-input').fill('저장이 막혀도 화면은 사용할 수 있어요.');
    await blocked.locator('#save-note').click();
    assert.match(await blocked.locator('#note-status').innerText(),/이번 화면에서만/);
    await blocked.locator('#next-question').click();await blocked.locator('#previous-question').click();
    assert.match(await blocked.locator('#note-input').inputValue(),/저장이 막혀도/);
    await blocked.close();
    checked.push('blocked browser storage gives an honest notice while preserving session notes');
    assert.deepEqual(errors, [], 'Browser runtime errors');
    assert.deepEqual(external, [], 'Unexpected external request');
    const report = {
      questions: 13, viewportWidths: [1440, 768, 390, 320],
      browserVersion: browser.version(), errors, externalRequests: external, checked
    };
    fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
