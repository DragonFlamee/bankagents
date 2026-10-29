// Supplemental rendering only: never authors or rewrites the skill-built PPTX.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const dir=import.meta.dirname;
const runtime='C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const {FileBlob,PresentationFile}=await import(pathToFileURL(runtime));
const file=path.join(dir,'build/tracebank-technical-defense-20261027.pptx');
const ppt=await PresentationFile.importPptx(await FileBlob.load(file));
const out=path.join(dir,'build/supplemental-renders');await fs.mkdir(out,{recursive:true});
const images=[];
for(let i=0;i<ppt.slides.items.length;i++){
 const png=await ppt.export({slide:ppt.slides.items[i],format:'png',scale:1.5});
 const data=new Uint8Array(await png.arrayBuffer()),name=`slide-${String(i+1).padStart(2,'0')}.png`;
 await fs.writeFile(path.join(out,name),data);images.push({slide:i+1,path:name,sha256:createHash('sha256').update(data).digest('hex')});console.log('Rendered actual skill PPTX',i+1);
}
await fs.writeFile(path.join(out,'render-proof.json'),JSON.stringify({date:'2026-10-27',renderer:'first-party artifact-tool import and PNG export',skill_standard_renderer:'LibreOffice unavailable; no native Office validation claimed',pptx_sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex'),page_count:images.length,images},null,2)+'\n');
