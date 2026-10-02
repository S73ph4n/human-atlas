/** Anatomy facts for a selected structure: a Wikipedia summary and the fields of its anatomy infobox.
 *  One file per dataset under /facts, built by scripts/build-facts.py and fetched the first time a
 *  structure of that dataset is opened. Keys are the conceptIds the viewer already uses (FMA59763,
 *  UBERON:0002097, s0476:aorta), so the 3D model and the 2D slices share one file per study. */
export interface FactArticle {summary:string;facts:Record<string,string>}
export interface FactEntry {article:string;item:string;via?:number}
export interface FactsFile {dataset:string;source:string;built:string;fields:[string,string][];articles:Record<string,FactArticle>;structures:Record<string,FactEntry>}
export interface StructureFacts {summary:string;rows:{key:string;label:string;value:string}[];article:string;articleUrl:string;itemUrl:string;general:boolean}
/** French summaries for a dataset's English articles (scripts/build-facts-fr.py), keyed by English title. */
export interface FrenchFactsFile {dataset:string;source:string;built:string;articles:Record<string,{title:string;summary:string}>}

const files=new Map<string,Promise<FactsFile|null>>(),frenchFiles=new Map<string,Promise<FrenchFactsFile|null>>();
/** Cached per dataset; a missing or malformed file resolves to null and the viewer falls back to its own text. */
export function loadFacts(dataset:string):Promise<FactsFile|null>{
 let pending=files.get(dataset);
 if(!pending){pending=fetch(`/facts/${dataset}.json`).then(r=>r.ok?r.json() as Promise<FactsFile>:null).catch(()=>null);files.set(dataset,pending);}
 return pending;
}

export function loadFrenchFacts(dataset:string):Promise<FrenchFactsFile|null>{
 let pending=frenchFiles.get(dataset);
 if(!pending){pending=fetch(`/facts/${dataset}.fr.json`).then(r=>r.ok?r.json() as Promise<FrenchFactsFile>:null).catch(()=>null);frenchFiles.set(dataset,pending);}
 return pending;
}

const wikipediaUrl=(title:string,lang='en')=>`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g,'_'))}`;

/** The facts for one structure, or null when the dataset has no entry for it. With a French file, the summary and the
 *  link come from the French article when there is one; the infobox rows stay those of the English article. */
export function structureFacts(file:FactsFile|null,conceptId:string|undefined,french?:FrenchFactsFile|null):StructureFacts|null{
 if(!file||!conceptId)return null;
 const entry=file.structures[conceptId],article=entry&&file.articles[entry.article];
 if(!entry||!article)return null;
 const rows=file.fields.map(([key,label])=>({key,label,value:article.facts[key]})).filter((r):r is {key:string;label:string;value:string}=>!!r.value);
 const fr=french?.articles[entry.article];
 return {summary:fr?.summary??article.summary,rows,article:fr?.title??entry.article,articleUrl:fr?wikipediaUrl(fr.title,'fr'):wikipediaUrl(entry.article),itemUrl:`https://www.wikidata.org/wiki/${entry.item}`,general:!!entry.via};
}
