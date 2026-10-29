// Render the editable SVG originals. This does not create or modify PPTX files.
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
 const dir = path.join(__dirname, 'assets/diagrams');
 const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1200,height:430},deviceScaleFactor:2});
  const geometry=[];
  for(const name of (await fs.readdir(dir)).filter(f=>f.endsWith('.svg')).sort()) {
   await page.setContent('<body style="margin:0">'+await fs.readFile(path.join(dir,name),'utf8'));
   const outside=await page.locator('svg text').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBBox();return{text:n.textContent,x:b.x,y:b.y,w:b.width,h:b.height};}).filter(b=>b.x<0||b.y<0||b.x+b.w>1200||b.y+b.h>430));
   if(outside.length)throw new Error(name+': text outside canvas '+JSON.stringify(outside));
   await page.locator('svg').screenshot({path:path.join(dir,name.replace('.svg','.png'))});
   geometry.push({name,outside_text_count:outside.length});
  }
  await fs.writeFile(path.join(__dirname,'assets/figure-geometry.json'),JSON.stringify({viewport:[1200,430],device_scale_factor:2,figures:geometry},null,2)+'\n');
  console.log('Rendered and checked '+geometry.length+' SVG figures');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
