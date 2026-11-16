const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../dist/math.js');
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('one learning step updates parameters while examples stay fixed',()=>{
  const before=JSON.stringify(M.fruit),s=M.trainOnce();near(s.w1,.125);near(s.w2,.125);near(s.b,0);
  for(const [x,y,label] of M.fruit)assert.equal(Number(s.w1*(x-.5)+s.w2*(y-.5)+s.b>=0),label);
  assert.equal(JSON.stringify(M.fruit),before);
});
test('nonlinear intermediate representation solves all four XOR cases',()=>{M.inputs.forEach(([x,y])=>{assert.equal(M.xor(x,y).out,Number(x!==y));assert.equal(M.xor(x,y,false).out,0);});});
test('XOR cannot be separated by sampled lines; AND and OR can',()=>{
  for(let deg=-180;deg<=180;deg+=5)for(let threshold=-2;threshold<=2;threshold+=.05){const a=deg*Math.PI/180;const correct=M.inputs.filter(([x,y])=>Number(Math.cos(a)*x+Math.sin(a)*y>=threshold)===Number(x!==y)).length;assert.ok(correct<4);}
  M.inputs.forEach(([x,y])=>{assert.equal(Number(x+y>=1.5),Number(!!(x&&y)));assert.equal(Number(x+y>=.5),Number(!!(x||y)));});
});
test('squared error treats equal distances on both sides equally',()=>{assert.equal((4-8)**2,(12-8)**2);assert.equal((8-8)**2,0);});
test('finite change is different from the exact derivative',()=>{const initial=M.values(),next=M.values(1.01,1);near(initial.loss,16);near(next.loss,15.7609);near((next.loss-initial.loss)/.01,-23.91);near(initial.gu,-24);});
test('reverse automatic differentiation adds contributions from both u paths',()=>{const s=M.autodiff();near(s.u,-24);near(s.v,-8);near(s.a,-8);near(s.p,-8);near(s.loss,16);});
test('automatic differentiation agrees with independent numerical derivatives',()=>{for(const [u,v] of [[.3,-.7],[2,1],[4,3]]){const s=M.autodiff(u,v),e=1e-5;near(s.u,(M.values(u+e,v).loss-M.values(u-e,v).loss)/(2*e));near(s.v,(M.values(u,v+e).loss-M.values(u,v-e).loss)/(2*e));}});
test('updates use both gradients at the previous position',()=>{const first=M.update(1,1,.025),second=M.update(first.u,first.v,.025);near(first.u,1.6);near(first.v,1.2);near(first.p,6);near(first.loss,4);near(second.p,7);near(second.loss,1);near(M.update(1,1,.15).loss,64);});
test('tensor product follows the displayed row/column mapping',()=>{assert.deepEqual(M.tensorProduct(),[[6,9],[24,27]]);for(let i=0;i<12;i++){const b=Math.floor(i/6),r=Math.floor(i%6/3),c=i%3;assert.equal(b*6+r*3+c,i);}});
