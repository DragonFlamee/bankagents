// Import and render the actual reference PPTX; never author or rewrite it.
import fs from 'node:fs/promises';import path from 'node:path';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';
const runtime='C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const{FileBlob,PresentationFile}=await import(pathToFileURL(runtime));
const input=path.resolve(process.argv[2]||path.join(import.meta.dirname,'repaired.pptx'));
const out=path.resolve(process.argv[3]||path.join(import.meta.dirname,'repair-preview'));
await fs.mkdir(out,{recursive:true});
const ppt=await PresentationFile.importPptx(await FileBlob.load(input)),images=[];
for(let i=0;i<ppt.slides.items.length;i++){
 const blob=await ppt.export({slide:ppt.slides.items[i],format:'png',scale:1.5});
 const bytes=new Uint8Array(await blob.arrayBuffer()),name=`slide-${String(i+1).padStart(2,'0')}.png`;
 await fs.writeFile(path.join(out,name),bytes);images.push({slide:i+1,path:name,sha256:createHash('sha256').update(bytes).digest('hex')});
 console.log('Rendered',i+1);
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({date:'2026-10-29',renderer:'First-party artifact-tool supplemental import/export',native_office_validation:false,input_sha256:createHash('sha256').update(await fs.readFile(input)).digest('hex'),images},null,2)+'\n');
