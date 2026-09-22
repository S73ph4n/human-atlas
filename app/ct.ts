import {decodeModelResponse} from './model-download';
import {SYSTEMS,type SliceAxis,type SystemId} from './anatomy';
export interface CtLabel {id:number;key:string;name:string;system:SystemId;generated?:boolean;voxels:number;center:[number,number,number];min:[number,number,number];max:[number,number,number]}
export interface CtManifest {id:string;source:string;license:string;citation:string;shape:[number,number,number];spacing:[number,number,number];orientation:'RAS';bits?:8|16;huKnots:[number,number][];files:Record<'ct'|'labels',{url:string;bytes:number;gzipBytes:number}>;labels:CtLabel[]}
export interface CtVolume {manifest:CtManifest;ct:Uint8Array|Uint16Array;labels:Uint8Array}
/** Each study opens centred on its start label. */
export const CT_STUDIES=[{id:'s0476',name:'Chest – pelvis',manifest:'/ct/s0476/ct.json',start:'heart'},{id:'s0777',name:'Head & neck',manifest:'/ct/s0777/ct.json',start:'oropharynx'}] as const;
export type CtStudy=typeof CT_STUDIES[number]['id'];
export const CT_WINDOWS=[{id:'soft',name:'Soft tissue',width:400,level:40},{id:'lung',name:'Lung',width:1500,level:-600},{id:'bone',name:'Bone',width:1800,level:400},{id:'brain',name:'Brain',width:80,level:40}] as const;
export type CtWindow=typeof CT_WINDOWS[number]['id'];
// Voxel axes (RAS): +x patient right, +y anterior, +z superior. Each plane's slice index runs along this voxel axis.
export const CT_AXIS:Record<SliceAxis,0|1|2>={axial:2,coronal:1,sagittal:0};

export async function loadCt(url:string,onProgress:(n:number)=>void,signal:AbortSignal):Promise<CtVolume>{
 const response=await fetch(url,{signal});if(!response.ok)throw new Error('The CT study could not be loaded.');
 const manifest=await response.json() as CtManifest,files=[manifest.files.ct,manifest.files.labels];let done=0;onProgress(5);
 const [ct,labels]=await Promise.all(files.map(async f=>{const buffer=await decodeModelResponse(await fetch(f.url,{signal}),f.bytes,typeof DecompressionStream!=='undefined');onProgress(Math.round(5+95*(done+=f.gzipBytes)/(files[0].gzipBytes+files[1].gzipBytes)));return buffer;}));
 return {manifest,ct:manifest.bits===16?new Uint16Array(ct):new Uint8Array(ct),labels:new Uint8Array(labels)};
}

/** Stored code → display grey for a window, via the manifest's piecewise-linear HU coding (one entry per code). */
export function windowTable(knots:[number,number][],width:number,level:number){
 const size=knots[knots.length-1][0]+1,table=new Uint8Array(size);
 for(let code=0;code<size;code++){let k=0;while(k<knots.length-2&&code>knots[k+1][0])k++;const [c0,h0]=knots[k],[c1,h1]=knots[k+1],hu=h0+(h1-h0)*(code-c0)/(c1-c0);table[code]=Math.round(Math.min(1,Math.max(0,(hu-(level-width/2))/width))*255);}
 return table;
}

/** Label colours start from the system colour; neighbouring labels of one system alternate in lightness. */
export function labelColors(labels:CtLabel[]){
 const colors=new Uint8Array(256*3);
 labels.forEach(l=>{const base=SYSTEMS.find(s=>s.id===l.system)?.color??'#aebbb8',rgb=[1,3,5].map(i=>parseInt(base.slice(i,i+2),16)),shift=[1.25,.8,1.1,.9][l.id%4];rgb.forEach((v,i)=>colors[l.id*3+i]=Math.min(255,Math.round(v*shift)));});
 return colors;
}

/** Image size of a plane, in voxels, displayed in radiological orientation. */
export function planeSize([X,Y,Z]:[number,number,number],axis:SliceAxis):[number,number]{return axis==='axial'?[X,Y]:axis==='coronal'?[X,Z]:[Y,Z];}

/** Voxel under an image pixel. Axial: seen from the feet, anterior up. Coronal: seen from the front. Both put the patient's right on the image left.
 * Sagittal: seen from the patient's left, anterior on the image left. */
export function voxelAt([X,Y,Z]:[number,number,number],axis:SliceAxis,index:number,col:number,row:number):[number,number,number]{
 if(axis==='axial')return [X-1-col,Y-1-row,index];
 if(axis==='coronal')return [X-1-col,index,Z-1-row];
 return [index,Y-1-col,Z-1-row];
}

/** Writes the greyscale slice and the label slice (label ids per pixel) for one plane. */
export function extractPlane(volume:CtVolume,axis:SliceAxis,index:number,table:Uint8Array,grey:Uint8ClampedArray,ids:Uint8Array){
 const [X,Y,Z]=volume.manifest.shape,[w,h]=planeSize(volume.manifest.shape,axis),{ct,labels}=volume;
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){
  const [x,y,z]=voxelAt([X,Y,Z],axis,index,col,row),v=x+X*(y+Y*z),p=row*w+col,g=table[ct[v]];
  grey[p*4]=grey[p*4+1]=grey[p*4+2]=g;grey[p*4+3]=255;ids[p]=labels[v];
 }
}
