/** Checks the radioanatomy quiz against every study: each arrow lands inside the structure it asks about, the
 *  choices are distinct and contain the answer, virtually every label can be asked, and the quiz settings hold —
 *  a narrowed quiz stays inside its planes and its structure types, answers and wrong answers alike.
 *  Run: node scripts/validate-quiz.mjs */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {gunzipSync} from 'node:zlib';
// The app's own imports leave the extension out, as bundlers expect; node needs it spelled.
registerHooks({resolve(specifier,context,next){
 try{return next(specifier,context);}
 catch(error){if(/^\.{1,2}\//.test(specifier))return next(`${specifier}.ts`,context);throw error;}
}});
const {askableLabels,makeQuestion,quizPool}=await import('../app/quiz.ts');
const {groupOf}=await import('../app/anatomy.ts');
const {CT_AXIS,planeSize}=await import('../app/ct.ts');

const QUESTIONS=200;
const studies=['ct/s0476/ct.json','ct/s0777/ct.json','ct/spl-ear/study.json','mri/spl-brain/study.json','mri/amos-0590/study.json','mri/spl-knee/study.json'];
/** Deterministic, so a failure can be reproduced. */
const rng=seed=>()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const axes=['axial','coronal','sagittal'];

for(const path of studies){
 const manifest=JSON.parse(await readFile(new URL(`../public/${path}`,import.meta.url)));
 const raw=gunzipSync(await readFile(new URL(`../public${manifest.files.labels.url}`,import.meta.url)));
 const labels=manifest.files.labels.bits===16?new Uint16Array(raw.buffer,raw.byteOffset,raw.byteLength/2):new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);
 const volume={manifest,labels,ct:labels,series:{}};
 const [X,Y]=manifest.shape;
 const askable=askableLabels(volume,axes);
 assert.ok(askable.length>=manifest.labels.length-1,`${manifest.id}: ${manifest.labels.length-askable.length} labels can never be asked`);
 const random=rng(20260923),seen=new Set();
 for(let i=0;i<QUESTIONS;i++){
  const q=makeQuestion(volume,axes,[],random);
  assert.ok(q,`${manifest.id}: no question could be built`);
  const [x,y,z]=q.voxel;
  assert.equal(labels[x+X*(y+Y*z)],q.labelId,`${manifest.id}: the arrow points outside ${q.labelId} at ${q.axis} ${q.index}`);
  assert.ok(q.index>=0&&q.index<manifest.shape[CT_AXIS[q.axis]],`${manifest.id}: slice ${q.index} is out of range`);
  const [w,h]=planeSize(manifest.shape,q.axis);
  for(const [col,row] of [q.tip,q.tail]) assert.ok(col>=0&&row>=0&&col<w&&row<h,`${manifest.id}: arrow point outside the image`);
  assert.equal(new Set(q.choices).size,q.choices.length,`${manifest.id}: repeated choice`);
  assert.ok(q.choices.includes(q.labelId),`${manifest.id}: the answer is not among the choices`);
  assert.equal(q.choices.length,Math.min(4,manifest.labels.length),`${manifest.id}: wrong number of choices`);
  seen.add(q.labelId);
 }
 // Settings: one plane and every group but the first. Both the answer and the wrong answers must stay in the pool.
 const groups=[...new Set(manifest.labels.map(groupOf))];
 const pool=quizPool(manifest.labels,groups.slice(0,1),false),ids=new Set(pool.map(l=>l.id));
 if(pool.length>=2){
  const narrow=rng(4711);
  for(let i=0;i<QUESTIONS;i++){
   const q=makeQuestion(volume,['coronal'],[],narrow,pool);
   assert.ok(q,`${manifest.id}: no question inside the chosen structure types`);
   assert.equal(q.axis,'coronal',`${manifest.id}: asked on ${q.axis}, which the settings exclude`);
   for(const id of q.choices) assert.ok(ids.has(id),`${manifest.id}: choice ${id} is outside the chosen structure types`);
  }
 }
 assert.equal(makeQuestion(volume,[],[],random),null,`${manifest.id}: a question was built with no plane selected`);
 assert.equal(makeQuestion(volume,axes,[],random,pool.slice(0,1)),null,`${manifest.id}: a question was built from one structure`);
 console.log(`${manifest.id.padEnd(10)} ${QUESTIONS} questions, ${seen.size} different structures asked, ${askable.length}/${manifest.labels.length} askable, ${pool.length} in the narrowed pool`);
}
console.log('quiz ok');
