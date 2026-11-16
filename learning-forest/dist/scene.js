(function(root){
  'use strict';
  const C={grid:'#cbd5e1',axis:'#617795',text:'#17243a',muted:'#526176',green:'#2457c5',gold:'#b45309',blue:'#2457c5',purple:'#7353b6',red:'#b42318'};
  class Stage {
    constructor(canvas){
      this.canvas=canvas;this.ctx=canvas.getContext('2d');this.commands=[];this.hits=[];this.yaw=-.48;this.pitch=.66;this.center=[0,.7,0];this.span=7.7;this.onPick=null;
      new ResizeObserver(()=>this.draw()).observe(canvas);
      let drag=null;
      canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw:this.yaw,pitch:this.pitch,moved:false};canvas.setPointerCapture(e.pointerId);});
      canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>6)drag.moved=true;if(drag.moved){this.yaw=drag.yaw+dx*.009;this.pitch=Math.max(.12,Math.min(1.25,drag.pitch+dy*.006));this.draw();}});
      canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved&&this.onPick){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const hit=this.hits.filter(p=>Math.hypot(x-p.x,y-p.y)<22).sort((a,b)=>Math.hypot(x-a.x,y-a.y)-Math.hypot(x-b.x,y-b.y))[0];if(hit)this.onPick(hit.id);}drag=null;});
      canvas.addEventListener('pointercancel',()=>drag=null);
    }
    clear(center=[0,.7,0],span=7.7){this.commands=[];this.center=center;this.span=span;}
    resetCamera(){this.yaw=-.48;this.pitch=.66;}
    toggleCamera(){if(this.pitch>1.1){this.yaw=-.48;this.pitch=.66;}else{this.yaw=0;this.pitch=1.24;}this.draw();}
    project(p){
      const x=p[0]-this.center[0],y=p[1]-this.center[1],z=p[2]-this.center[2],cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);
      const a=cy*x+sy*z,b=-sy*x+cy*z,v=cp*y-sp*b,d=sp*y+cp*b;
      const scale=Math.min(this.w/this.span,this.h/(this.span*.62));
      return {x:this.w/2+a*scale,y:this.h*.52-v*scale,z:d,scale};
    }
    line(a,b,color=C.grid,width=1,dash=false){this.commands.push({type:'line',points:[a,b],color,width,dash});}
    arrow(a,b,color=C.blue,width=1.8){this.commands.push({type:'line',points:[a,b],color,width,arrow:true});}
    poly(points,fill,stroke=null){this.commands.push({type:'poly',points,fill,stroke});}
    point(p,{color=C.green,shape='circle',label='',id=null,radius=7,offset=[0,-17]}={}){this.commands.push({type:'point',points:[p],color,shape,label,id,radius,offset});}
    label(p,text,{color=C.text,offset=[0,0],size=12,plate=false}={}){this.commands.push({type:'label',points:[p],text,color,offset,size,plate});}
    box(p,side=.5,{fill='#dce9ff',label='',edge='#829bc4',id=null,selected=false}={}){
      const [x,y,z]=p,s=side/2,v=[[-s,-s,-s],[s,-s,-s],[s,s,-s],[-s,s,-s],[-s,-s,s],[s,-s,s],[s,s,s],[-s,s,s]].map(q=>[q[0]+x,q[1]+y,q[2]+z]);
      for(const face of [[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[1,5,6,2],[0,3,7,4]])this.poly(face.map(i=>v[i]),fill,selected?C.gold:edge);
      if(label)this.label(p,label,{size:12,plate:true});
      if(id!==null)this.commands.push({type:'hit',points:[p],id});
    }
    grid({y=0,size=2,steps=8,labels=['입력 1','입력 2'],labelY=true}={}){
      this.poly([[-size,y,-size],[size,y,-size],[size,y,size],[-size,y,size]],'#eef3fb99');
      for(let i=0;i<=steps;i++){const t=-size+2*size*i/steps;this.line([-size,y,t],[size,y,t],C.grid,.7);this.line([t,y,-size],[t,y,size],C.grid,.7);}
      this.line([-size,y,size],[size,y,size],C.axis,1.2);this.line([-size,y,-size],[-size,y,size],C.axis,1.2);
      if(labels[0])this.label([size,y,size],labels[0],{offset:[-10,18],color:C.muted,size:11});
      if(labels[1])this.label([-size,y,-size],labels[1],{offset:[0,-17],color:C.muted,size:11});
    }
    draw(){
      const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
      this.w=rect.width;this.h=rect.height;const dpr=Math.min(window.devicePixelRatio||1,2);
      if(this.canvas.width!==Math.round(this.w*dpr)||this.canvas.height!==Math.round(this.h*dpr)){this.canvas.width=Math.round(this.w*dpr);this.canvas.height=Math.round(this.h*dpr);}
      const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,this.w,this.h);this.hits=[];
      const items=this.commands.map(c=>({...c,screen:c.points.map(p=>this.project(p))}));
      items.sort((a,b)=>a.screen.reduce((s,p)=>s+p.z,0)/a.screen.length-b.screen.reduce((s,p)=>s+p.z,0)/b.screen.length);
      const labels=[];
      for(const c of items){
        const p=c.screen[0];
        if(c.type==='label'){labels.push({...c,p});continue;}
        if(c.type==='hit'){this.hits.push({x:p.x,y:p.y,id:c.id});continue;}
        ctx.beginPath();
        if(c.type==='line'){
          ctx.moveTo(p.x,p.y);ctx.lineTo(c.screen[1].x,c.screen[1].y);ctx.strokeStyle=c.color;ctx.lineWidth=c.width;ctx.setLineDash(c.dash?[4,5]:[]);ctx.stroke();ctx.setLineDash([]);
          if(c.arrow){const end=c.screen[1],angle=Math.atan2(end.y-p.y,end.x-p.x),length=10,x=end.x-12*Math.cos(angle),y=end.y-12*Math.sin(angle);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-length*Math.cos(angle-.4),y-length*Math.sin(angle-.4));ctx.moveTo(x,y);ctx.lineTo(x-length*Math.cos(angle+.4),y-length*Math.sin(angle+.4));ctx.stroke();}
        }else if(c.type==='poly'){
          ctx.moveTo(p.x,p.y);c.screen.slice(1).forEach(v=>ctx.lineTo(v.x,v.y));ctx.closePath();ctx.fillStyle=c.fill;ctx.fill();if(c.stroke){ctx.strokeStyle=c.stroke;ctx.lineWidth=.7;ctx.stroke();}
        }else if(c.type==='point'){
          const r=c.radius;
          if(c.shape==='triangle'){ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x-r,p.y+r*.8);ctx.lineTo(p.x+r,p.y+r*.8);ctx.closePath();}
          else{ctx.arc(p.x,p.y,r,0,Math.PI*2);}
          ctx.fillStyle=c.color;ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.stroke();
          if(c.label)labels.push({text:c.label,p,color:C.text,offset:c.offset,size:12,plate:true});
          if(c.id!==null)this.hits.push({x:p.x,y:p.y,id:c.id});
        }
      }
      const occupied=[];this.labelBounds=[];
      for(const c of labels){
        const fs=Math.max(this.w<400?12:13,Math.min(c.size||13,15)),offset=c.offset||[0,0];ctx.font=`${fs}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
        const lines=String(c.text).split('\n'),width=Math.max(...lines.map(s=>ctx.measureText(s).width)),pad=c.plate?5:0;
        let x=Math.max(width/2+8,Math.min(this.w-width/2-8,c.p.x+offset[0])),y=Math.max(16,Math.min(this.h-22-(lines.length-1)*16,c.p.y+offset[1]));
        const overlaps=(xx,yy)=>occupied.some(r=>xx-width/2-5<r.right&&xx+width/2+5>r.left&&yy-11<r.bottom&&yy+lines.length*16>r.top);
        if(overlaps(x,y)){
          outer:for(const dy of [-24,24,-46,46,-68,68])for(const dx of [0,-30,30,-65,65]){const xx=Math.max(width/2+8,Math.min(this.w-width/2-8,x+dx)),yy=Math.max(16,Math.min(this.h-22-(lines.length-1)*16,y+dy));if(!overlaps(xx,yy)){x=xx;y=yy;break outer;}}
        }
        const bounds={left:x-width/2-5,right:x+width/2+5,top:y-11,bottom:y+lines.length*16};occupied.push(bounds);this.labelBounds.push(bounds);
        if(Math.hypot(x-c.p.x-offset[0],y-c.p.y-offset[1])>22){ctx.beginPath();ctx.moveTo(c.p.x,c.p.y);ctx.lineTo(x,y);ctx.strokeStyle='#94a3b8';ctx.lineWidth=.7;ctx.stroke();}
        if(c.plate){ctx.fillStyle='#fffffff5';ctx.fillRect(x-width/2-pad,y-10,width+pad*2,lines.length*16+3);}
        ctx.fillStyle=c.color||C.text;lines.forEach((line,i)=>ctx.fillText(line,x,y+i*16));
      }
    }
  }
  root.ForestStage=Stage;root.ForestColors=C;
})(globalThis);
