#!/usr/bin/env node
"use strict";

// Prueba reversible de compresión móvil para los dos videos pesados del día 6.
// Solo LEE App Storage y crea MP4 de comparación en /tmp.
// NO sube, NO reemplaza originales, NO cambia el catálogo.

const fs=require("node:fs");
const fsp=require("node:fs/promises");
const path=require("node:path");
const os=require("node:os");
const {spawn,spawnSync}=require("node:child_process");
const {pipeline}=require("node:stream/promises");
const {Client}=require("@replit/object-storage");
const MOVIES=[
  {folder:"ES COLAGENO",label:"Collagen+ España día 6 material 2",filename:"collagen-es-dia6-optimizado.mp4"},
  {folder:"IT COLAGENO",label:"Collagen+ Italia día 6 material 2",filename:"collagen-it-dia6-optimizado.mp4"}
];
const PREFIX="bot/active/international/v1";

function run(name,args){
  return new Promise((resolve,reject)=>{
    const p=spawn(name,args,{stdio:["ignore","ignore","pipe"]});
    let error="";
    p.stderr.on("data",x=>error=(error+x.toString()).slice(-6000));
    p.once("error",reject);
    p.once("close",code=>code===0?resolve():reject(Error(name+" código "+code+": "+error)));
  });
}
function sizeMB(bytes){return (bytes/1048576).toFixed(2)+" MB";}
function inspect(filename){
  const p=spawnSync("ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type,codec_name,width,height","-of","json",filename],{encoding:"utf8",timeout:60000});
  if(p.error||p.status!==0)throw Error("No se pudo inspeccionar el MP4: "+(p.stderr||p.error?.message||""));
  return JSON.parse(p.stdout);
}
async function main(){
  for(const name of ["ffmpeg","ffprobe"]){
    const p=spawnSync(name,["-version"],{encoding:"utf8",timeout:10000});
    if(p.error||p.status!==0)throw Error(name+" no está disponible.");
  }
  const bucket=await new Client().getBucket();
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),"nu-day6-compression-pilot-"));
  console.log("CARPETA DE PRUEBA:",dir);
  console.log("Sin subidas ni cambios en Nu App.");
  for(const [i,item] of MOVIES.entries()){
    const objectName=[PREFIX,item.folder,"DIA 6","2.mp4"].join("/");
    console.log("\n["+(i+1)+"/2] "+item.label);
    const file=bucket.file(objectName);
    const [metadata]=await file.getMetadata();
    const expected=Number(metadata.size);
    if(!Number.isSafeInteger(expected)||expected<=0)throw Error("MP4 original inválido: "+objectName);
    const source=path.join(dir,"fuente-"+(i+1)+".mp4");
    const output=path.join(dir,item.filename);
    await pipeline(file.createReadStream({decompress:false}),fs.createWriteStream(source));
    if((await fsp.stat(source)).size!==expected)throw Error("Descarga incompleta: "+objectName);
    console.log("  Fuente:",sizeMB(expected));
    console.log("  Convirtiendo a 720px / H.264 Main / AAC, alta calidad móvil...");
    await run("ffmpeg",[
      "-hide_banner","-nostdin","-loglevel","error","-n","-i",source,
      "-map","0:v:0","-map","0:a?",
      "-vf","scale=720:-2","-c:v","libx264","-preset","slow","-crf","22",
      "-maxrate","2500k","-bufsize","5000k","-pix_fmt","yuv420p",
      "-profile:v","main","-level","3.1",
      "-c:a","aac","-b:a","96k","-movflags","+faststart",output
    ]);
    const info=inspect(output);
    const video=(info.streams||[]).find(x=>x.codec_type==="video");
    if(video?.codec_name!=="h264"||video.width!==720)throw Error("Formato optimizado incorrecto.");
    const stat=await fsp.stat(output);
    console.log("  Resultado:",sizeMB(stat.size),"("+Math.round(100*(1-stat.size/expected))+"% menos)");
    console.log("  Resolución:",video.width+"x"+video.height," Duración:",Number(info.format?.duration).toFixed(2)+" s");
    console.log("  Archivo local:",output);
    await fsp.unlink(source); // Solo elimina la copia temporal creada por el script.
  }
  console.log("\nPRUEBA COMPLETADA: 2 MP4 locales para evaluar calidad; NO se subieron.");
}
main().catch(e=>{console.error("PRUEBA DETENIDA:",e.message);process.exitCode=1;});
