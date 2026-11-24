"use strict";
const crypto = require("node:crypto");
const catalog = require("./biblioteca-internacional-catalog.json");
const combo = require("./international-combo-es");
const portugal = require("./international-collagen-pt");
const ROOT = "routines/international/v1";
const legacyRoot = "bot/active/international/v1";
const optimizedRoot = "bot/preview/international/optimized-20261106";
const definitions = Object.freeze({
  "collagen-es": {id:"collagen/es", country:"es", strategy:"collagen", folder:"ES COLAGENO", prefix:legacyRoot, days:10},
  "collagen-it": {id:"collagen/it", country:"it", strategy:"collagen", folder:"IT COLAGENO", prefix:legacyRoot, days:10},
  "lumispa-it": {id:"lumispa/it", country:"it", strategy:"lumispa", folder:"IT LUMI", prefix:legacyRoot, days:10},
  "lumispa-collagen-es": {id:combo.id, country:"es", strategy:"lumispa-collagen", folder:combo.manifest.folder, prefix:combo.manifest.prefix, days:7},
  "collagen-pt": {id:portugal.id, country:"pt", strategy:"collagen", folder:portugal.manifest.folder, prefix:portugal.manifest.prefix, days:7}
});
const optimized = new Set(["collagen/it/3/4","lumispa/it/3/3","collagen/it/6/2","collagen/es/6/2","lumispa/it/6/3"]);
const pad = number => String(number).padStart(2,"0");
function sourceCandidates(def, day, filename, prefix=def.prefix) {
  const names=/\.jpg$/i.test(filename)?[filename,filename.replace(/\.jpg$/i,".JPG")]:[filename];
  return [`DIA ${day}`,`DÍA ${day}`].flatMap(folder=>names.map(name=>`${prefix}/${def.folder}/${folder}/${name}`));
}
function buildCollection(route) {
  const def=definitions[route];
  if(!def)throw Error("Colección desconocida: "+route);
  const base=`${ROOT}/${def.country}/${def.strategy}`;
  const files=[];
  let materials=0;
  for(let day=1;day<=def.days;day++){
    const items=catalog[`${def.id}/${day}`];
    if(!Array.isArray(items)||!items.length)throw Error("Falta día: "+def.id+"/"+day);
    items.forEach((item,position)=>{
      const index=position+1;
      if(!/^\d+\.(?:jpg|png|mp4)$/.test(item.filename)||!["image","video"].includes(item.type))throw Error("Formato no aprobado");
      const extension=item.filename.split(".").pop();
      const add=(role,sourceFilename,folder,ext=extension,sources)=>files.push(Object.freeze({
        route,day,index,role,
        destination:`${base}/day-${pad(day)}/${folder}/${pad(index)}.${ext}`,
        sources:sources||sourceCandidates(def,day,sourceFilename)
      }));
      add("original",item.filename,"originals");
      if(item.type==="image"){
        add("preview",item.filename.replace(/\.(jpg|png)$/, ".preview.jpg"),"previews","jpg");
        add("thumb",item.filename.replace(/\.(jpg|png)$/, ".thumb.jpg"),"thumbnails","jpg");
      }else{
        add("poster",item.filename.replace(/\.mp4$/, ".jpg"),"posters","jpg");
        if(optimized.has(`${def.id}/${day}/${index}`)){
          add("optimized",item.filename,"optimized","mp4",[
            ...sourceCandidates(def,day,item.filename,optimizedRoot),
            ...sourceCandidates(def,day,item.filename)
          ]);
        }
      }
      materials++;
    });
  }
  const hash=crypto.createHash("sha256").update(JSON.stringify(files)).digest("hex");
  return Object.freeze({route,...def,base,materials,files:Object.freeze(files),hash,readyPath:`${base}/_ready-${hash}.json`});
}
const collections=Object.freeze(Object.fromEntries(Object.keys(definitions).map(route=>[route,buildCollection(route)])));
const fileIndex=new Map(Object.values(collections).flatMap(c=>c.files.map(f=>[`${f.route}/${f.day}/${f.index}/${f.role}`,f])));
const isMissing=error=>Number(error?.code)===404||Number(error?.status)===404;
async function resolveAsset(loader, route, day, index, role) {
  const collection=collections[route];
  const file=fileIndex.get(`${route}/${day}/${index}/${role}`);
  if(!collection||!file)return null;
  try{
    const marker=await loader(collection.readyPath);
    if(!(marker.totalSize>0))return null;
    return await loader(file.destination);
  }catch(error){if(isMissing(error))return null;throw error;}
}
module.exports={ROOT,collections,resolveAsset,isMissing};
