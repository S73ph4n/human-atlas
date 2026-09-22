import {useEffect,useMemo,useRef} from 'react';
import {PointerTap} from './pointer-tap';
import {extractPlane,labelColors,planeSize,type CtVolume} from './ct';
import type {SliceAxis,SystemId} from './anatomy';
interface Props {volume:CtVolume;axis:SliceAxis;index:number;table:Uint8Array;overlay:boolean;opacity:number;systems:SystemId[];selected:number|null;onSelect:(id:number)=>void;onStep:(delta:number)=>void}
const SELECTED=[111,207,191];
export default function CtView({volume,axis,index,table,overlay,opacity,systems,selected,onSelect,onStep}:Props){
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),hover=useRef<HTMLDivElement>(null);
 const [w,h]=planeSize(volume.manifest.shape,axis);
 const plane=useMemo(()=>{const grey=document.createElement('canvas'),labels=document.createElement('canvas');grey.width=labels.width=w;grey.height=labels.height=h;return {grey,labels,pixels:new ImageData(w,h),ids:new Uint8Array(w*h)};},[w,h]);
 const colors=useMemo(()=>labelColors(volume.manifest.labels),[volume]);
 const names=useMemo(()=>new Map(volume.manifest.labels.map(l=>[l.id,l])),[volume]);
 const view=useRef({zoom:1,x:0,y:0}),draw=useRef(()=>{}),handlers=useRef({onSelect,onStep});handlers.current={onSelect,onStep};
 draw.current=()=>{
  const c=canvas.current,el=host.current;if(!c||!el)return;const dpr=Math.min(devicePixelRatio,2),cw=el.clientWidth,ch=el.clientHeight;
  if(c.width!==Math.round(cw*dpr)||c.height!==Math.round(ch*dpr)){c.width=Math.round(cw*dpr);c.height=Math.round(ch*dpr);}
  const ctx=c.getContext('2d')!,v=view.current,scale=Math.min(cw/w,ch/h)*v.zoom,ox=(cw-w*scale)/2+v.x,oy=(ch-h*scale)/2+v.y;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cw,ch);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(plane.grey,ox,oy,w*scale,h*scale);ctx.imageSmoothingEnabled=false;ctx.drawImage(plane.labels,ox,oy,w*scale,h*scale);
 };
 // Greyscale slice
 useEffect(()=>{extractPlane(volume,axis,index,table,plane.pixels.data,plane.ids);plane.grey.getContext('2d')!.putImageData(plane.pixels,0,0);},[volume,axis,index,table,plane]);
 // Label overlay: translucent fill plus a stronger boundary; the selection stays visible even with the overlay off.
 useEffect(()=>{
  const out=new ImageData(w,h),d=out.data,ids=plane.ids,shown=new Uint8Array(256);names.forEach(l=>{shown[l.id]=overlay&&systems.includes(l.system)?1:0;});
  for(let p=0;p<ids.length;p++){const id=ids[p];if(!id)continue;const isSelected=id===selected;if(!isSelected&&!shown[id])continue;const col=p%w,edge=(col>0&&ids[p-1]!==id)||(col<w-1&&ids[p+1]!==id)||(p>=w&&ids[p-w]!==id)||(p+w<ids.length&&ids[p+w]!==id);
   const rgb=isSelected?SELECTED:[colors[id*3],colors[id*3+1],colors[id*3+2]];d[p*4]=rgb[0];d[p*4+1]=rgb[1];d[p*4+2]=rgb[2];d[p*4+3]=Math.round(255*Math.min(1,isSelected?(edge?1:.55):edge?opacity+.4:opacity));}
  plane.labels.getContext('2d')!.putImageData(out,0,0);draw.current();
 },[volume,axis,index,table,plane,overlay,opacity,systems,selected,colors,names,w,h]);
 useEffect(()=>{view.current={zoom:1,x:0,y:0};draw.current();},[axis,volume]);
 useEffect(()=>{
  const c=canvas.current!,el=host.current!,tap=new PointerTap(),pointers=new Map<number,{x:number;y:number}>();let pinch=0;
  const observer=new ResizeObserver(()=>draw.current());observer.observe(el);
  const pixel=(clientX:number,clientY:number)=>{const r=el.getBoundingClientRect(),v=view.current,scale=Math.min(r.width/w,r.height/h)*v.zoom,col=Math.floor((clientX-r.left-(r.width-w*scale)/2-v.x)/scale),row=Math.floor((clientY-r.top-(r.height-h*scale)/2-v.y)/scale);return col>=0&&row>=0&&col<w&&row<h?plane.ids[row*w+col]:0;};
  const zoomAt=(clientX:number,clientY:number,factor:number)=>{const r=el.getBoundingClientRect(),v=view.current,next=Math.min(12,Math.max(1,v.zoom*factor)),k=next/v.zoom,px=clientX-r.left-r.width/2,py=clientY-r.top-r.height/2;v.x=px-(px-v.x)*k;v.y=py-(py-v.y)*k;v.zoom=next;if(next===1){v.x=0;v.y=0;}draw.current();};
  const showHover=(e:PointerEvent)=>{const box=hover.current!,id=e.pointerType==='touch'||e.buttons?0:pixel(e.clientX,e.clientY),label=names.get(id);box.hidden=!label;c.style.cursor=label?'pointer':'grab';if(label){const r=el.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;box.textContent=label.name;box.style.left=`${Math.max(8,Math.min(x+14,r.width-260))}px`;box.style.top=`${Math.max(8,Math.min(y+18,r.height-45))}px`;}};
  // Wheel scrolls through slices as in radiology viewers; Ctrl or ⌘ with the wheel (and trackpad pinch) zooms.
  const wheel=(e:WheelEvent)=>{e.preventDefault();if(e.ctrlKey||e.metaKey)zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.01));else if(Math.abs(e.deltaY)>=1)handlers.current.onStep(e.deltaY>0?-1:1);};
  const down=(e:PointerEvent)=>{c.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?10:4);pinch=0;hover.current!.hidden=true;};
  const move=(e:PointerEvent)=>{
   tap.move(e.pointerId,e.clientX,e.clientY);const last=pointers.get(e.pointerId);
   if(!last){showHover(e);return;}
   if(pointers.size===2){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)zoomAt((a.x+b.x)/2,(a.y+b.y)/2,distance/pinch);pinch=distance;return;}
   if(view.current.zoom>1){view.current.x+=e.clientX-last.x;view.current.y+=e.clientY-last.y;draw.current();}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  };
  const up=(e:PointerEvent)=>{pointers.delete(e.pointerId);pinch=0;if(tap.up(e.pointerId,e.clientX,e.clientY)){const id=pixel(e.clientX,e.clientY);if(id)handlers.current.onSelect(id);}};
  const cancel=(e:PointerEvent)=>{pointers.delete(e.pointerId);tap.cancel(e.pointerId);pinch=0;};
  const leave=()=>{hover.current!.hidden=true;};
  const reset=()=>{view.current={zoom:1,x:0,y:0};draw.current();};
  c.addEventListener('wheel',wheel,{passive:false});c.addEventListener('pointerdown',down);c.addEventListener('pointermove',move);c.addEventListener('pointerup',up);c.addEventListener('pointercancel',cancel);c.addEventListener('pointerleave',leave);c.addEventListener('dblclick',reset);
  return()=>{observer.disconnect();c.removeEventListener('wheel',wheel);c.removeEventListener('pointerdown',down);c.removeEventListener('pointermove',move);c.removeEventListener('pointerup',up);c.removeEventListener('pointercancel',cancel);c.removeEventListener('pointerleave',leave);c.removeEventListener('dblclick',reset);};
 },[plane,names,w,h]);
 return <div className="ct-view" ref={host}><canvas ref={canvas} aria-label="CT slice. Scroll to move through slices, Ctrl or ⌘ and scroll to zoom, drag to pan when zoomed, and tap a labelled structure to inspect it."/><div className="part-hover" ref={hover} role="tooltip" hidden/></div>;
}
