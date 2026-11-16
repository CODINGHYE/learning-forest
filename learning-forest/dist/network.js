(function(){
  'use strict';
  const html=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;};
  const svg=(tag,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)));return node;};
  function render(container,content,focusId,onSelect){
    container.replaceChildren();const nodes=new Map(content.questions.map(item=>[item.id,item])),edges=(content.edges||[]).filter(edge=>nodes.has(edge.from)&&nodes.has(edge.to));
    if(!nodes.size)return;
    const focus=nodes.get(focusId)||[...nodes.values()].sort((a,b)=>edges.filter(e=>e.from===b.id||e.to===b.id).length-edges.filter(e=>e.from===a.id||e.to===a.id).length)[0];
    const seen=new Set(),relations=edges.filter(edge=>edge.from===focus.id||edge.to===focus.id).filter(edge=>{const other=edge.from===focus.id?edge.to:edge.from;if(seen.has(other))return false;seen.add(other);return true;}).slice(0,4);
    const card=html('section','network-card'),heading=html('h3','',focusId?'이 개념 주변의 연결':'개념들이 이어지는 모습');card.append(heading,html('p','network-help','개념을 누르면 설명을 열어요. 선 옆의 말은 두 개념이 이어지는 이유의 종류예요.'));
    if(!relations.length){card.append(html('p','network-empty',`${focus.concept||focus.title}의 연결은 아직 확인하지 못했어요. 관계를 추측하지 않고 원문부터 살펴봐요.`));container.append(card);return;}
    const picture=svg('svg',{viewBox:'0 0 960 500',class:'concept-network',role:'group','aria-label':`${focus.concept||focus.title} 주변의 ${relations.length}개 관계. 전체 개념 중 일부 연결입니다.`});
    const defs=svg('defs'),markerId=(container.id||'network')+'-arrow',marker=svg('marker',{id:markerId,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(svg('path',{d:'M1 1L9 5L1 9',fill:'none',stroke:'#8093bd','stroke-width':1.8}));defs.append(marker);picture.append(defs);
    const center=[480,250],positions=[[145,100],[815,100],[145,400],[815,400]],placements=[[focus,center]];
    const boundary=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],scale=Math.min(116/Math.abs(dx||.001),50/Math.abs(dy||.001));return[a[0]+dx*scale,a[1]+dy*scale];};
    const mobile=html('div','network-mobile'),focusButton=html('button','network-focus',focus.concept||focus.title);focusButton.type='button';focusButton.addEventListener('click',()=>onSelect(focus.id));mobile.append(focusButton);
    relations.forEach((edge,index)=>{const other=nodes.get(edge.from===focus.id?edge.to:edge.from),position=positions[index],from=edge.from===focus.id?center:position,to=edge.to===focus.id?center:position,start=boundary(from,to),end=boundary(to,from);picture.append(svg('line',{x1:start[0],y1:start[1],x2:end[0],y2:end[1],stroke:'#9aaacd','stroke-width':2.5,'marker-end':`url(#${markerId})`}));const mid=[(from[0]+to[0])/2,(from[1]+to[1])/2],tag=svg('g');tag.append(svg('rect',{x:mid[0]-87,y:mid[1]-16,width:174,height:32,rx:12,fill:'#fff',stroke:'#e1e6f2'}));const label=svg('text',{x:mid[0],y:mid[1]+5,'text-anchor':'middle',fill:'#566c99','font-size':15});label.textContent=edge.type;tag.append(label);picture.append(tag);placements.push([other,position]);
      const item=html('div','network-mobile-relation'),a=html('button','',other.concept||other.title);a.type='button';a.addEventListener('click',()=>onSelect(other.id));item.append(html('span','relation-type',edge.type),a,html('p','',edge.reason));mobile.append(item);
    });
    placements.forEach(([item,p],index)=>{const link=svg('a',{href:'#'+item.id,'aria-label':`${item.concept||item.title} 설명 열기`,'data-concept':item.id});link.addEventListener('click',event=>{event.preventDefault();onSelect(item.id);});link.append(svg('rect',{x:p[0]-116,y:p[1]-50,width:232,height:100,rx:24,fill:index?'#faf8ff':'#eef3ff',stroke:index?'#e1d8f3':'#a9bbea','stroke-width':3}));const text=svg('text',{x:p[0],y:p[1]-6,'text-anchor':'middle',fill:index?'#5c4783':'#304ca7','font-size':21,'font-weight':800}),name=Array.from(item.concept||item.title);for(let line=0;line<Math.min(3,Math.ceil(name.length/11));line++){const span=svg('tspan',{x:p[0],dy:line?25:0});span.textContent=name.slice(line*11,line*11+11).join('')+(line===2&&name.length>33?'…':'');text.append(span);}if(name.length<=11)text.setAttribute('y',p[1]+7);link.append(text);picture.append(link);});
    card.append(picture,mobile,html('p','network-note',`이 그림은 '${focus.concept||focus.title}' 가까이의 연결 ${relations.length}개를 보여줘요. 다른 개념을 선택하면 그 주변을 탐색할 수 있어요. 화살표는 관계의 방향이며 발명 순서가 아닙니다.`));container.append(card);
  }
  window.ForestNetwork={render};
})();
