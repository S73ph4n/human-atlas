import {useEffect,useMemo,useRef,type CSSProperties} from 'react';
import {PointerTap} from './pointer-tap';
import {extractPlane,labelColors,planeSize,type CtImage,type CtVolume} from './ct';
import type {SliceAxis} from './anatomy';
/** shown[id] is 1 for labels drawn in the overlay. marker points at a structure without naming it (quiz), and
 *  quiet withholds the names the viewer would otherwise reveal on hover or on tap. cursor is the shared 3D point on this
 *  plane (image col, row); with onPoint set it is drawn as a reticle that taps and drags move. tag names the pane. */
interface Props {volume:CtVolume;image:CtImage;axis:SliceAxis;index:number;table:Uint8Array;overlay:boolean;opacity:number;shown:Uint8Array;selected:number|null;marker?:{axis:SliceAxis;index:number;tip:[number,number];tail:[number,number]}|null;quiet?:boolean;cursor?:[number,number]|null;tag?:string;active?:boolean;className?:string;label?:string;nameOf?:(name:string)=>string;onSelect:(id:number)=>void;onStep:(delta:number)=>void;onPoint?:(col:number,row:number)=>void;onActivate?:()=>void}
const SELECTED=[111,207,191];
/** Each plane keeps one colour, on its pane and wherever its line crosses another pane. */
export const PLANE_COLORS:Record<SliceAxis,string>={axial:'#e8695f',coronal:'#5cbf7a',sagittal:'#e6c34f'};
/** The planes a pane's reticle lines stand for: [vertical line, horizontal line]. */
const RETICLE:Record<SliceAxis,[SliceAxis,SliceAxis]>={axial:['sagittal','coronal'],coronal:['sagittal','axial'],sagittal:['coronal','axial']};
/** Reticle lines across the image, broken around the crossing so the point itself stays visible. */
function drawReticle(ctx:CanvasRenderingContext2D,axis:SliceAxis,x:number,y:number,left:number,top:number,right:number,bottom:number){
 const [vertical,horizontal]=RETICLE[axis],gap=9;
 ctx.save();ctx.lineCap='butt';
 for(const [color,width] of [['#0d162080',3.5],[null,1.5]] as [string|null,number][]){
  ctx.lineWidth=width;
  ctx.strokeStyle=color??PLANE_COLORS[vertical];ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,y-gap);ctx.moveTo(x,y+gap);ctx.lineTo(x,bottom);ctx.stroke();
  ctx.strokeStyle=color??PLANE_COLORS[horizontal];ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(x-gap,y);ctx.moveTo(x+gap,y);ctx.lineTo(right,y);ctx.stroke();
 }
 ctx.restore();
}
/** A quiz arrow: dark halo under a white shaft so it reads over both air and bone, stopping short of its target. */
function drawArrow(ctx:CanvasRenderingContext2D,tipX:number,tipY:number,tailX:number,tailY:number){
 const dx=tipX-tailX,dy=tipY-tailY,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length,gap=7,head=11;
 const endX=tipX-ux*gap,endY=tipY-uy*gap;
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 for(const [color,width] of [['#0d1620cc',5.5],['#ffffff',2.5]] as [string,number][]){
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;
  ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.lineTo(endX-ux*head*.6,endY-uy*head*.6);ctx.stroke();
  ctx.beginPath();ctx.moveTo(endX,endY);
  ctx.lineTo(endX-ux*head-uy*head*.42,endY-uy*head+ux*head*.42);
  ctx.lineTo(endX-ux*head+uy*head*.42,endY-uy*head-ux*head*.42);
  ctx.closePath();ctx.fill();ctx.stroke();
 }
 ctx.restore();
}
export default function CtView({volume,image,axis,index,table,overlay,opacity,shown,selected,marker,quiet,cursor,tag,active,className='ct-view',label,nameOf,onSelect,onStep,onPoint,onActivate}:Props){
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),hover=useRef<HTMLDivElement>(null);
 const [w,h]=planeSize(volume.manifest.shape,axis);
 const plane=useMemo(()=>{const grey=document.createElement('canvas'),labels=document.createElement('canvas');grey.width=labels.width=w;grey.height=labels.height=h;return {grey,labels,pixels:new ImageData(w,h),ids:new Uint16Array(w*h)};},[w,h]);
 const colors=useMemo(()=>labelColors(volume.manifest.labels),[volume]);
 const names=useMemo(()=>new Map(volume.manifest.labels.map(l=>[l.id,l])),[volume]);
 const view=useRef({zoom:1,x:0,y:0}),draw=useRef(()=>{}),handlers=useRef({onSelect,onStep,onPoint,onActivate,nameOf}),silent=useRef(!!quiet),point=useRef(cursor);handlers.current={onSelect,onStep,onPoint,onActivate,nameOf};silent.current=!!quiet;point.current=cursor;
 draw.current=()=>{
  const c=canvas.current,el=host.current;if(!c||!el)return;const dpr=Math.min(devicePixelRatio,2),cw=el.clientWidth,ch=el.clientHeight;
  if(c.width!==Math.round(cw*dpr)||c.height!==Math.round(ch*dpr)){c.width=Math.round(cw*dpr);c.height=Math.round(ch*dpr);}
  const ctx=c.getContext('2d')!,v=view.current,scale=Math.min(cw/w,ch/h)*v.zoom,ox=(cw-w*scale)/2+v.x,oy=(ch-h*scale)/2+v.y;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cw,ch);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(plane.grey,ox,oy,w*scale,h*scale);ctx.imageSmoothingEnabled=false;ctx.drawImage(plane.labels,ox,oy,w*scale,h*scale);
  const m=marker;
  if(m&&m.axis===axis&&m.index===index)drawArrow(ctx,ox+(m.tip[0]+.5)*scale,oy+(m.tip[1]+.5)*scale,ox+(m.tail[0]+.5)*scale,oy+(m.tail[1]+.5)*scale);
  if(cursor&&onPoint)drawReticle(ctx,axis,ox+(cursor[0]+.5)*scale,oy+(cursor[1]+.5)*scale,Math.max(0,ox),Math.max(0,oy),Math.min(cw,ox+w*scale),Math.min(ch,oy+h*scale));
 };
 // Greyscale slice
 useEffect(()=>{extractPlane(volume,image,axis,index,table,plane.pixels.data,plane.ids);plane.grey.getContext('2d')!.putImageData(plane.pixels,0,0);},[volume,image,axis,index,table,plane]);
 // Label overlay: translucent fill plus a stronger boundary; the selection stays visible even with the overlay off.
 useEffect(()=>{
  const out=new ImageData(w,h),d=out.data,ids=plane.ids;
  for(let p=0;p<ids.length;p++){const id=ids[p];if(!id)continue;const isSelected=id===selected;if(!isSelected&&!(overlay&&shown[id]))continue;const col=p%w,edge=(col>0&&ids[p-1]!==id)||(col<w-1&&ids[p+1]!==id)||(p>=w&&ids[p-w]!==id)||(p+w<ids.length&&ids[p+w]!==id);
   const rgb=isSelected?SELECTED:[colors[id*3],colors[id*3+1],colors[id*3+2]];d[p*4]=rgb[0];d[p*4+1]=rgb[1];d[p*4+2]=rgb[2];d[p*4+3]=Math.round(255*Math.min(1,isSelected?(edge?1:.55):edge?opacity+.4:opacity));}
  plane.labels.getContext('2d')!.putImageData(out,0,0);draw.current();
 },[volume,image,axis,index,table,plane,overlay,opacity,shown,selected,colors,w,h]);
 useEffect(()=>{view.current={zoom:1,x:0,y:0};draw.current();},[axis,volume]);
 useEffect(()=>{draw.current();},[marker,cursor?.[0],cursor?.[1],!onPoint]);
 useEffect(()=>{
  const c=canvas.current!,el=host.current!,tap=new PointerTap(),pointers=new Map<number,{x:number;y:number}>();let pinch=0,grab:{col:boolean;row:boolean}|null=null;
  const observer=new ResizeObserver(()=>draw.current());observer.observe(el);
  // Screen ↔ image: scale and the image's top-left corner inside the pane.
  const frame=()=>{const r=el.getBoundingClientRect(),v=view.current,scale=Math.min(r.width/w,r.height/h)*v.zoom;return {r,scale,ox:r.left+(r.width-w*scale)/2+v.x,oy:r.top+(r.height-h*scale)/2+v.y};};
  const imageAt=(clientX:number,clientY:number)=>{const {scale,ox,oy}=frame();return [Math.floor((clientX-ox)/scale),Math.floor((clientY-oy)/scale)];};
  const pixel=(clientX:number,clientY:number)=>{const [col,row]=imageAt(clientX,clientY);return col>=0&&row>=0&&col<w&&row<h?plane.ids[row*w+col]:0;};
  const movePoint=(clientX:number,clientY:number,move:{col:boolean;row:boolean})=>{const p=point.current,set=handlers.current.onPoint;if(!p||!set)return;const [col,row]=imageAt(clientX,clientY);set(move.col?Math.min(w-1,Math.max(0,col)):p[0],move.row?Math.min(h-1,Math.max(0,row)):p[1]);};
  // Which reticle lines sit under the pointer: grabbing one moves only its plane, grabbing the crossing moves both.
  const reticleAt=(clientX:number,clientY:number,reach:number)=>{const p=point.current;if(!p||!handlers.current.onPoint)return null;const {scale,ox,oy}=frame(),col=Math.abs(clientX-ox-(p[0]+.5)*scale)<=reach,row=Math.abs(clientY-oy-(p[1]+.5)*scale)<=reach;return col||row?{col,row}:null;};
  const zoomAt=(clientX:number,clientY:number,factor:number)=>{const r=el.getBoundingClientRect(),v=view.current,next=Math.min(12,Math.max(1,v.zoom*factor)),k=next/v.zoom,px=clientX-r.left-r.width/2,py=clientY-r.top-r.height/2;v.x=px-(px-v.x)*k;v.y=py-(py-v.y)*k;v.zoom=next;if(next===1){v.x=0;v.y=0;}draw.current();};
  const showHover=(e:PointerEvent)=>{const box=hover.current!,id=e.pointerType==='touch'||e.buttons||silent.current?0:pixel(e.clientX,e.clientY),label=names.get(id),line=e.pointerType==='touch'?null:reticleAt(e.clientX,e.clientY,6);box.hidden=!label;c.style.cursor=line?(line.col&&line.row?'move':line.col?'ew-resize':'ns-resize'):label?'pointer':handlers.current.onPoint&&point.current?'crosshair':'grab';if(label){const r=el.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;box.textContent=handlers.current.nameOf?.(label.name)??label.name;box.style.left=`${Math.max(8,Math.min(x+14,r.width-260))}px`;box.style.top=`${Math.max(8,Math.min(y+18,r.height-45))}px`;}};
  // Wheel scrolls through slices as in radiology viewers; Ctrl or ⌘ with the wheel (and trackpad pinch) zooms.
  const wheel=(e:WheelEvent)=>{e.preventDefault();handlers.current.onActivate?.();if(e.ctrlKey||e.metaKey)zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.01));else if(Math.abs(e.deltaY)>=1)handlers.current.onStep(e.deltaY>0?-1:1);};
  // With a reticle, a drag moves it: from a line or with Shift always, and from anywhere while the image is not zoomed (zoomed, it pans).
  const down=(e:PointerEvent)=>{c.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?10:4);pinch=0;hover.current!.hidden=true;handlers.current.onActivate?.();
   grab=pointers.size>1?null:reticleAt(e.clientX,e.clientY,e.pointerType==='touch'?16:6)??(handlers.current.onPoint&&point.current&&(e.shiftKey||view.current.zoom===1)?{col:true,row:true}:null);};
  const move=(e:PointerEvent)=>{
   tap.move(e.pointerId,e.clientX,e.clientY);const last=pointers.get(e.pointerId);
   if(!last){showHover(e);return;}
   if(grab&&pointers.size===1){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});movePoint(e.clientX,e.clientY,grab);return;}
   if(pointers.size===2){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)zoomAt((a.x+b.x)/2,(a.y+b.y)/2,distance/pinch);pinch=distance;return;}
   if(view.current.zoom>1){view.current.x+=e.clientX-last.x;view.current.y+=e.clientY-last.y;draw.current();}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  };
  // A tap moves the reticle there and, on a labelled structure, inspects it.
  const up=(e:PointerEvent)=>{pointers.delete(e.pointerId);pinch=0;grab=null;if(tap.up(e.pointerId,e.clientX,e.clientY)&&!silent.current){movePoint(e.clientX,e.clientY,{col:true,row:true});const id=pixel(e.clientX,e.clientY);if(id)handlers.current.onSelect(id);}};
  const cancel=(e:PointerEvent)=>{pointers.delete(e.pointerId);tap.cancel(e.pointerId);pinch=0;grab=null;};
  const leave=()=>{hover.current!.hidden=true;};
  const reset=()=>{view.current={zoom:1,x:0,y:0};draw.current();};
  c.addEventListener('wheel',wheel,{passive:false});c.addEventListener('pointerdown',down);c.addEventListener('pointermove',move);c.addEventListener('pointerup',up);c.addEventListener('pointercancel',cancel);c.addEventListener('pointerleave',leave);c.addEventListener('dblclick',reset);
  return()=>{observer.disconnect();c.removeEventListener('wheel',wheel);c.removeEventListener('pointerdown',down);c.removeEventListener('pointermove',move);c.removeEventListener('pointerup',up);c.removeEventListener('pointercancel',cancel);c.removeEventListener('pointerleave',leave);c.removeEventListener('dblclick',reset);};
 },[plane,names,w,h]);
 return <div className={`${className} ${active?'active':''}`} ref={host} style={tag?{'--plane':PLANE_COLORS[axis]} as CSSProperties:undefined}>{tag&&<span className="ct-tag">{tag}</span>}<canvas ref={canvas} aria-label={label??"CT slice. Scroll to move through slices, Ctrl or ⌘ and scroll to zoom, drag to pan when zoomed, and tap a labelled structure to inspect it."}/><div className="part-hover" ref={hover} role="tooltip" hidden/></div>;
}
