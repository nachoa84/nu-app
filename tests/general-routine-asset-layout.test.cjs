"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),vm=require("node:vm");
const general=require("../general-routine-asset-layout");
const {layout}=require("../scripts/organize-all-routine-assets-preview");
const {inspect,copyPlans}=require("../scripts/organize-europe-assets-preview");
const {audit,checksFor}=require("../scripts/audit-organized-routines-preview");
const root=path.resolve(__dirname,"..");
function fakeBucket(routes){
  const objects=new Map(),writes=[],uploads=[],copies=[];
  const put=(name,bytes=Buffer.from(name),type)=>objects.set(name,{size:String(bytes.length),md5Hash:crypto.createHash("md5").update(bytes).digest("base64"),contentType:type||(name.endsWith(".mp4")?"video/mp4":"image/jpeg"),generation:"1"});
  for(const route of routes)for(const f of layout.collections[route].files)if(!f.sources[0].startsWith("local:"))put(f.sources[0]);
  const b={objects,writes,uploads,copies,file(name,options={}){return{
    name,
    async getMetadata(){if(!objects.has(name))throw Object.assign(Error("missing"),{code:404});return[{...objects.get(name)}];},
    async copy(dest,opts){assert.equal(opts.preconditionOpts.ifGenerationMatch,0);assert.equal(options.generation,objects.get(name).generation);assert.ok(!objects.has(dest.name));objects.set(dest.name,{...objects.get(name)});writes.push(dest.name);copies.push(dest.name);},
    async save(bytes,opts){assert.equal(opts.preconditionOpts.ifGenerationMatch,0);assert.ok(!objects.has(name));put(name,bytes,opts.metadata.contentType);writes.push(name);}
  };},async upload(filename,opts){assert.equal(opts.preconditionOpts.ifGenerationMatch,0);assert.ok(!objects.has(opts.destination));put(opts.destination,fs.readFileSync(filename),opts.metadata.contentType);writes.push(opts.destination);uploads.push(opts.destination);}};
  return b;
}
test("se conservan las cuatro rutinas, sesenta días y todos los recursos en orden",()=>{
  const context={};vm.runInNewContext(fs.readFileSync(path.join(root,"routine-content.js"),"utf8")+fs.readFileSync(path.join(root,"routine-content-collagen-8-30.js"),"utf8")+"\nresult=days",context);
  const products=JSON.parse(fs.readFileSync(path.join(root,"routine-products-v92.js"),"utf8").split("\n").find(l=>l.startsWith("const PRODUCT_ROUTINE_DAYS = ")).slice("const PRODUCT_ROUTINE_DAYS = ".length,-1));
  const daysById={"collagen-30":context.result,...Object.fromEntries(Object.entries(products).map(([k,p])=>[k,p.days]))};
  assert.deepEqual(Object.keys(general.collections),["collagen-30","lumispa-10","galvanicspa-10","wellspa-10"]);
  assert.equal(Object.values(general.collections).reduce((n,c)=>n+c.days,0),60);
  assert.equal(Object.values(general.collections).reduce((n,c)=>n+c.materials,0),319);
  for(const c of Object.values(general.collections))for(let day=1;day<=c.days;day++){
    const originals=c.files.filter(f=>f.day===day&&f.role==="originals");
    const expected=[];
    const add=url=>{if(url?.startsWith("assets/")||url?.startsWith("/api/routine-assets/"))expected.push(url.startsWith("/")?url:"/"+url);};
    for(const block of daysById[c.route][day].blocks){if(block.type==="media")add(block.src);if(block.type==="action")add(block.url);for(const link of block.links||[])add(link.url);}
    assert.deepEqual(originals.map(f=>f.alias),expected,c.route+"/"+day);
  }
});
test("nueve colecciones y 1039 destinos bajo la misma biblioteca",()=>{
  const cs=Object.values(layout.collections);assert.equal(cs.length,9);
  const files=cs.flatMap(c=>c.files);assert.equal(files.length,1039);
  assert.equal(cs.reduce((n,c)=>n+c.materials,0),518);
  assert.equal(new Set(files.map(f=>f.destination)).size,files.length);
  assert.ok(files.every(f=>f.destination.startsWith("routines/library/v1/")));
});
test("las 331 referencias locales conservan sus bytes originales",()=>{
  const files=new Map(Object.values(general.collections).flatMap(c=>c.files).filter(f=>f.sources[0].startsWith("local:")).map(f=>[f.sources[0],f]));
  assert.equal(files.size,331);
  for(const [source,file] of files){const bytes=fs.readFileSync(path.join(root,source.slice(6)));assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),file.sha256,source);}
});
test("la migración mixta sube archivos locales y copia objetos sin alterar los orígenes",async()=>{
  const routes=["lumispa-10"],b=fakeBucket(routes);const originals=new Map([...b.objects].map(([k,v])=>[k,{...v}]));
  const plans=await inspect(b,routes,layout);assert.equal(b.writes.length,0);
  const report=await copyPlans(b,plans,routes,()=>{},layout);
  assert.equal(report.files.length,85);assert.ok(b.uploads.length>0);assert.ok(b.copies.length>0);
  assert.equal(b.writes.at(-1),layout.collections["lumispa-10"].readyPath);
  for(const [name,meta] of originals)assert.deepEqual(b.objects.get(name),meta);
  const before=b.writes.length;await copyPlans(b,await inspect(b,routes,layout),routes,()=>{},layout);assert.equal(b.writes.length,before);
});
test("un hash local incorrecto detiene la revisión sin subir nada",async()=>{
  const c=general.collections["lumispa-10"];
  const modified={ROOT:layout.ROOT,collections:{"lumispa-10":{...c,files:c.files.map((f,i)=>i?f:{...f,sha256:"0".repeat(64)})}}};
  const b=fakeBucket(["lumispa-10"]);await assert.rejects(inspect(b,["lumispa-10"],modified),/archivo local cambió/);assert.equal(b.writes.length,0);
});
test("las URL guardadas siguen resolviendo al mismo material tras la copia",async()=>{
  const c=general.collections["wellspa-10"],f=c.files.find(f=>f.role==="originals");
  const known=new Map();const loader=async name=>{if(!known.has(name))throw Object.assign(Error("missing"),{code:404});return known.get(name);};
  assert.equal(await general.resolveAlias(loader,f.alias),null);
  known.set(c.readyPath,{totalSize:100});known.set(f.destination,{totalSize:100,name:f.destination});
  assert.equal((await general.resolveAlias(loader,f.alias+"?v=old-favorite")).name,f.destination);
  known.delete(f.destination);assert.equal(await general.resolveAlias(loader,f.alias),null);
  assert.equal(await general.resolveAlias(loader,"/assets/unrelated file.jpg"),null);
});
test("el handler real conserva Range, HEAD, ETag y el respaldo anterior",async()=>{
  const source=fs.readFileSync(path.join(root,"server.js"),"utf8");
  const start=source.indexOf("function createStorageAssetHandlerV108(");
  const end=source.indexOf("// Biblioteca Internacional:",start);
  const context={
    validAssetRelativePathV108:p=>p.replace(/^\/+/,""),parseBotAssetRange:()=>({start:0,end:31}),
    shouldReturnNotModifiedV114:()=>false,shouldHonorRangeV114:()=>true,
    pipeAssetStreamV108:(stream,res)=>{res.stream=stream;return res;},console,
    getAssetFileV108:async name=>({totalSize:100,contentType:"video/mp4",etag:'"legacy"',file:{createReadStream:options=>({name,options})}})
  };
  vm.runInNewContext(source.slice(start,end),context);
  const organized={totalSize:100,contentType:"video/mp4",etag:'"organized"',file:{createReadStream:options=>({name:"new",options})}};
  for(const ready of [true,false])for(const method of ["GET","HEAD"]){
    const handler=context.createStorageAssetHandlerV108("routines/active/","routine-assets",async()=>ready?organized:null);
    const res={headers:{},code:200,set(k,v){if(typeof k==="object")Object.assign(this.headers,k);else this.headers[k]=v;return this;},status(n){this.code=n;return this;},end(){return this;}};
    await handler({method,path:"/old.mp4",headers:{range:"bytes=0-31"}},res,error=>{if(error)throw error;});
    assert.equal(res.code,206);assert.equal(res.headers["Content-Length"],"32");assert.equal(res.headers.ETag,ready?'"organized"':'"legacy"');
    if(method==="HEAD")assert.equal(res.stream,undefined);else assert.equal(res.stream.name,ready?"new":"routines/active/old.mp4");
  }
  let next=false;await context.createStorageAssetHandlerV108("","local",async()=>null,true)({method:"GET",path:"/old.jpg",headers:{}},{},()=>{next=true;});assert.equal(next,true);
});

