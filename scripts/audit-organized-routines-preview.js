#!/usr/bin/env node
"use strict";
// Solo lectura: revisa la activación, todas las rutas y Range de los videos.
const {layout}=require("./organize-all-routine-assets-preview");
function checksFor(routes){
  const checks=new Map();
  for(const route of routes){
    const c=layout.collections[route];if(!c)throw Error("Colección desconocida: "+route);
    for(const f of c.files){
      const ext=f.destination.split(".").pop();
      const type=ext==="mp4"?"video/mp4":ext==="mov"?"video/quicktime":ext==="pdf"?"application/pdf":ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg";
      let url=f.alias;
      if(!url){
        url=`/api/international-assets/${route}/${f.day}/${f.index}`;
        if(f.role==="poster")url+="?poster=first-frame";
        if(["preview","thumb"].includes(f.role))url+="?variant="+f.role;
        if(f.role==="optimized")url+="?v=optimized-preview-20261106";
      }
      checks.set(url+"/HEAD",{url,method:"HEAD",type,range:false});
      if(type.startsWith("video/"))checks.set(url+"/GET",{url,method:"GET",type,range:true});
    }
  }
  return [...checks.values()];
}
async function audit({base="http://127.0.0.1:5000",routes=Object.keys(layout.collections),fetchImpl=fetch,log=console.log}={}){
  const response=await fetchImpl(base+"/api/routine-library-status",{signal:AbortSignal.timeout(20000),cache:"no-store"});
  if(!response.ok)throw Error("No responde el estado de organización: HTTP "+response.status);
  const status=await response.json();
  if(status.layout!=="library-v1"||!Array.isArray(status.collections))throw Error("El servidor no tiene la versión organizada");
  for(const route of routes){
    const expected=layout.collections[route];
    if(!expected)throw Error("Colección desconocida: "+route);
    const actual=status.collections.find(c=>c.id===route&&c.ready===true);
    if(!actual)throw Error("Todavía no está verificada la copia de "+route);
    if(actual.days!==expected.days||actual.materials!==expected.materials||actual.files!==expected.files.length)throw Error("El inventario del servidor no coincide: "+route);
  }
  const checks=checksFor(routes),problems=[];let cursor=0,done=0;
  async function worker(){
    while(cursor<checks.length){
      const check=checks[cursor++];let r;
      try{
        r=await fetchImpl(base+check.url,{method:check.method,headers:check.range?{Range:"bytes=0-0"}:{},signal:AbortSignal.timeout(20000),cache:"no-store"});
        if(r.status!==(check.range?206:200))throw Error("HTTP "+r.status);
        if(r.headers.get("x-nu-asset-layout")!=="library-v1")throw Error("Se está usando la ruta anterior");
        if((r.headers.get("content-type")||"").split(";")[0]!==check.type)throw Error("Tipo de archivo inesperado");
        if(!(Number(r.headers.get("content-length"))>0))throw Error("Archivo sin tamaño");
        if(check.range&&(r.headers.get("content-length")!=="1"||!/^bytes 0-0\/\d+$/.test(r.headers.get("content-range")||"")))throw Error("Range incorrecto");
      }catch(error){problems.push(check.url+": "+error.message);}
      finally{await r?.body?.cancel?.();done++;if(done%50===0)log(`Verificadas ${done}/${checks.length} solicitudes`);}
    }
  }
  await Promise.all(Array.from({length:5},worker));
  log(`${routes.length} colecciones, ${checks.length} comprobaciones; errores: ${problems.length}`);
  if(problems.length)throw Error(problems.slice(0,30).join("\n"));
  log("Todas las rutas organizadas respondieron correctamente. No se modificó nada.");
  return {collections:routes.length,checks:checks.length};
}
async function main(){
  let port=5000;const routes=[];
  for(const arg of process.argv.slice(2)){
    if(arg.startsWith("--port=")){port=Number(arg.slice(7));continue;}
    if(arg.startsWith("--collection=")){routes.push(arg.slice(13));continue;}
    throw Error("Usá opcionalmente --port=5000 y --collection=collagen-30");
  }
  if(!Number.isInteger(port)||port<1||port>65535)throw Error("Puerto inválido");
  await audit({base:"http://127.0.0.1:"+port,routes:routes.length?[...new Set(routes)]:Object.keys(layout.collections)});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={audit,checksFor};
