#!/usr/bin/env node
"use strict";

// Copia aprobada de cinco MP4 internacionales a un prefijo NUEVO de prueba.
// No reemplaza ni elimina objetos "bot/active" y no publica cambios.
const fs=require("node:fs");
const path=require("node:path");
const { Client }=require("@replit/object-storage");

const root=path.resolve(__dirname,"..");
const folder=path.join(root,"assets","international-optimization-review");
const catalog=require(path.join(root,"biblioteca-internacional-catalog.json"));
const previewPrefix="bot/preview/international/optimized-20261106";
const targets=[
  {product:"collagen",country:"it",day:3,index:4,folder:"IT COLAGENO"},
  {product:"lumispa",country:"it",day:3,index:3,folder:"IT LUMI"},
  {product:"collagen",country:"it",day:6,index:2,folder:"IT COLAGENO"},
  {product:"collagen",country:"es",day:6,index:2,folder:"ES COLAGENO"},
  {product:"lumispa",country:"it",day:6,index:3,folder:"IT LUMI"}
];
const upload=process.argv.includes("--upload-preview");
if(process.argv.some(arg=>!["--dry-run","--upload-preview"].includes(arg))){
  throw Error("Usá --dry-run o --upload-preview.");
}
const plans=targets.map(t=>{
  const item=catalog[t.product+"/"+t.country+"/"+t.day]?.[t.index-1];
  if(item?.type!=="video"||!/^([0-9]+)\.mp4$/i.test(item.filename)){
    throw Error("Catálogo cambió: "+t.product+"/"+t.country+"/"+t.day+"/"+t.index);
  }
  const stem=t.product+"-"+t.country+"-dia-"+t.day+"-material-"+t.index;
  const source=path.join(folder,stem+".mp4");
  if(!fs.existsSync(source))throw Error("Falta copia aprobada: "+source);
  const bytes=fs.statSync(source).size;
  if(bytes<10240||bytes>50*1024*1024)throw Error("Tamaño sospechoso: "+source);
  const destination=previewPrefix+"/"+t.folder+"/DIA "+t.day+"/"+item.filename;
  if(!destination.startsWith("bot/preview/international/"))throw Error("Destino no permitido");
  return {source,destination,bytes,stem};
});
console.log("Variantes aprobadas para Preview: "+plans.length);
for(const p of plans)console.log("  "+(p.bytes/1048576).toFixed(1)+" MB: "+p.stem+" → "+p.destination);
if(!upload){
  console.log("\nSolo comprobé archivos. No se subió ni modificó nada.");
  console.log("Para subir copias nuevas sin tocar originales: --upload-preview");
  process.exit(0);
}
(async()=>{
  const storage=new Client();
  const bucket=await storage.getBucket();
  let uploaded=0,already=0;
  for(const p of plans){
    const remote=bucket.file(p.destination);
    const [exists]=await remote.exists();
    if(exists){
      const [metadata]=await remote.getMetadata();
      if(Number(metadata.size)!==p.bytes){
        throw Error("Ya existe otra versión en "+p.destination+"; me detengo sin sobrescribir.");
      }
      console.log("Ya existe y coincide ("+p.stem+"); no sobrescribo.");
      already++;
      continue;
    }
    // Precondición GCS: crear solo si todavía no existe ninguna generación.
    await bucket.upload(p.source,{
      destination:p.destination,
      resumable:false,
      preconditionOpts:{ifGenerationMatch:0},
      metadata:{contentType:"video/mp4"}
    });
    const [metadata]=await remote.getMetadata();
    if(Number(metadata.size)!==p.bytes)throw Error("Verificación de tamaño falló: "+p.stem);
    console.log("Subida y verificada: "+p.stem+" ("+(p.bytes/1048576).toFixed(1)+" MB)");
    uploaded++;
  }
  console.log("\nListo: "+uploaded+" nuevas; "+already+" ya estaban. Orígenes intactos.");
})().catch(error=>{console.error("Error: "+(error.message||error));process.exitCode=1});
