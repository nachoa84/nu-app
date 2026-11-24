#!/usr/bin/env node
"use strict";
// Copia verificada. Nunca elimina ni reemplaza objetos; no publica la app.
const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const layout=require("../international-asset-layout");
function validMetadata(meta){
  if(!meta||!/^\d+$/.test(String(meta.size))||Number(meta.size)<=0||!meta.md5Hash||!meta.generation){
    throw Error("No se puede verificar tamaño, MD5 y generación del archivo");
  }
}
function matches(a,b){return String(a.size)===String(b.size)&&a.md5Hash===b.md5Hash&&a.contentType===b.contentType;}
async function metadata(bucket,name){
  try{return(await bucket.file(name).getMetadata())[0];}
  catch(error){if(layout.isMissing(error))return null;throw error;}
}
async function inspect(bucket,routes){
  const plans=[];
  const problems=[];
  for(const route of routes){
    const collection=layout.collections[route];
    if(!collection)throw Error("Colección desconocida: "+route);
    for(const file of collection.files){
      let source=null,sourceMeta=null;
      for(const candidate of file.sources){
        sourceMeta=await metadata(bucket,candidate);
        if(sourceMeta){source=candidate;break;}
      }
      if(!source){problems.push("Falta: "+file.sources[0]);continue;}
      try{validMetadata(sourceMeta);}catch(error){problems.push(source+": "+error.message);continue;}
      const existing=await metadata(bucket,file.destination);
      if(existing&&!matches(existing,sourceMeta)){problems.push("Destino distinto; no se sobrescribe: "+file.destination);continue;}
      plans.push({...file,source,sourceMeta,exists:!!existing});
    }
  }
  if(problems.length)throw Error("Revisión detenida, sin copiar archivos:\n"+problems.join("\n"));
  return plans;
}
function assertPlans(plans,routes){
  const expected=routes.flatMap(route=>layout.collections[route]?.files||[]);
  if(!expected.length||plans.length!==expected.length)throw Error("Lote incompleto");
  plans.forEach((plan,index)=>{
    const approved=expected[index];
    if(plan.destination!==approved.destination||!approved.sources.includes(plan.source)||
       plan.route!==approved.route||!plan.destination.startsWith(layout.ROOT+"/"))throw Error("Plan no permitido");
    validMetadata(plan.sourceMeta);
  });
}
async function copyPlans(bucket,plans,routes,log=console.log){
  assertPlans(plans,routes);
  const report={version:1,collections:[],files:[]};
  for(const route of routes){
    const collection=layout.collections[route];
    const selected=plans.filter(p=>p.route===route);
    for(const plan of selected){
      let remote=await metadata(bucket,plan.destination);
      if(!remote){
        // La generación fija asegura que se copia la versión que se revisó.
        const source=bucket.file(plan.source,{generation:String(plan.sourceMeta.generation)});
        try{
          await source.copy(bucket.file(plan.destination),{preconditionOpts:{ifGenerationMatch:0}});
        }catch(error){
          // Otra ejecución puede haber creado el mismo destino: verificarlo.
          if(Number(error?.code)!==412)throw error;
        }
        remote=await metadata(bucket,plan.destination);
      }
      if(!remote||!matches(remote,plan.sourceMeta))throw Error("Verificación falló; colección sin activar: "+plan.destination);
      report.files.push({source:plan.source,destination:plan.destination,size:remote.size,md5:remote.md5Hash});
      log("Verificado: "+plan.destination);
    }
    // Cada colección se activa solo después de verificar todos sus objetos.
    const bytes=Buffer.from(JSON.stringify({layoutHash:collection.hash,materials:collection.materials,objects:selected.length}));
    const markerMeta={size:String(bytes.length),md5Hash:crypto.createHash("md5").update(bytes).digest("base64"),contentType:"application/json"};
    let marker=await metadata(bucket,collection.readyPath);
    if(!marker){
      try{
        await bucket.file(collection.readyPath).save(bytes,{resumable:false,metadata:{contentType:"application/json"},preconditionOpts:{ifGenerationMatch:0}});
      }catch(error){if(Number(error?.code)!==412)throw error;}
      marker=await metadata(bucket,collection.readyPath);
    }
    if(!marker||!matches(marker,markerMeta))throw Error("Marcador final distinto: "+collection.readyPath);
    report.collections.push({route,materials:collection.materials,objects:selected.length,readyPath:collection.readyPath});
    log("Colección organizada y verificada: "+route);
  }
  return report;
}
async function main(){
  const args=process.argv.slice(2);
  const routes=[];
  for(const arg of args){
    if(arg.startsWith("--collection=")){routes.push(arg.slice(13));continue;}
    if(!["--dry-run","--copy"].includes(arg))throw Error("Usá --dry-run o --copy y opcionalmente --collection=collagen-pt");
  }
  if(args.includes("--copy")&&args.includes("--dry-run"))throw Error("Elegí un solo modo");
  if(process.env.REPLIT_DEPLOYMENT==="1"||process.env.NODE_ENV==="production")throw Error("Ejecutar solo en el workspace de Replit");
  const selected=routes.length?[...new Set(routes)]:Object.keys(layout.collections);
  if(selected.some(route=>!layout.collections[route]))throw Error("Colección desconocida");
  const {Client}=require("@replit/object-storage");
  const bucket=await new Client().getBucket();
  console.log("Revisando las fuentes y los destinos; todavía no se copia nada…");
  const plans=await inspect(bucket,selected);
  console.log(`${selected.length} colecciones, ${plans.length} archivos: ${plans.filter(p=>p.exists).length} ya coinciden.`);
  if(!args.includes("--copy")){console.log("Revisión terminada. No se modificó almacenamiento. Para copiar: --copy");return;}
  const report=await copyPlans(bucket,plans,selected);
  const target=path.join(__dirname,"_audit-output","europe-organized-v1.json");
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
  console.log("Listo. Copias verificadas; originales conservados. Informe: "+target);
  console.log("Reiniciá Run y revisá el preview. No se publicó la app.");
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={inspect,copyPlans};
