#!/usr/bin/env node
"use strict";

// Biblioteca Internacional · variantes visuales para 82 imágenes originales.
// Solo AÑADE *.preview.jpg y *.thumb.jpg; no altera originales, catálogo,
// suplementos ni publicación. Reanudable, verifica SHA-256 después de subir.
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const {pipeline}=require("node:stream/promises");
const {Client}=require("@replit/object-storage");
const catalog=require("../biblioteca-internacional-catalog.json");

const BRANCH="feature/iris-biblioteca-internacional-20261102";
const ROOT="bot/active/international/v1";
const FOLDERS={"collagen/es":"ES COLAGENO","collagen/it":"IT COLAGENO","lumispa/it":"IT LUMI"};
const MODE=process.argv[2]||"--plan";
if(!["--plan","--upload"].includes(MODE))throw Error("Usá --plan o --upload");

function run(bin,args,timeout=180000){
  const result=spawnSync(bin,args,{encoding:"utf8",timeout,maxBuffer:2*1024*1024});
  if(result.error||result.status!==0)throw Error(bin+": "+(result.stderr||result.error?.message||"exit "+result.status));
  return result.stdout;
}
function listImages(){
  const all=[];
  for(const [key,files]of Object.entries(catalog)){
    const [kind,country,d]=key.split("/");
    const folder=FOLDERS[kind+"/"+country],day=Number(d);
    if(!folder||!Number.isInteger(day)||day<1||day>10||!Array.isArray(files))throw Error("Catálogo inesperado "+key);
    files.forEach((file,index)=>{
      if(file.type!=="image")return;
      if(!/^[0-9]+\.jpg$/i.test(file.filename))throw Error("Nombre de imagen inesperado "+file.filename);
      const base=file.filename.replace(/\.jpg$/i,"");
      all.push({key,folder,day,index:index+1,source:file.filename,
        preview:base+".preview.jpg",thumb:base+".thumb.jpg"});
    });
  }
  if(Object.keys(catalog).length!==30||all.length!==82)throw Error("Se esperaban 30 días y 82 imágenes.");
  return all;
}
async function exists(storage,name){
  const response=await storage.exists(name);
  if(!response.ok)throw Error("Error consultando "+name+": "+response.error?.message);
  return response.value===true;
}
async function locate(storage,item){
  for(const dayName of ["DIA "+item.day,"DÍA "+item.day]){
    for(const candidate of [item.source,item.source.toUpperCase()]){
      const source=[ROOT,item.folder,dayName,candidate].join("/");
      if(await exists(storage,source)){
        const root=[ROOT,item.folder,dayName].join("/");
        return {...item,sourceObject:source,
          previewObject:root+"/"+item.preview,thumbObject:root+"/"+item.thumb};
      }
    }
  }
  throw Error("JPG original no encontrado "+item.key+"/"+item.index);
}
function dimensions(filename){
  const info=JSON.parse(run("ffprobe",["-v","error","-show_entries","stream=codec_type,width,height","-of","json",filename]));
  const stream=info.streams?.find(s=>s.codec_type==="video");
  if(!stream||!Number.isInteger(stream.width)||!Number.isInteger(stream.height)||stream.width<20||stream.height<20)
    throw Error("Dimensiones inválidas "+filename);
  return [stream.width,stream.height];
}
function resize(src,out,maxW,maxH,quality){
  const [w,h]=dimensions(src);
  const factor=Math.min(1,maxW/w,maxH/h);
  const destW=Math.max(1,Math.round(w*factor)),destH=Math.max(1,Math.round(h*factor));
  run("ffmpeg",["-hide_banner","-nostdin","-loglevel","error","-n","-i",src,
    "-vf","scale="+destW+":"+destH,"-frames:v","1","-q:v",String(quality),out]);
  const [resultW,resultH]=dimensions(out);
  if(resultW!==destW||resultH!==destH)throw Error("Redimensión inesperada "+out);
}
async function shaFile(filename){
  const hash=crypto.createHash("sha256");
  for await(const chunk of fs.createReadStream(filename))hash.update(chunk);
  return hash.digest("hex");
}
async function verify(bucket,remote,local){
  const stat=await fsp.stat(local),expected=await shaFile(local);
  const obj=bucket.file(remote),[meta]=await obj.getMetadata();
  if(meta.contentType!=="image/jpeg"||Number(meta.size)!==stat.size)throw Error("Metadatos inválidos "+remote);
  let size=0;const hash=crypto.createHash("sha256");
  for await(const part of obj.createReadStream({decompress:false})){size+=part.length;hash.update(part);}
  if(size!==stat.size||hash.digest("hex")!==expected)throw Error("SHA-256 distinto: "+remote);
}
async function upsert(storage,bucket,name,local){
  if(await exists(storage,name)){
    await verify(bucket,name,local);
    return "Ya existía y coincide";
  }
  const result=await storage.uploadFromFilename(name,local,{contentType:"image/jpeg"});
  if(!result.ok)throw Error("No se pudo subir "+name+": "+result.error?.message);
  await verify(bucket,name,local);
  return "Nuevo y verificado";
}
async function main(){
  if(run("git",["branch","--show-current"]).trim()!==BRANCH)throw Error("Rama incorrecta; requiere "+BRANCH);
  const images=listImages(),storage=new Client(),bucket=await storage.getBucket();
  const planned=[];
  for(const item of images){
    const loc=await locate(storage,item);
    const previewExists=await exists(storage,loc.previewObject);
    const thumbExists=await exists(storage,loc.thumbObject);
    planned.push({...loc,previewExists,thumbExists});
  }
  console.log("Imágenes del catálogo:",planned.length);
  console.log("Variantes pendientes:",planned.reduce((n,x)=>n+(!x.previewExists)+(!x.thumbExists),0),"/",planned.length*2);
  if(MODE==="--plan"){
    console.log("PLAN DE SOLO LECTURA; no se escribió ningún archivo.");
    console.log("Ejecutá: node _backup-international-pilot/prepare-all-image-previews.js --upload");
    return;
  }
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),"nu-intl-img-previews-"));
  let count=0;
  try{
    for(const [i,item]of planned.entries()){
      const original=path.join(temp,"original.jpg");
      const preview=path.join(temp,"preview.jpg");
      const thumb=path.join(temp,"thumb.jpg");
      console.log("["+(i+1)+"/"+planned.length+"] "+item.key+"/"+item.index);
      const remote=bucket.file(item.sourceObject),[meta]=await remote.getMetadata();
      const sourceSize=Number(meta.size);
      if(!Number.isSafeInteger(sourceSize)||sourceSize<500||sourceSize>60*1024*1024)throw Error("Tamaño de origen inesperado");
      await pipeline(remote.createReadStream({decompress:false}),fs.createWriteStream(original));
      if((await fsp.stat(original)).size!==sourceSize)throw Error("Origen incompleto "+item.sourceObject);
      resize(original,preview,960,1600,4);
      resize(original,thumb,240,360,5);
      let previewSize=await fsp.stat(preview);
      if(previewSize.size>900*1024){
        await fsp.unlink(preview);
        resize(original,preview,800,1400,6);
        previewSize=await fsp.stat(preview);
      }
      const thumbSize=await fsp.stat(thumb);
      if(previewSize.size>1200*1024||thumbSize.size>350*1024)throw Error("Variante demasiado grande: "+item.key);
      console.log("  Original "+Math.round(sourceSize/1024)+"KB → preview "+Math.round(previewSize.size/1024)+
        "KB, miniatura "+Math.round(thumbSize.size/1024)+"KB");
      console.log("  "+await upsert(storage,bucket,item.previewObject,preview));
      console.log("  "+await upsert(storage,bucket,item.thumbObject,thumb));
      count++;
      await Promise.all([fsp.unlink(original),fsp.unlink(preview),fsp.unlink(thumb)]);
    }
  }finally{
    await fsp.rm(temp,{recursive:true,force:true});
  }
  console.log("\nIMÁGENES OPTIMIZADAS Y VERIFICADAS "+count+"/"+planned.length);
  console.log("JPG originales y catálogo intactos; las nuevas variantes aún no están activadas.");
}
main().catch(error=>{
  console.error("LOTE DETENIDO:",error.message);
  console.error("No se sobrescribieron originales. Podés reanudar con --upload.");
  process.exitCode=1;
});
