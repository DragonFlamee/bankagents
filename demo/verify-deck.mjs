import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const {FileBlob,PresentationFile}=await import(pathToFileURL(process.env.TRACEBANK_ARTIFACT_MODULE || 'C:/Users/DA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs'));
const deck=await PresentationFile.importPptx(await FileBlob.load(path.join(root,'demo/tracebank-defense-final.pptx')));
for(let i=0;i<deck.slides.items.length;i++){
 const png=await deck.export({slide:deck.slides.items[i],format:'png',scale:1});
 await fs.writeFile(path.join(root,'demo/slides',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
}
console.log('Rendered exact final PPTX:',deck.slides.items.length,'slides');
