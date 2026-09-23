/** Checks public/facts against the datasets it describes: every entry points at a structure that exists and at an
 *  article that carries text, and reports how much of each dataset is covered. Run: node scripts/validate-facts.mjs */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {structureFacts} from '../app/facts.ts';

const read=async path=>JSON.parse(await readFile(new URL(`../public/${path}`,import.meta.url)));
const datasets=[
 ['reference','models/atlas.json'],['reference-female','models/atlas-female.json'],
 ['s0476','ct/s0476/ct.json'],['s0777','ct/s0777/ct.json'],['spl-ear','ct/spl-ear/study.json'],
 ['spl-brain','mri/spl-brain/study.json'],['amos-0590','mri/amos-0590/study.json'],['spl-knee','mri/spl-knee/study.json'],
];
for(const [dataset,path] of datasets){
 const facts=await read(`facts/${dataset}.json`),source=await read(path);
 const ids=source.labels?new Set(source.labels.map(l=>`${dataset}:${l.key}`))
                  :new Set([...source.concepts.map(c=>c.id),...source.parts.map(p=>p.conceptId)]);
 for(const [id,entry] of Object.entries(facts.structures)){
  assert.ok(ids.has(id),`${dataset}: ${id} is not a structure of this dataset`);
  const article=facts.articles[entry.article];
  assert.ok(article,`${dataset}: ${id} points at the missing article ${entry.article}`);
  assert.ok(article.summary||Object.keys(article.facts).length,`${dataset}: ${entry.article} has neither summary nor facts`);
  assert.match(entry.item,/^Q\d+$/,`${dataset}: ${id} has no Wikidata item`);
 }
 for(const title of Object.keys(facts.articles))
  assert.ok(Object.values(facts.structures).some(e=>e.article===title),`${dataset}: ${title} is not used by any structure`);
 // The viewer reads entries through structureFacts, so check one goes all the way through.
 const first=Object.keys(facts.structures)[0],view=structureFacts(facts,first);
 assert.ok(view&&view.articleUrl.startsWith('https://en.wikipedia.org/wiki/'),`${dataset}: ${first} does not resolve`);
 const withFacts=Object.values(facts.structures).filter(e=>Object.keys(facts.articles[e.article].facts).length).length;
 const percent=n=>`${Math.round(100*n/ids.size)}%`;
 console.log(`${dataset.padEnd(17)} ${String(Object.keys(facts.structures).length).padStart(5)}/${String(ids.size).padEnd(5)} structures (${percent(Object.keys(facts.structures).length)}), ${withFacts} with infobox facts, ${Object.keys(facts.articles).length} articles`);
}
console.log('facts ok');
