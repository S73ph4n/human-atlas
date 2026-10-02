/** Checks the French translation against what the app shows: every interface string passed to t() and every label
 *  in the app's own tables has a French entry, and every structure, group and path name in the data has a French name.
 *  Run: node scripts/validate-i18n.mjs */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {FR,translator,nameTranslator} from '../app/i18n.ts';
import {SYSTEMS,EXPLANATIONS,MODELS,SLICE_AXES} from '../app/anatomy.ts';

const root=new URL('../',import.meta.url),read=async path=>readFile(new URL(path,root),'utf8');
const missing=new Set();
// ct.ts imports its neighbours without extensions, which Node cannot resolve, so its two tables are read from the source.
const ctSource=await read('app/ct.ts');
const CT_STUDIES=[...ctSource.matchAll(/\{id:'([^']+)',modality:'\w+',name:'([^']+)',manifest:'([^']+)'.*?note:'([^']+)'/g)].map(([,id,name,manifest,note])=>({id,name,manifest,note}));
const CT_WINDOWS=[...ctSource.match(/CT_WINDOWS=\[(.*?)\] as const/)[1].matchAll(/name:'([^']+)'/g)].map(([,name])=>({name}));
assert.ok(CT_STUDIES.length>=6&&CT_WINDOWS.length>=4,'could not read the study and window tables from app/ct.ts');
const want=(text,where)=>{if(text&&!(text in FR))missing.add(`${where}: ${text}`);};

// Interface strings: literal arguments of t(…) and t.n(…) in the app's components.
for(const file of (await readdir(new URL('app/',root))).filter(f=>f.endsWith('.tsx'))){
 const source=await read(`app/${file}`);
 for(const [,quote,text] of source.matchAll(/\bt\((['"])((?:\\.|(?!\1).)*?)\1/g))want(text.replace(/\\'/g,"'"),file);
 for(const [,args] of source.matchAll(/\bt\.n\([^,]+,((?:\s*'[^']*'\s*,?){2})/g))for(const [,text] of args.matchAll(/'([^']*)'/g))want(text,file);
}
// The app's own tables, shown through t().
for(const s of SYSTEMS){want(s.name,'SYSTEMS');want(s.description,'SYSTEMS');}
for(const text of Object.values(EXPLANATIONS))want(text,'EXPLANATIONS');
for(const m of MODELS)want(m.name,'MODELS');
for(const a of SLICE_AXES){want(a.name,'SLICE_AXES');a.ends.forEach(e=>want(e,'SLICE_AXES'));}
for(const s of CT_STUDIES){want(s.name,'CT_STUDIES');want(s.note,'CT_STUDIES');}
for(const w of CT_WINDOWS)want(w.name,'CT_WINDOWS');
const facts=JSON.parse(await read('public/facts/reference.json'));
for(const [,label] of facts.fields)want(label,'facts fields');

// Data: structure names, group names and label paths of every model and study.
const names=new Map(Object.entries(JSON.parse(await read('public/i18n/names.fr.json'))));
const untranslated=new Set();let total=0;
const wantName=(name,where)=>{total++;if(!names.has(name.toLowerCase().trim())&&!(name in FR))untranslated.add(`${where}: ${name}`);};
const models=['models/atlas.json','models/atlas-female.json',...(await readdir(new URL('public/models/studies/',root))).filter(f=>f.endsWith('.json')).map(f=>`models/studies/${f}`)];
for(const path of models){
 const atlas=JSON.parse(await read(`public/${path}`));
 atlas.parts.forEach(p=>wantName(p.name,path));atlas.concepts.forEach(c=>wantName(c.name,path));(atlas.groups??[]).forEach(g=>wantName(g.name,path));
}
for(const s of CT_STUDIES){
 const manifest=JSON.parse(await read(`public${s.manifest}`));
 for(const l of manifest.labels){wantName(l.name,s.id);(l.path??[]).forEach(p=>wantName(p,s.id));}
 (manifest.groups??[]).forEach(g=>wantName(g.name,s.id));
 (manifest.windows??[]).forEach(w=>want(w.name,`${s.id} windows`));
 (manifest.series??[]).filter(x=>!/^T\d$/.test(x.name)).forEach(x=>want(x.name,`${s.id} series`));
}

// The helpers themselves: placeholders, plural choice and capitalisation.
const t=translator('fr'),nm=nameTranslator(names);
assert.equal(t('{n} of {total} structures can be asked',{n:3,total:12}),'3 structures sur 12 peuvent être demandées');
assert.equal(t.n(1,'{n} piece','{n} pieces'),'1 pièce');assert.equal(t.n(0,'{n} piece','{n} pieces'),'0 pièce');assert.equal(t.n(2234,'{n} piece','{n} pieces'),'2 234 pièces');
assert.equal(translator('en').n(0,'{n} piece','{n} pieces'),'0 pieces');
assert.equal(nm('Left femur'),'Fémur gauche');assert.equal(nm('left femur'),'fémur gauche');assert.equal(nm('Not a structure'),'Not a structure');

const list=set=>[...set].slice(0,40).map(x=>`  ${x}`).join('\n')+(set.size>40?`\n  … and ${set.size-40} more`:'');
if(untranslated.size)console.log(`${untranslated.size} of ${total} data names have no French name:\n${list(untranslated)}`);
assert.equal(missing.size,0,`${missing.size} interface strings have no French entry:\n${list(missing)}`);
assert.equal(untranslated.size,0,'every data name needs a French name');
console.log(`French: ${Object.keys(FR).length} interface strings, ${names.size} structure names; all ${total} data names covered`);
