import {useEffect,useRef} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {createExplosionLayout} from './explosion-layout';
import {decodeModelResponse} from './model-download';
import {PointerTap} from './pointer-tap';
import {ATTENUATION_SCALE} from './ct';
import {PLANE_COLORS,SLICE_AXES,SYSTEMS,groupOf,type Atlas,type SceneState,type SystemId} from './anatomy';
// Cross-sections paint enclosing tissues first so the structures inside them stay on top.
const CAP_ORDER:SystemId[]=['integumentary','connective','muscular','respiratory','digestive','urinary','reproductive','endocrine','lymphatic','cardiac','skeletal','sensory','nervous','venous','arterial'];
/** Errors are reported in English and translated where they are shown; label and nameOf localise the canvas and its hover names. */
/** onPoint reports the voxel tapped on a study's slice image, so the reticle can move there as it does in 2D. */
interface Props {atlas:Atlas;state:SceneState;label?:string;nameOf?:(name:string)=>string;onPoint?:(voxel:[number,number,number])=>void;onSelect:(id:string)=>void;onProgress:(n:number)=>void;onError:(s:string)=>void}
export default function AnatomyScene({atlas,state,label,nameOf,onPoint,onSelect,onProgress,onError}:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(state),select=useRef(onSelect),naming=useRef(nameOf),pointing=useRef(onPoint);
 latest.current=state;select.current=onSelect;naming.current=nameOf;pointing.current=onPoint;
 useEffect(()=>{
  const el=host.current!;let disposed=false,frame=0,dirty=true,ready=false,lastView='',lastReset=-1,lastIsolate='',layoutKey='',amount=0;
  let lastState:SceneState|null=null,lastMove=0;
  const abort=new AbortController();
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{onError('This browser could not start the 3D viewer. Please try a browser with WebGL enabled.');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<768?1.5:2));renderer.setClearColor('#f2f3f3');renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Interactive human anatomy. Drag to orbit, pinch or scroll to zoom, and tap a structure to inspect it.');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.005,100),controls=new OrbitControls(camera,renderer.domElement);
  camera.position.set(1.4,1.05,3.6);controls.target.set(0,.85,0);controls.enableDamping=true;controls.dampingFactor=.085;controls.minDistance=.07;controls.maxDistance=40;controls.maxPolarAngle=Math.PI*.96;controls.addEventListener('change',()=>{dirty=true;lastMove=performance.now();});
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff,0xa7acb2,1.05));
  const key=new T.DirectionalLight(0xfffaf4,2.3);key.position.set(-2,4,3);scene.add(key);
  const rim=new T.DirectionalLight(0xe9f0ff,1.8);rim.position.set(2,2,-3);scene.add(rim);
  const ground=new T.Mesh(new T.CircleGeometry(30,96),new T.MeshStandardMaterial({color:0xd5d9dc,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.019;scene.add(ground);
  const platform=new T.Mesh(new T.CylinderGeometry(.68,.7,.028,100),new T.MeshStandardMaterial({color:0xeeeeec,metalness:.12,roughness:.67}));platform.position.y=-.016;scene.add(platform);
  const ring=new T.Mesh(new T.RingGeometry(.63,.632,128),new T.MeshBasicMaterial({color:0x8c969f,transparent:true,opacity:.4,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.001;scene.add(ring);
  const innerRing=new T.Mesh(new T.RingGeometry(.55,.551,128),new T.MeshBasicMaterial({color:0xa4aeb8,transparent:true,opacity:.16,side:T.DoubleSide}));innerRing.rotation.x=-Math.PI/2;innerRing.position.y=.001;scene.add(innerRing);
  const width=T.MathUtils.ceilPowerOfTwo(atlas.parts.length),data=new Float32Array(width*4),partTexture=new T.DataTexture(data,width,1,T.RGBAFormat,T.FloatType);partTexture.needsUpdate=true;
  const selectedData=new Uint8Array(width*4),selectionTexture=new T.DataTexture(selectedData,width,1);selectionTexture.needsUpdate=true;
  const materials:T.Material[]=[],geometries:T.BufferGeometry[]=[],pickers:(T.Mesh|undefined)[]=[],centers=atlas.parts.map(p=>new T.Vector3().fromArray(p.bounds[0]).add(new T.Vector3().fromArray(p.bounds[1])).multiplyScalar(.5));
  const offsets:T.Vector3[]=[],bounds=atlas.parts.map(p=>new T.Box3(new T.Vector3().fromArray(p.bounds[0]),new T.Vector3().fromArray(p.bounds[1])));
  const modelBox=new T.Box3();atlas.parts.forEach(p=>{modelBox.expandByPoint(new T.Vector3().fromArray(p.bounds[0]));modelBox.expandByPoint(new T.Vector3().fromArray(p.bounds[1]));});
  // Height usually limits the framing; width only matters for models wider than about 1.2× their height.
  const modelSize=modelBox.getSize(new T.Vector3()),scale=Math.max(.04,Math.max(modelSize.y,modelSize.x*1.2)/1.73);
  // Reconstructed study models carry one colour per structure as a vertex attribute.
  const tinted=atlas.parts.some(p=>p.color);
  let packingWidth=1,packingHeight=1,lastSlice='',lastSlicePosition:number|null=null;
  const sliceUniforms={slicePlane:{value:new T.Vector4()},sliceActive:{value:0}},xrayUniforms={xrayActive:{value:0}};let lastXray='',ghostsOn=false;
  // Image mode (reconstructed study models): the study's slice on the cutting plane, with the clipped anatomy around it.
  const imageGeometry=new T.BufferGeometry();imageGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(12),3));imageGeometry.setAttribute('uv',new T.BufferAttribute(new Float32Array([0,1,1,1,0,0,1,0]),2));imageGeometry.setIndex([0,2,1,1,2,3]);
  const imageMaterial=new T.MeshBasicMaterial({side:T.DoubleSide,toneMapped:false,alphaTest:.5}),imagePlane=new T.Mesh(imageGeometry,imageMaterial);imagePlane.visible=false;imagePlane.frustumCulled=false;
  let imageTexture:T.CanvasTexture|null=null,imageCanvas:HTMLCanvasElement|null=null,lastImage=-1,lastSliceView='';
  const normalMeshes:T.Object3D[]=[],sliceObjects:T.Object3D[]=[],caps:T.Mesh[]=[],pickerMaterial=new T.MeshBasicMaterial(),capGeometry=new T.PlaneGeometry(2.4,2.4);materials.push(pickerMaterial);
  const markerPositions=new Float32Array(atlas.parts.length*3),markerGeometry=new T.BufferGeometry();markerGeometry.setAttribute('position',new T.BufferAttribute(markerPositions,3));
  const markerMaterial=new T.PointsMaterial({color:0x64748b,size:5,sizeAttenuation:false,transparent:true,opacity:.72,depthTest:false});
  markerMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;');};
  const markers=new T.Points(markerGeometry,markerMaterial);markers.frustumCulled=false;markers.renderOrder=10;markers.visible=false;scene.add(markers);
  const hover=document.createElement('div');hover.className='part-hover';hover.setAttribute('role','tooltip');hover.hidden=true;el.appendChild(hover);
  type Target={index:number;x:number;y:number;left:number;right:number;top:number;bottom:number};let targets:Target[]=[];
  const projected=new T.Vector3();
  const findTarget=(x:number,y:number,radius:number)=>{
   let best=-1,score=Infinity;
   for(const t of targets){const dx=Math.max(t.left-x,0,x-t.right),dy=Math.max(t.top-y,0,y-t.bottom),distance=Math.hypot(dx,dy);if(distance>radius)continue;const candidate=distance+Math.hypot(t.x-x,t.y-y)*.025;if(candidate<score){score=candidate;best=t.index;}}
   return best;
  };
  // userData.sliceThickness > 0 keeps only a slab around the slice; 0 removes the half-space facing the camera.
  // userData.selectedOnly restricts a pass to the current selection. userData.xrayRole splits the anatomy in X-ray mode:
  // the lit pass (1) keeps only the selection, solid; the ghost pass (2) draws everything else.
  const patchShader=<M extends T.Material>(m:M):M=>{
   m.onBeforeCompile=shader=>{
    shader.uniforms.partState={value:partTexture};shader.uniforms.selectionState={value:selectionTexture};shader.uniforms.stateWidth={value:width};Object.assign(shader.uniforms,sliceUniforms);shader.uniforms.sliceThickness={value:m.userData.sliceThickness??0};shader.uniforms.selectedOnly={value:m.userData.selectedOnly?1:0};Object.assign(shader.uniforms,xrayUniforms);shader.uniforms.xrayRole={value:m.userData.xrayRole??0};
    shader.vertexShader='attribute float partIndex; uniform sampler2D partState; uniform sampler2D selectionState; uniform float stateWidth; varying float partVisible; varying float partSelected; varying vec3 anatomyPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec2 stateUv = vec2((partIndex + 0.5) / stateWidth, 0.5); vec4 state = texture2D(partState, stateUv); transformed += state.xyz; partVisible = state.w; partSelected = texture2D(selectionState, stateUv).r; anatomyPosition = position;');
    shader.fragmentShader='uniform vec4 slicePlane; uniform float sliceThickness; uniform float sliceActive; uniform float selectedOnly; uniform float xrayActive; uniform float xrayRole; varying float partVisible; varying float partSelected; varying vec3 anatomyPosition;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (partVisible < 0.5 || (selectedOnly > 0.5 && partSelected < 0.5)) discard;\nif (xrayActive > 0.5 && ((xrayRole == 1.0 && partSelected < 0.5) || (xrayRole == 2.0 && partSelected > 0.5))) discard;\nif (sliceActive > 0.5) { float sliceDistance = dot(anatomyPosition, slicePlane.xyz) - slicePlane.w; if (sliceThickness > 0.0 ? abs(sliceDistance) > sliceThickness * 0.5 : sliceDistance > 0.0) discard; }');
    // Ghost: nearly clear where the surface faces the viewer, denser toward its silhouette, like tissue seen edge-on in a radiograph.
    if(m.userData.xrayRole===2)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\nfloat rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);\ngl_FragColor = vec4(mix(gl_FragColor.rgb, vec3(1.0), 0.15), mix(0.02, 0.32, rim));');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.85, 0.78), partSelected * 0.75);');
   };materials.push(m);return m;
  };
  const materialFor=(system:string)=>{
   // Slicing is only applied to the cross-section passes; the lit anatomy is hidden while slicing.
   const m=new T.MeshStandardMaterial({color:tinted?'#ffffff':SYSTEMS.find(s=>s.id===system)?.color??'#aebbb8',vertexColors:tinted,metalness:.08,roughness:.53,side:T.DoubleSide,transparent:system==='integumentary',opacity:system==='integumentary'?.1:1,depthWrite:system!=='integumentary'});m.userData.xrayRole=1;
   return patchShader(m);
  };
  // Drawn after the solid selection without writing depth, so the selection shows through every ghost in front of it.
  const ghostFor=(system:string)=>{const m=new T.MeshStandardMaterial({color:tinted?'#ffffff':SYSTEMS.find(s=>s.id===system)?.color??'#aebbb8',vertexColors:tinted,metalness:.08,roughness:.53,side:T.DoubleSide,transparent:true,depthWrite:false});m.userData.xrayRole=2;patchShader(m);
   // Programs are cached by the onBeforeCompile source, which every patched material shares; the ghost's shader differs.
   m.customProgramCacheKey=()=>'anatomy-ghost';return m;};
  const ghosts=new Map(SYSTEMS.map(s=>[s.id,ghostFor(s.id)])),ghostMeshes:T.Mesh[]=[];
  // Stencil capping: surfaces behind the slice add +1 (back faces) or -1 (front faces), so a nonzero count marks points inside a closed structure.
  const stencilMaterial=(side:T.Side,op:T.StencilOp,selectedOnly:boolean)=>{const m=patchShader(new T.MeshBasicMaterial({side,colorWrite:false,depthWrite:false,depthTest:false,stencilWrite:true,stencilFunc:T.AlwaysStencilFunc,stencilFail:op,stencilZFail:op,stencilZPass:op}));m.userData.selectedOnly=selectedOnly;return m;};
  const stencilPasses=[false,true].map(selectedOnly=>[stencilMaterial(T.BackSide,T.IncrementWrapStencilOp,selectedOnly),stencilMaterial(T.FrontSide,T.DecrementWrapStencilOp,selectedOnly)]);
  // Caps fill where the count is nonzero and reset the stencil for the next system.
  const capFor=(color:T.ColorRepresentation,order:number)=>{const m=new T.MeshBasicMaterial({color,side:T.DoubleSide,toneMapped:false,depthTest:false,depthWrite:false,stencilWrite:true,stencilRef:0,stencilFunc:T.NotEqualStencilFunc,stencilFail:T.ReplaceStencilOp,stencilZFail:T.ReplaceStencilOp,stencilZPass:T.ReplaceStencilOp});materials.push(m);const cap=new T.Mesh(capGeometry,m);cap.renderOrder=order;cap.frustumCulled=false;cap.visible=false;scene.add(cap);caps.push(cap);sliceObjects.push(cap);};
  CAP_ORDER.forEach((system,k)=>capFor(SYSTEMS.find(x=>x.id===system)!.color,k*2+2));capFor('#6fcfbf',501);
  // A thin slab of each surface draws the boundary between neighbouring structures of the same system.
  const outlines=new Map(SYSTEMS.map(x=>{const m=patchShader(new T.MeshBasicMaterial({color:new T.Color(x.color).multiplyScalar(.42),side:T.DoubleSide,toneMapped:false,depthTest:false,depthWrite:false}));m.userData.sliceThickness=.0016;return [x.id,m];}));
  const mats=new Map(SYSTEMS.map(s=>[s.id,materialFor(s.id)]));
  materials.push(imageMaterial);scene.add(imagePlane);
  // Projection: a digitally reconstructed radiograph. A unit box spans the CT volume (its local coordinates are the 3D
  // texture's), and each fragment marches its camera ray through it, summing attenuation × path length in metres. The
  // line integral is what a film records, so brightness rises with it, compressed by 1 − e^(−k·∫μ) so bone does not
  // saturate, then raised to a power to deepen soft tissue; air stays black. Drawn on a dark background, white where tissue attenuates, as a radiograph is read.
  const projectionMaterial=new T.ShaderMaterial({glslVersion:T.GLSL3,side:T.BackSide,transparent:true,depthWrite:false,
   uniforms:{volume:{value:null},cameraLocal:{value:new T.Vector3()},toWorld:{value:new T.Matrix3()},density:{value:0},shape:{value:new T.Vector3(1,1,1)},stepVoxels:{value:1}},
   vertexShader:'out vec3 vLocal; void main(){ vLocal = position + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
   fragmentShader:`precision highp float; precision highp sampler3D;
uniform sampler3D volume; uniform vec3 cameraLocal; uniform mat3 toWorld; uniform float density; uniform vec3 shape; uniform float stepVoxels;
in vec3 vLocal; out vec4 outColor;
void main(){
 vec3 dir = normalize(vLocal - cameraLocal), inv = 1.0 / dir;
 vec3 a = -cameraLocal * inv, b = (1.0 - cameraLocal) * inv, near = min(a, b), far = max(a, b);
 float t0 = max(max(max(near.x, near.y), near.z), 0.0), t1 = min(min(far.x, far.y), far.z);
 if (t1 <= t0) discard;
 // One sample every stepVoxels voxels along this ray's own path, so short rays near the edge cost little.
 int steps = int(clamp(ceil(length((t1 - t0) * dir * shape) / stepVoxels), 1.0, 768.0));
 float dt = (t1 - t0) / float(steps), sum = 0.0;
 for (int i = 0; i < steps; i++) { sum += texture(volume, cameraLocal + dir * (t0 + (float(i) + 0.5) * dt)).r; }
 float integral = sum * length(toWorld * dir) * dt;
 outColor = vec4(vec3(0.93, 0.96, 1.0), pow(1.0 - exp(-density * integral), 1.5));
}`});
  materials.push(projectionMaterial);
  const projectionBox=new T.Mesh(new T.BoxGeometry(1,1,1),projectionMaterial);projectionBox.visible=false;projectionBox.frustumCulled=false;projectionBox.matrixAutoUpdate=false;projectionBox.renderOrder=2;scene.add(projectionBox);
  let projectionTexture:T.Data3DTexture|null=null,lastProjection:SceneState['projection']=null;
  const inverseBox=new T.Matrix4();
  // Reticle: the three slice planes through the shared voxel, outlined across the study's volume in their 2D colours,
  // and the point itself. Drawn over the anatomy so it stays visible inside the body.
  const reticleGeometry=new T.BufferGeometry();reticleGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(3*2*4*3),3));
  const reticleColors=new Float32Array(3*2*4*3);(['axial','coronal','sagittal'] as const).forEach((axis,a)=>{const c=new T.Color(PLANE_COLORS[axis]);for(let v=0;v<8;v++)reticleColors.set([c.r,c.g,c.b],(a*8+v)*3);});
  reticleGeometry.setAttribute('color',new T.BufferAttribute(reticleColors,3));
  const reticleMaterial=new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.7,depthTest:false,depthWrite:false,toneMapped:false});
  const reticleLines=new T.LineSegments(reticleGeometry,reticleMaterial);reticleLines.renderOrder=700;reticleLines.frustumCulled=false;reticleLines.visible=false;scene.add(reticleLines);
  const reticleDotGeometry=new T.BufferGeometry();reticleDotGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(3),3));
  const reticleDotMaterial=new T.PointsMaterial({color:0xffffff,size:7,sizeAttenuation:false,depthTest:false,depthWrite:false,toneMapped:false});
  reticleDotMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;');};
  const reticleDot=new T.Points(reticleDotGeometry,reticleDotMaterial);reticleDot.renderOrder=701;reticleDot.frustumCulled=false;reticleDot.visible=false;scene.add(reticleDot);
  materials.push(reticleMaterial,reticleDotMaterial);geometries.push(reticleGeometry,reticleDotGeometry);
  let lastReticle='';
  const toScene=(v:NonNullable<Atlas['volume']>,[i,j,k]:number[])=>new T.Vector3((-i*v.spacing[0]+v.offset[0])/1000,(k*v.spacing[2]+v.offset[1])/1000,(j*v.spacing[1]+v.offset[2])/1000);
  const toVoxel=(v:NonNullable<Atlas['volume']>,p:T.Vector3):[number,number,number]=>[(v.offset[0]-p.x*1000)/v.spacing[0],(p.z*1000-v.offset[2])/v.spacing[1],(p.y*1000-v.offset[1])/v.spacing[2]];
  // μ of water at diagnostic energies is about 19 per metre. k = 0.22 puts a 30 cm abdomen near 0.7 before the 1.5 power,
  // which darkens soft tissue so the lungs and bone separate from it.
  const MU_WATER=19,COMPRESSION=.22;
  let loaded=0;
  const loadChunk=async(ci:number)=>{
   const chunk=atlas.chunks[ci],compressed=!!chunk.gzip&&typeof DecompressionStream!=='undefined';const response=await fetch(compressed?chunk.gzip!:chunk.url,{signal:abort.signal});const buffer=await decodeModelResponse(response,chunk.bytes,compressed);if(disposed)return;
   const groups=new Map<string,T.BufferGeometry[]>();
   atlas.parts.forEach((p,i)=>{
    if(p.chunk!==ci)return;
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(buffer,p.positions,p.vertexCount*3),3));
    // GPU normalized signed-short normals keep the complete atlas compact in memory.
    g.setAttribute('normal',new T.BufferAttribute(new Int16Array(buffer,p.normals,p.vertexCount*3),3,true));g.setIndex(new T.BufferAttribute(new Uint32Array(buffer,p.indices,p.indexCount),1));
    g.boundingBox=bounds[i].clone();g.computeBoundingSphere();const pick=new T.Mesh(g,pickerMaterial);pick.matrixAutoUpdate=false;pickers[i]=pick;geometries.push(g);
    g.setAttribute('partIndex',new T.BufferAttribute(new Float32Array(p.vertexCount).fill(i),1));
    if(tinted){const linear=(p.color?new T.Color().setRGB(p.color[0]/255,p.color[1]/255,p.color[2]/255,T.SRGBColorSpace):new T.Color(SYSTEMS.find(s=>s.id===p.system)?.color??'#aebbb8')).toArray(),c=linear.map(v=>Math.round(v*255)),rgb=new Uint8Array(p.vertexCount*3);for(let v=0;v<p.vertexCount;v++)rgb.set(c,v*3);g.setAttribute('color',new T.BufferAttribute(rgb,3,true));}
    const list=groups.get(p.system)??[];list.push(g);groups.set(p.system,list);
   });
   groups.forEach((gs,system)=>{const geometry=mergeGeometries(gs,false);if(!geometry)throw new Error('Could not assemble anatomy geometry.');geometries.push(geometry);const mesh=new T.Mesh(geometry,mats.get(system as never));mesh.frustumCulled=false;scene.add(mesh);normalMeshes.push(mesh);
    // A child of the lit mesh, so it hides with it while slicing.
    const ghost=new T.Mesh(geometry,ghosts.get(system as never));ghost.frustumCulled=false;ghost.renderOrder=1;ghost.visible=ghostsOn;mesh.add(ghost);ghostMeshes.push(ghost);
    const order=CAP_ORDER.indexOf(system as SystemId);
    const passes:[T.Material,number][]=[...stencilPasses[0].map(m=>[m,order*2+1] as [T.Material,number]),...stencilPasses[1].map(m=>[m,500] as [T.Material,number]),[outlines.get(system as SystemId)!,600]];
    for(const [material,renderOrder] of passes){const pass=new T.Mesh(geometry,material);pass.renderOrder=renderOrder;pass.frustumCulled=false;scene.add(pass);sliceObjects.push(pass);}
    lastSliceView='';});
   lastState=null;loaded++;onProgress(Math.round(loaded/atlas.chunks.length*100));dirty=true;
  };
  (async()=>{try{let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<atlas.chunks.length){const i=cursor++;await loadChunk(i);}}));if(!disposed){ready=true;dirty=true;}}catch(e){if(!disposed)onError(e instanceof Error?e.message:'Could not load the anatomy.');}})();
  const fit=(view:string,extent=0)=>{
   const aspect=camera.aspect,mobile=el.clientWidth<768,normalDistance=mobile?Math.max(4.5,1.8*el.clientHeight/Math.max(160,el.clientHeight-350)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))):4;
   // Assembled framing scales with the model (1 for the reference body); the exploded inventory has its own layout.
   const assembled=normalDistance*scale;
   const reservedHeight=mobile?350:270;const availableAspect=Math.max(.35,(el.clientWidth-(mobile?40:340))/Math.max(160,el.clientHeight-reservedHeight));const atlasDistance=Math.max(packingHeight,packingWidth/availableAspect)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*(el.clientHeight/Math.max(160,el.clientHeight-reservedHeight))*1.08;
   const distance=T.MathUtils.lerp(assembled,Math.max(.2,atlasDistance),extent);if(extent>.8)view='front';
   const slice=latest.current.slice;if(view==='inferior'&&slice&&extent<.1){// Seen from the feet, the cross-section is the model's width × depth.
    const distance=Math.max(modelSize.z*1.3,modelSize.x*1.1/camera.aspect)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.1;controls.target.set(0,slice.position,0);camera.position.set(0,slice.position-distance,distance*.02);controls.update();dirty=true;return;}
   const direction=view==='front'?new T.Vector3(0,.02,1):view==='back'?new T.Vector3(0,.02,-1):view==='side'?new T.Vector3(1,.02,0):new T.Vector3(.35,.06,1).normalize();
   controls.target.set(extent>.1&&el.clientWidth>767?-packingWidth*.12:0,extent>.1?.85:(mobile?.85:.68)*scale,0);camera.position.copy(controls.target).addScaledVector(direction,distance);controls.update();dirty=true;
  };
  // The radiograph is marched per pixel, so it renders at 1×: the CT's 1.5 mm voxels hold no finer detail anyway.
  const pixelRatio=()=>lastProjection?1:Math.min(devicePixelRatio,el.clientWidth<768||el.clientHeight<600?1.5:2);
  const resize=()=>{layoutKey='';lastState=null;renderer.setPixelRatio(pixelRatio());camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);fit(latest.current.view,amount);};const observer=new ResizeObserver(resize);observer.observe(el);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),tap=new PointerTap(),worldBox=new T.Box3(),hitPoint=new T.Vector3();
  const down=(e:PointerEvent)=>{hover.hidden=true;tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5);};
  let sliceHit=false;const probe=new T.Raycaster(),probeDirection=new T.Vector3(.31,.83,.47).normalize(),slicePoint=new T.Vector3(),slicePlane=new T.Plane();
  const partAtSlice=(clientX:number,clientY:number)=>{
   const s=latest.current.slice,axis=s&&SLICE_AXES.find(a=>a.id===s.axis);if(!s||!axis)return -1;const rect=renderer.domElement.getBoundingClientRect();
   pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   slicePlane.normal.fromArray(axis.normal);slicePlane.constant=-s.position*axis.normal[axis.coordinate];sliceHit=!!raycaster.ray.intersectPlane(slicePlane,slicePoint);if(!sliceHit)return -1;
   // A point is inside a closed mesh when a ray from it crosses the surface an odd number of times.
   let best=-1,bestOrder=-1,bestVolume=Infinity;pickerMaterial.side=T.DoubleSide;probe.set(slicePoint,probeDirection);
   atlas.parts.forEach((p,i)=>{const mesh=pickers[i],order=CAP_ORDER.indexOf(p.system);if(!mesh||data[i*4+3]<.5||order<bestOrder||!bounds[i].containsPoint(slicePoint))return;const size=bounds[i].getSize(hitPoint),volume=size.x*size.y*size.z;if(order===bestOrder&&volume>=bestVolume)return;if(probe.intersectObject(mesh,false).length%2===0)return;best=i;bestOrder=order;bestVolume=volume;});
   pickerMaterial.side=T.FrontSide;return best;
  };
  const move=(e:PointerEvent)=>{tap.move(e.pointerId,e.clientX,e.clientY);const slicing=!!latest.current.slice&&ready;if(e.buttons||(amount<.5&&!slicing)||e.pointerType==='touch'){hover.hidden=true;return;}const rect=el.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,index=slicing?partAtSlice(e.clientX,e.clientY):findTarget(x,y,12);hover.hidden=index<0;renderer.domElement.style.cursor=index<0?'grab':'pointer';if(index>=0){hover.textContent=naming.current?.(atlas.parts[index].name)??atlas.parts[index].name;hover.style.left=`${Math.max(8,Math.min(x+14,el.clientWidth-260))}px`;hover.style.top=`${Math.max(8,Math.min(y+18,el.clientHeight-55))}px`;}};
  const cancel=(e:PointerEvent)=>tap.cancel(e.pointerId);
  const up=(e:PointerEvent)=>{
   const validTap=tap.up(e.pointerId,e.clientX,e.clientY);if(!validTap||!ready)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   if(latest.current.slice){const found=partAtSlice(e.clientX,e.clientY);if(sliceHit&&latest.current.sliceImage&&atlas.volume)pointing.current?.(toVoxel(atlas.volume,slicePoint));if(found>=0){hover.hidden=true;select.current(atlas.parts[found].id);}return;}
   let nearest=Infinity,found=-1;const hasSolid=atlas.parts.some((p,i)=>p.system!=='integumentary'&&data[i*4+3]>.5);
   pickers.forEach((mesh,i)=>{if(!mesh||data[i*4+3]<.5||(hasSolid&&atlas.parts[i].system==='integumentary'))return;worldBox.copy(bounds[i]).translate(mesh.position);if(!raycaster.ray.intersectBox(worldBox,hitPoint))return;const hit=raycaster.intersectObject(mesh,false)[0];if(hit&&hit.distance<nearest){nearest=hit.distance;found=i;}});
   if(found<0&&amount>.45)found=findTarget(e.clientX-rect.left,e.clientY-rect.top,e.pointerType==='touch'?24:16);if(found>=0){hover.hidden=true;select.current(atlas.parts[found].id);}
  };
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
  const clock=new T.Clock();let lastExtent=-1;
  const animate=()=>{
   if(disposed)return;frame=requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05),s=latest.current;
   const changed=lastState?.visible!==s.visible||lastState?.selected!==s.selected||lastState?.hidden!==s.hidden||lastState?.isolate!==s.isolate;
   const moving=Math.abs(amount-s.explode)>.0001;
   if(moving){amount=T.MathUtils.damp(amount,s.explode,8,dt);dirty=true;}
   if(changed||moving||lastExtent<0){
    const visible=new Set(s.visible),selection=new Set(s.selected),hidden=new Set(s.hidden);
    // Selected structures stay visible even when hidden, so a search result is never invisible.
    const shown=(p:Atlas['parts'][number])=>selection.has(p.id)||(!s.isolate&&visible.has(groupOf(p))&&!hidden.has(p.id));
    const visibleParts=atlas.parts.filter(shown);
    const nextLayoutKey=visibleParts.map(p=>p.id).join(',')+':'+camera.aspect.toFixed(3);
    if(nextLayoutKey!==layoutKey){const layout=createExplosionLayout(visibleParts,camera.aspect);packingWidth=layout.width;packingHeight=layout.height;atlas.parts.forEach((p,i)=>{const cell=layout.cells.get(p.id);offsets[i]=cell?new T.Vector3(cell.x,cell.y+.85,0):centers[i].clone();});layoutKey=nextLayoutKey;if(amount>.05&&!s.isolate)fit(s.view,Math.max(0,(amount-.3)/.7));}

    atlas.parts.forEach((p,i)=>{
     const c=centers[i],destination=offsets[i];let dx=0,dy=0,dz=0;
     if(amount<=.45){const t=amount/.45;const group=SYSTEMS.findIndex(sys=>sys.id===p.system);const angle=group/SYSTEMS.length*Math.PI*2;dx=Math.sin(angle)*t*.48;dy=(c.y-.85)*t*.28;dz=Math.cos(angle)*t*.48;}
     else {const t=(amount-.45)/.55,group=SYSTEMS.findIndex(sys=>sys.id===p.system),angle=group/SYSTEMS.length*Math.PI*2;dx=T.MathUtils.lerp(Math.sin(angle)*.48,destination.x-c.x,t);dy=T.MathUtils.lerp((c.y-.85)*.28,destination.y-c.y,t);dz=T.MathUtils.lerp(Math.cos(angle)*.48,-c.z,t);}
     const selected=selection.has(p.id);data.set([dx,dy,dz,shown(p)?1:0],i*4);selectedData[i*4]=selected?255:0;
     markerPositions.set(data[i*4+3]>.5?[c.x+dx,c.y+dy,c.z+dz]:[10000,10000,10000],i*3);const mesh=pickers[i];if(mesh){mesh.position.set(dx,dy,dz);mesh.updateMatrix();mesh.updateMatrixWorld(true);}
    });partTexture.needsUpdate=true;selectionTexture.needsUpdate=true;markerGeometry.attributes.position.needsUpdate=true;lastState=s;lastExtent=amount;dirty=true;
   }
   const sliceKey=s.slice?`${s.slice.axis}:${s.slice.position}`:'';
   if(sliceKey!==lastSlice){const axis=s.slice&&SLICE_AXES.find(a=>a.id===s.slice!.axis);if(s.slice&&axis){const n=axis.normal;sliceUniforms.slicePlane.value.set(n[0],n[1],n[2],s.slice.position*n[axis.coordinate]);caps.forEach(cap=>{cap.position.set(0,.86,0);cap.position.setComponent(axis.coordinate,s.slice!.position);cap.rotation.set(axis.id==='axial'?Math.PI/2:0,axis.id==='sagittal'?Math.PI/2:0,0);});}sliceUniforms.sliceActive.value=s.slice?1:0;lastSlice=sliceKey;dirty=true;
    // Keep the axial camera at a fixed distance from the slice while scrolling through levels.
    const position=s.slice?.axis==='axial'?s.slice.position:null;if(position!==null&&lastSlicePosition!==null){const delta=position-lastSlicePosition;controls.target.y+=delta;camera.position.y+=delta;controls.update();}lastSlicePosition=position;}
   const image=s.slice?s.sliceImage:null,sliceView=`${!!s.slice}:${!!image}:${s.sliceAnatomy!==false}`;
   if(sliceView!==lastSliceView){normalMeshes.forEach(m=>m.visible=!s.slice||(!!image&&s.sliceAnatomy!==false));sliceObjects.forEach(o=>o.visible=!!s.slice&&!image);imagePlane.visible=!!image;lastSliceView=sliceView;dirty=true;}
   const reticle=atlas.volume&&s.reticle&&amount<.05?s.reticle:null,reticleKey=reticle?reticle.join(','):'';
   if(reticleKey!==lastReticle){
    if(reticle){
     const v=atlas.volume!,[X,Y,Z]=v.shape,lo=-.5,hx=X-.5,hy=Y-.5,hz=Z-.5,[x,y,z]=reticle,positions=reticleGeometry.attributes.position as T.BufferAttribute;
     // Each plane is a rectangle across the volume at the reticle's index on that plane's axis (RAS voxels: z axial, y coronal, x sagittal).
     const rect=(corners:number[][])=>corners.flatMap((c,i)=>[c,corners[(i+1)%4]]);
     const edges=[...rect([[lo,lo,z],[hx,lo,z],[hx,hy,z],[lo,hy,z]]),...rect([[lo,y,lo],[hx,y,lo],[hx,y,hz],[lo,y,hz]]),...rect([[x,lo,lo],[x,hy,lo],[x,hy,hz],[x,lo,hz]])];
     edges.forEach((voxel,i)=>{const p=toScene(v,voxel);positions.setXYZ(i,p.x,p.y,p.z);});positions.needsUpdate=true;
     const dot=toScene(v,reticle);(reticleDotGeometry.attributes.position as T.BufferAttribute).setXYZ(0,dot.x,dot.y,dot.z);reticleDotGeometry.attributes.position.needsUpdate=true;
    }
    reticleLines.visible=reticleDot.visible=!!reticle;lastReticle=reticleKey;dirty=true;
   }
   const projection=s.projection&&atlas.volume&&!s.slice?s.projection:null;
   if(projection!==lastProjection){
    projectionTexture?.dispose();projectionTexture=null;
    if(projection){
     const [X,Y,Z]=projection.shape,v=atlas.volume!,[sx,sy,sz]=v.spacing.map(n=>n/1000),[o0,o1,o2]=v.offset.map(n=>n/1000);
     projectionTexture=new T.Data3DTexture(projection.data,X,Y,Z);projectionTexture.format=T.RedFormat;projectionTexture.type=T.UnsignedByteType;
     projectionTexture.minFilter=projectionTexture.magFilter=T.LinearFilter;projectionTexture.unpackAlignment=1;projectionTexture.needsUpdate=true;
     projectionMaterial.uniforms.volume.value=projectionTexture;
     // Texture coordinates (u,v,w) ∈ [0,1]³ → scene, through voxelToScene with voxel index = u·X − ½: box local = uvw − ½.
     const m=new T.Matrix4().set(-X*sx,0,0,(.5*sx+o0)-X*sx*.5, 0,0,Z*sz,(-.5*sz+o1)+Z*sz*.5, 0,Y*sy,0,(-.5*sy+o2)+Y*sy*.5, 0,0,0,1);
     projectionBox.matrix.copy(m);projectionBox.matrixWorld.copy(m);inverseBox.copy(m).invert();
     projectionMaterial.uniforms.toWorld.value.setFromMatrix4(m);projectionMaterial.uniforms.density.value=MU_WATER*COMPRESSION*255/ATTENUATION_SCALE;
     projectionMaterial.uniforms.shape.value.set(X,Y,Z);
    }
    projectionBox.visible=!!projection;renderer.setClearColor(projection?'#06090d':'#f2f3f3');lastProjection=projection;renderer.setPixelRatio(pixelRatio());dirty=true;
   }
   // Both views keep only the selection solid; ghosts belong to the X-ray view alone.
   const xrayKey=`${!!s.xray}:${!!projection}`;
   if(xrayKey!==lastXray){lastXray=xrayKey;ghostsOn=!!s.xray&&!projection;xrayUniforms.xrayActive.value=s.xray||projection?1:0;ghostMeshes.forEach(g=>g.visible=ghostsOn);dirty=true;}
   if(image&&image.version!==lastImage){
    if(image.canvas!==imageCanvas){imageTexture?.dispose();imageTexture=new T.CanvasTexture(image.canvas);imageTexture.colorSpace=T.SRGBColorSpace;imageTexture.generateMipmaps=false;imageTexture.minFilter=T.LinearFilter;imageMaterial.map=imageTexture;imageMaterial.needsUpdate=true;imageCanvas=image.canvas;}
    else imageTexture!.needsUpdate=true;
    const corners=imageGeometry.attributes.position as T.BufferAttribute;image.corners.forEach((c,i)=>corners.setXYZ(i,c[0],c[1],c[2]));corners.needsUpdate=true;lastImage=image.version;dirty=true;
   }
   if(s.view!==lastView||s.reset!==lastReset){fit(s.view,amount);lastView=s.view;lastReset=s.reset;}
   if(moving&&!s.isolate)fit(amount>.5?'front':s.view,Math.max(0,(amount-.3)/.7));
   const isolateKey=s.isolate?s.selected.join(',')+':'+s.reset+':'+s.inspectorOpen+':'+camera.aspect:'';
   if(isolateKey!==lastIsolate||(s.isolate&&moving)){
    if(s.isolate){const box=new T.Box3();atlas.parts.forEach((p,i)=>{if(s.selected.includes(p.id))box.union(bounds[i].clone().translate(new T.Vector3(data[i*4],data[i*4+1],data[i*4+2])));});
     if(!box.isEmpty()){const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());const w=el.clientWidth,h=el.clientHeight,mobile=w<768,landscape=w>h&&h<=600;let left=20,right=w-20,top=mobile?175:110,bottom=h-170;if(s.inspectorOpen){if(landscape){right=w-335;top=100;bottom=h-125;}else if(mobile){const sheet=document.querySelector('.detail-sheet')?.getBoundingClientRect(),header=document.querySelector('.identity')?.getBoundingClientRect();top=(header?.bottom??94)+16;bottom=(sheet?.top??h*.58-139)-16;}else{right=w-370;left=w>1100?285:25;}}const availableWidth=Math.max(150,right-left),availableHeight=Math.max(40,bottom-top);camera.setViewOffset(w,h,w/2-(left+right)/2,h/2-(top+bottom)/2,w,h);const distance=Math.max(.07,Math.max(size.y*h/availableHeight,size.x*w/availableWidth/camera.aspect,size.z)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.35);controls.maxDistance=Math.max(40,distance*2);controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(.2,.1,1).normalize().multiplyScalar(distance));controls.update();dirty=true;}
    }else if(lastIsolate){camera.clearViewOffset();fit(s.view,amount);}
    lastIsolate=isolateKey;
   }
   controls.enableRotate=amount<.8;controls.mouseButtons.LEFT=amount<.8?T.MOUSE.ROTATE:T.MOUSE.PAN;controls.touches.ONE=amount<.8?T.TOUCH.ROTATE:T.TOUCH.PAN;const fromBelow=s.slice?.axis==='axial';controls.maxPolarAngle=fromBelow?Math.PI:Math.PI*.96;ground.visible=platform.visible=ring.visible=innerRing.visible=amount<.5&&!s.isolate&&!s.slice&&!lastProjection;markers.visible=amount>.75&&!s.slice;controls.autoRotate=s.rotate&&!s.isolate&&amount<.4;controls.autoRotateSpeed=.65;controls.update();if(controls.autoRotate)dirty=true;
   // While the camera moves the radiograph samples every 3 voxels; one full-quality frame follows once it settles.
   if(lastProjection){const coarse=performance.now()-lastMove<180,step=coarse?3:1;if(step!==projectionMaterial.uniforms.stepVoxels.value){projectionMaterial.uniforms.stepVoxels.value=step;dirty=true;}}
   if(dirty){if(lastProjection)projectionMaterial.uniforms.cameraLocal.value.copy(camera.position).applyMatrix4(inverseBox).addScalar(.5);renderer.render(scene,camera);targets=[];if(amount>.45){const hasSolid=atlas.parts.some((p,i)=>p.system!=='integumentary'&&data[i*4+3]>.5);atlas.parts.forEach((p,i)=>{if(data[i*4+3]<.5||(hasSolid&&p.system==='integumentary'))return;let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(let corner=0;corner<8;corner++){projected.set(p.bounds[(corner&1)?1:0][0]+data[i*4],p.bounds[(corner&2)?1:0][1]+data[i*4+1],p.bounds[(corner&4)?1:0][2]+data[i*4+2]).project(camera);const x=(projected.x+1)*el.clientWidth/2,y=(1-projected.y)*el.clientHeight/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}projected.copy(centers[i]).add(new T.Vector3(data[i*4],data[i*4+1],data[i*4+2])).project(camera);if(projected.z< -1||projected.z>1)return;targets.push({index:i,x:(projected.x+1)*el.clientWidth/2,y:(1-projected.y)*el.clientHeight/2,left,right,top,bottom});});}dirty=false;}

  };animate();
  const contextLost=(e:Event)=>{e.preventDefault();onError('The 3D session was paused by your device. Reload to continue.');};renderer.domElement.addEventListener('webglcontextlost',contextLost);
  return()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);observer.disconnect();controls.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.traverse(o=>{if(o instanceof T.Mesh&&!geometries.includes(o.geometry)){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});env.dispose();partTexture.dispose();selectionTexture.dispose();imageTexture?.dispose();projectionTexture?.dispose();markerGeometry.dispose();markerMaterial.dispose();hover.remove();renderer.dispose();renderer.domElement.remove();};
 },[atlas]);
 useEffect(()=>{if(label)host.current?.querySelector('canvas')?.setAttribute('aria-label',label);},[label,atlas]);
 return <div className="scene" ref={host}/>;
}
