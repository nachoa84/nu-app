#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const europe=require("../international-asset-layout");
const general=require("../general-routine-asset-layout");
const {inspect,copyPlans}=require("./organize-europe-assets-preview");
const layout={ROOT:"routines/library/v1",collections:{...general.collections,...europe.collections}};
async function main(){
  const args=process.argv.slice(2),routes=[];
  for(const arg of args){
    if(arg.startsWith("--collection=")){routes.push(arg.slice(13));continue;}
    if(!["--dry-run","--copy"].includes(arg))throw Error("Usá --dry-run o --copy y opcionalmente --collection=collagen-30");
  }
  if(args.includes("--copy")&&args.includes("--dry-run"))throw Error("Elegí un solo modo");
  if(process.env.REPLIT_DEPLOYMENT==="1"||process.env.NODE_ENV==="production")throw Error("Ejecutar solo en el workspace de Replit");
  const selected=routes.length?[...new Set(routes)]:Object.keys(layout.collections);
  if(selected.some(route=>!layout.collections[route]))throw Error("Colección desconocida");
  const {Client}=require("@replit/object-storage");const bucket=await new Client().getBucket();
  console.log("Revisión de fuentes, archivos locales y destinos. Todavía no se copia nada…");
  // Revisar todas las colecciones elegidas antes de realizar cualquier escritura.
  const plans=await inspect(bucket,selected,layout);
  console.log(`${selected.length} colecciones, ${plans.length} archivos; ${plans.filter(p=>p.exists).length} ya coinciden.`);
  if(!args.includes("--copy")){console.log("Revisión terminada, sin modificaciones. Para copiar: --copy");return;}
  const report=await copyPlans(bucket,plans,selected,console.log,layout);
  const target=path.join(__dirname,"_audit-output","all-routines-organized-v1.json");
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
  console.log("Copia terminada y verificada. Originales y URLs conservados. Informe: "+target);
  console.log("Reiniciá Run y comprobá todas las rutinas en preview. No se publicó la app.");
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={layout};
