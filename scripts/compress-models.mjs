import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
// Usage: node scripts/compress-models.mjs [manifests under public/models, default atlas.json]
// Manifests with gzipOnly ship only the .gz chunks (served to browsers with DecompressionStream).
const base=new URL('../public/models/',import.meta.url),local=url=>new URL(url.slice('/models/'.length),base);
for(const name of process.argv.length>2?process.argv.slice(2):['atlas.json']){
 const path=new URL(name,base),atlas=JSON.parse(fs.readFileSync(path));
 let bytes=0;
 for(const c of atlas.chunks){
  const raw=c.url.endsWith('.gz')?c.url.slice(0,-3):c.url;
  const compressed=gzipSync(fs.readFileSync(local(raw)),{level:9});c.gzip=raw+'.gz';c.gzipBytes=compressed.length;fs.writeFileSync(local(c.gzip),compressed);bytes+=compressed.length;
  if(atlas.gzipOnly){fs.unlinkSync(local(raw));c.url=c.gzip;}
 }
 fs.writeFileSync(path,JSON.stringify(atlas));console.log(`${name}: ${(bytes/1e6).toFixed(1)} MB compressed download`);
}
