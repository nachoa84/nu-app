#!/usr/bin/env node
"use strict";
// Genera un índice de las referencias existentes; no cambia contenido ni URLs.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const context={};
vm.runInNewContext(read("routine-content.js")+"\n"+read("routine-content-collagen-8-30.js")+"\nresult=days",context);
const productLines=read("routine-products-v92.js").split("\n");
const config=JSON.parse(productLines.find(l=>l.startsWith("const ROUTINE_CATALOG = ")).slice("const ROUTINE_CATALOG = ".length,-1));
const products=JSON.parse(productLines.find(l=>l.startsWith("const PRODUCT_ROUTINE_DAYS = ")).slice("const PRODUCT_ROUTINE_DAYS = ".length,-1));
const posterContext={window:{}};vm.runInNewContext(read("routine-video-posters.generated.js"),posterContext);
const generated=posterContext.window.NuRoutineVideoPosters;
const ui=read("ui-core.js");const mapStart=ui.indexOf("const LUMISPA_DAY1_VIDEO_POSTERS");
const mapEnd=ui.indexOf("\nfunction resolveRoutineVideoPoster",mapStart);
const posterOverrides={};vm.runInNewContext(ui.slice(mapStart,mapEnd)+"\nresult=Object.fromEntries(LUMISPA_DAY1_VIDEO_POSTERS)",posterOverrides);
const ids=["collagen-30","lumispa-10","galvanicspa-10","wellspa-10"];
const collectionData={"collagen-30":context.result,...Object.fromEntries(Object.entries(products).map(([id,p])=>[id,p.days]))};
const seenLocal=new Map();
function location(url){
 const clean=String(url||"").split(/[?#]/)[0];
 if(clean.startsWith("/api/routine-assets/"))return {source:"routines/active/"+clean.slice("/api/routine-assets/".length),alias:clean};
 if(!clean.startsWith("assets/"))return null;
 if(clean.includes("..")||clean.includes("\\"))throw Error("Ruta local no permitida");
 const filename=path.join(root,clean);if(!fs.existsSync(filename))throw Error("Falta archivo local: "+clean);
 if(!seenLocal.has(clean))seenLocal.set(clean,crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex"));
 return {source:"local:"+clean,alias:"/"+clean,sha256:seenLocal.get(clean)};
}
const collections=[];
for(const id of ids){
 const conf=config[id],files=[];let materials=0;
 function add(url,day,index,role){
  const item=location(url);if(!item)return;
  const ext=path.extname(item.alias).toLowerCase().slice(1);
  if(!["jpg","jpeg","png","mp4","mov","webp","pdf"].includes(ext))throw Error("Formato inesperado: "+url);
  const dayFolder=day?`day-${String(day).padStart(2,"0")}`:"appearance";
  files.push({route:id,day,index,role,destination:`routines/library/v1/general/${id}/${dayFolder}/${role}/${String(index).padStart(2,"0")}.${ext}`,sources:[item.source],alias:item.alias,...(item.sha256?{sha256:item.sha256}:{})});
 }
 add(conf.cover,0,1,"covers");if(conf.hero)add(conf.hero,0,1,"heroes");
 const days=collectionData[id];
 if(Object.keys(days).length!==conf.totalDays)throw Error("Cantidad de días inesperada: "+id);
 for(let day=1;day<=conf.totalDays;day++){
  let index=0;
  for(const block of days[day].blocks){
   const resources=[];
   if(block.type==="media"&&location(block.src))resources.push({url:block.src,block});
   if(block.type==="action"&&location(block.url))resources.push({url:block.url});
   for(const link of block.links||[])if(location(link.url))resources.push({url:link.url});
   for(const resource of resources){
    index++;materials++;add(resource.url,day,index,"originals");
    const b=resource.block;
    if(b?.thumbnail)add(b.thumbnail,day,index,"thumbnails");
    if(b?.mediaType==="video"){
     const clean=b.src.split(/[?#]/)[0];
     const poster=b.poster||generated[clean]||posterOverrides.result[clean]||(/^assets\/collagen\/day-\d+\//.test(clean)?clean.replace(/\.(mp4|mov|m4v|webm)$/i,".poster.jpg"):null);
     if(poster)add(poster,day,index,"posters");
    }
   }
  }
 }
 collections.push({route:id,days:conf.totalDays,materials,base:`routines/library/v1/general/${id}`,files});
}
const target=path.join(root,"general-routine-asset-manifest.json");
fs.writeFileSync(target,JSON.stringify({version:1,collections},null,2)+"\n");
for(const c of collections)console.log(`${c.route}: ${c.days} días, ${c.materials} recursos, ${c.files.length} archivos`);
console.log("Referencias locales verificadas: "+seenLocal.size);
