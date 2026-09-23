/** Radioanatomy quiz: an unannotated slice with an arrow, and four names to choose from.
 *  Questions are built from the label volume already in memory. Every label can be asked, including small ones and
 *  the ones a model generated, and the slice is drawn at random from all the slices the structure appears on, not
 *  just its widest: a structure looks different near its edge, which is the point of the exercise. The arrow points
 *  at the deepest interior pixel of the cross-section, so a label whose boundary is imprecise still gives a fair
 *  question, and it arrives from whichever direction crosses the least other anatomy. */
import {CT_AXIS,planeSize,voxelAt,type CtLabel,type CtVolume} from './ct';
import {groupOf,type SliceAxis} from './anatomy';
export interface Question {labelId:number;axis:SliceAxis;index:number;voxel:[number,number,number];tip:[number,number];tail:[number,number];choices:number[]}
/** Smallest cross-section worth pointing at; below it the arrowhead would cover the structure. */
const MIN_PIXELS=2,CHOICES=4;
/** Arrow length as a share of the smaller image side, so it looks the same whatever the study's grid. */
const arrowLength=(w:number,h:number)=>Math.max(14,Math.min(60,Math.round(Math.min(w,h)*.12)));
/** Directions the arrow may come from, every 22.5°. */
const DIRECTIONS=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)] as [number,number]);
const pick=<T,>(items:T[],random:()=>number)=>items[Math.floor(random()*items.length)];

/** How many pixels of one label each slice along an axis holds, scanning only the label's bounding box. */
function sliceCounts(volume:CtVolume,label:CtLabel,axis:SliceAxis){
 const [X,Y]=volume.manifest.shape,coordinate=CT_AXIS[axis],counts=new Int32Array(volume.manifest.shape[coordinate]);
 const [x0,y0,z0]=label.min,[x1,y1,z1]=label.max,voxels=volume.labels;
 for(let z=z0;z<=z1;z++)for(let y=y0;y<=y1;y++){const row=X*(y+Y*z);
  for(let x=x0;x<=x1;x++)if(voxels[x+row]===label.id)counts[coordinate===0?x:coordinate===1?y:z]++;}
 return counts;
}

/** The label under every pixel of one slice, in the orientation the viewer draws. */
function sliceIds(volume:CtVolume,axis:SliceAxis,index:number){
 const shape=volume.manifest.shape,[X,Y]=shape,[w,h]=planeSize(shape,axis),ids=new Uint16Array(w*h);
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){const [x,y,z]=voxelAt(shape,axis,index,col,row);ids[row*w+col]=volume.labels[x+X*(y+Y*z)];}
 return ids;
}

/** Chamfer distance to the outside of the mask in two passes; the deepest pixel is the one an arrow can point at
 *  without ambiguity. Null when the label is absent from the slice. */
function deepestPixel(ids:Uint16Array,labelId:number,w:number,h:number):[number,number]|null{
 const distance=new Float32Array(w*h);
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){const p=row*w+col;
  if(ids[p]!==labelId){distance[p]=0;continue;}
  distance[p]=Math.min(row>0?distance[p-w]+1:1,col>0?distance[p-1]+1:1,row>0&&col>0?distance[p-w-1]+1.414:1.414,row>0&&col<w-1?distance[p-w+1]+1.414:1.414);}
 let best=-1,at=-1;
 for(let row=h-1;row>=0;row--)for(let col=w-1;col>=0;col--){const p=row*w+col;
  if(ids[p]!==labelId)continue;
  distance[p]=Math.min(distance[p],row<h-1?distance[p+w]+1:1,col<w-1?distance[p+1]+1:1,row<h-1&&col<w-1?distance[p+w+1]+1.414:1.414,row<h-1&&col>0?distance[p+w-1]+1.414:1.414);
  if(distance[p]>best){best=distance[p];at=p;}}
 return at<0?null:[at%w,Math.floor(at/w)];
}

/** Where the arrow comes from: the direction whose path crosses the fewest other structures and stays in frame. */
function arrowTail(ids:Uint16Array,labelId:number,w:number,h:number,[tipCol,tipRow]:[number,number]):[number,number]{
 const length=arrowLength(w,h);
 let best:[number,number]=[tipCol+length,tipRow],bestCost=Infinity;
 for(const [dx,dy] of DIRECTIONS){
  let cost=0;
  for(let step=4;step<=length;step++){
   const col=Math.round(tipCol+dx*step),row=Math.round(tipRow+dy*step);
   if(col<1||row<1||col>=w-1||row>=h-1){cost+=6*(length-step+1);break;}
   const id=ids[row*w+col];cost+=id===labelId?3:id?1:0; // running along the structure hides it; crossing neighbours is untidy
  }
  if(cost<bestCost){bestCost=cost;best=[tipCol+dx*length,tipRow+dy*length];}
 }
 return [Math.max(2,Math.min(w-2,best[0])),Math.max(2,Math.min(h-2,best[1]))];
}

/** Three plausible wrong answers: structures of the same group or system first, then the nearest ones. */
function distractors(labels:CtLabel[],target:CtLabel,random:()=>number){
 const distance=(l:CtLabel)=>Math.hypot(l.center[0]-target.center[0],l.center[1]-target.center[1],l.center[2]-target.center[2]);
 const pool=labels.filter(l=>l.id!==target.id&&l.name!==target.name).map(l=>({label:l,score:(groupOf(l)===groupOf(target)?400:0)-distance(l)}))
  .sort((a,b)=>b.score-a.score).slice(0,Math.max(CHOICES*3,9));
 const chosen:CtLabel[]=[];
 while(chosen.length<CHOICES-1&&pool.length)chosen.push(pool.splice(Math.floor(random()*pool.length),1)[0].label);
 return chosen;
}

/** The labels a question can point at: those with a cross-section of at least MIN_PIXELS on some slice. */
export function askableLabels(volume:CtVolume,axes:SliceAxis[]){
 return volume.manifest.labels.filter(label=>axes.some(axis=>sliceCounts(volume,label,axis).some(count=>count>=MIN_PIXELS))).map(l=>l.id);
}

/** One question, or null when nothing in the volume can be asked. Labels in `recent` are skipped while others remain. */
export function makeQuestion(volume:CtVolume,axes:SliceAxis[],recent:number[]=[],random:()=>number=Math.random):Question|null{
 const labels=volume.manifest.labels;
 if(labels.length<2||!axes.length)return null;
 const fresh=labels.filter(l=>!recent.includes(l.id)),candidates=fresh.length?fresh:labels;
 for(let attempt=0;attempt<24;attempt++){
  const label=pick(candidates,random),axis=pick(axes,random),counts=sliceCounts(volume,label,axis),usable:number[]=[];
  for(let index=0;index<counts.length;index++)if(counts[index]>=MIN_PIXELS)usable.push(index);
  if(!usable.length)continue;
  const index=pick(usable,random),[w,h]=planeSize(volume.manifest.shape,axis),ids=sliceIds(volume,axis,index),tip=deepestPixel(ids,label.id,w,h);
  if(!tip)continue;
  const voxel=voxelAt(volume.manifest.shape,axis,index,tip[0],tip[1]),choices=[label,...distractors(labels,label,random)].map(l=>l.id);
  for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
  return {labelId:label.id,axis,index,voxel,tip,tail:arrowTail(ids,label.id,w,h,tip),choices};
 }
 return null;
}
