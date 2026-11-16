(function (root) {
  'use strict';
  const fruit = [[.2,.3,0],[.3,.2,0],[.7,.8,1],[.8,.7,1],[.8,.15,0],[.35,.8,1]];
  const inputs = [[0,0],[0,1],[1,0],[1,1]];
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  function trainOnce() {
    const grad = [0,0,0];
    fruit.slice(0,4).forEach(([x,y,label]) => {const e=.5-label; grad[0]+=e*(x-.5)/4;grad[1]+=e*(y-.5)/4;grad[2]+=e/4;});
    return {w1:-grad[0],w2:-grad[1],b:-grad[2]};
  }
  function xor(x,y,nonlinear=true) {
    const a=x-y,b=y-x, h1=nonlinear?Math.max(0,a):a,h2=nonlinear?Math.max(0,b):b;
    return {h1,h2,out:h1+h2};
  }
  function values(u=1,v=1) {const a=2*u,p=a+u+v,loss=(p-8)**2;return {u,v,a,p,loss,gu:6*(p-8),gv:2*(p-8),gp:2*(p-8)};}
  function update(u,v,lr) {const s=values(u,v);return values(u-lr*s.gu,v-lr*s.gv);}
  class Value {
    constructor(value,parents=[],partials=[]) {this.value=value;this.parents=parents;this.partials=partials;this.grad=0;}
    static add(...parents) {return new Value(parents.reduce((sum,p)=>sum+p.value,0),parents,parents.map(()=>1));}
    static scale(parent,k) {return new Value(parent.value*k,[parent],[k]);}
    static squaredDifference(parent,target) {return new Value((parent.value-target)**2,[parent],[2*(parent.value-target)]);}
    backward() {
      const order=[],seen=new Set();
      const visit=node=>{if(seen.has(node))return;seen.add(node);node.parents.forEach(visit);order.push(node);};
      visit(this);order.forEach(node=>node.grad=0);this.grad=1;
      order.reverse().forEach(node=>node.parents.forEach((p,i)=>p.grad+=node.grad*node.partials[i]));
    }
  }
  function autodiff(u=1,v=1) {const U=new Value(u),V=new Value(v),A=Value.scale(U,2),P=Value.add(A,U,V),L=Value.squaredDifference(P,8);L.backward();return {u:U.grad,v:V.grad,a:A.grad,p:P.grad,loss:L.value};}
  function tensorProduct() {const X=[Array.from({length:6},(_,i)=>i),Array.from({length:6},(_,i)=>i+6)],W=Array.from({length:6},(_,i)=>i%2?[0,1]:[1,0]);return X.map(row=>[0,1].map(j=>row.reduce((sum,x,k)=>sum+x*W[k][j],0)));}
  const api={fruit,inputs,sigmoid,trainOnce,xor,values,update,Value,autodiff,tensorProduct};
  root.ForestMath=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