test("la auditoría HTTP verifica las nueve colecciones, las rutas y Range sin escribir",async()=>{
  const routes=Object.keys(layout.collections),checks=checksFor(routes);
  assert.equal(checks.length,1235);
  const known=new Map(checks.map(c=>[c.url+"/"+c.method,c]));let cancelled=0;
  const fetchImpl=async(url,opts)=>{
    if(url.endsWith("/api/routine-library-status"))return{ok:true,json:async()=>({layout:"library-v1",collections:Object.values(layout.collections).map(c=>({id:c.route,ready:true,days:c.days,materials:c.materials,files:c.files.length}))})};
    const check=known.get(url.slice("http://test".length)+"/"+opts.method);assert.ok(check);
    assert.ok(["HEAD","GET"].includes(opts.method));
    if(check.range)assert.equal(opts.headers.Range,"bytes=0-0");
    const headers={"x-nu-asset-layout":"library-v1","content-type":check.type,"content-length":check.range?"1":"100","content-range":"bytes 0-0/100"};
    return{status:check.range?206:200,headers:{get:k=>headers[k]},body:{cancel:async()=>{cancelled++;}}};
  };
  const result=await audit({base:"http://test",routes,fetchImpl,log:()=>{}});
  assert.equal(result.collections,9);assert.equal(cancelled,1235);
});

test("la auditoría no confunde una respuesta de respaldo con una migración completa",async()=>{
  const c=layout.collections["lumispa-10"];
  const status={ok:true,json:async()=>({layout:"library-v1",collections:[{id:c.route,ready:true,days:c.days,materials:c.materials,files:c.files.length}]})};
  await assert.rejects(audit({base:"http://test",routes:[c.route],log:()=>{},fetchImpl:async url=>{
    if(url.endsWith("/api/routine-library-status"))return status;
    return{status:200,headers:{get:()=>"legacy"},body:{cancel:async()=>{}}};
  }}),/ruta anterior|HTTP 200/);
  let requested=0;
  await assert.rejects(audit({base:"http://test",routes:[c.route],log:()=>{},fetchImpl:async()=>{requested++;return {ok:true,json:async()=>({layout:"library-v1",collections:[]})};}}),/Todavía no está verificada/);
  assert.equal(requested,1);
});
