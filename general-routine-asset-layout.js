"use strict";
const crypto=require("node:crypto");
const manifest=require("./general-routine-asset-manifest.json");
const ROOT="routines/library/v1/general";
const collections=Object.freeze(Object.fromEntries(manifest.collections.map(c=>{
  const hash=crypto.createHash("sha256").update(JSON.stringify(c.files)).digest("hex");
  return [c.route,Object.freeze({...c,hash,readyPath:`${c.base}/_ready-${hash}.json`})];
})));
const aliases=new Map();
for(const c of Object.values(collections))for(const file of c.files){
  if(!aliases.has(file.alias))aliases.set(file.alias,[]);
  aliases.get(file.alias).push(file);
}
const isMissing=error=>Number(error?.code)===404||Number(error?.status)===404;
async function resolveAlias(loader,url){
  const files=aliases.get(String(url||"").split(/[?#]/)[0]);
  if(!files)return null;
  for(const file of files){
    try{
      const marker=await loader(collections[file.route].readyPath);
      if(marker.totalSize>0)return await loader(file.destination);
    }catch(error){if(!isMissing(error))throw error;}
  }
  return null;
}
module.exports={ROOT,collections,aliases,resolveAlias,isMissing};
