"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {createRequire}=require("node:module");
const layout=require("../international-asset-layout");
const {inspect,copyPlans}=require("../scripts/organize-europe-assets-preview");
const allRoutes=Object.keys(layout.collections);
function fakeBucket(routes=allRoutes){
  const objects=new Map(),writes=[],copies=[];
  const put=(name,bytes=Buffer.from(name),generation="1",contentType)=>{
    const type=contentType||(name.endsWith(".mp4")?"video/mp4":name.endsWith(".png")?"image/png":"image/jpeg");
    objects.set(name,{bytes:Buffer.from(bytes),meta:{size:String(bytes.length),md5Hash:crypto.createHash("md5").update(bytes).digest("base64"),generation,contentType:type}});
  };
  for(const route of routes)for(const file of layout.collections[route].files)put(file.sources[0]);
  const bucket={objects,writes,copies,put,file(name,options={}){
    return {name,
      async getMetadata(){
        const obj=objects.get(name);
        if(!obj)throw Object.assign(Error("missing"),{code:404});
        return [{...obj.meta}];
      },
      async copy(destination,opts){
        assert.equal(opts.preconditionOpts.ifGenerationMatch,0);
        const obj=objects.get(name);
        assert.equal(options.generation,String(obj.meta.generation),"must pin the inspected source generation");
        if(objects.has(destination.name))throw Object.assign(Error("exists"),{code:412});
        put(destination.name,obj.bytes,"2",obj.meta.contentType);
        copies.push({source:name,destination:destination.name,generation:options.generation});writes.push(destination.name);
      },
      async save(bytes,opts){
        assert.equal(opts.preconditionOpts.ifGenerationMatch,0);
        assert.ok(!objects.has(name));
        put(name,bytes,"3",opts.metadata.contentType);writes.push(name);
      }
    };
  }};
  return bucket;
}
test("cinco colecciones, 199 materiales y 526 destinos únicos por país, estrategia y día",()=>{
  assert.equal(allRoutes.length,5);
  const cs=Object.values(layout.collections);
  assert.equal(cs.reduce((n,c)=>n+c.materials,0),199);
  const files=cs.flatMap(c=>c.files);
  assert.equal(files.length,526);assert.equal(new Set(files.map(f=>f.destination)).size,526);
  assert.ok(files.every(f=>/^routines\/library\/v1\/europe\/(es|it|pt)\/[a-z-]+\/day-\d{2}\/(originals|previews|thumbnails|posters|optimized)\/\d{2}\.(mp4|jpg|png)$/.test(f.destination)));
  assert.equal(files.filter(f=>f.role==="optimized").length,5);
});
test("la revisión completa es de solo lectura",async()=>{
  const b=fakeBucket();const plans=await inspect(b,allRoutes);
  assert.equal(plans.length,526);assert.equal(b.writes.length,0);
});
test("un faltante en la última colección detiene la revisión antes de copiar",async()=>{
  const b=fakeBucket();const c=layout.collections[allRoutes.at(-1)];
  for(const name of c.files.at(-1).sources)b.objects.delete(name);
  await assert.rejects(inspect(b,allRoutes),/sin copiar archivos/);
  assert.equal(b.writes.length,0);
});
test("un destino diferente detiene la revisión y se conserva intacto",async()=>{
  const b=fakeBucket();const file=layout.collections[allRoutes[0]].files[0];
  b.put(file.destination,Buffer.from("other"));
  await assert.rejects(inspect(b,allRoutes),/no se sobrescribe/);
  assert.equal(b.objects.get(file.destination).bytes.toString(),"other");assert.equal(b.writes.length,0);
});
test("la copia verifica todos los objetos, activa cada colección y puede reanudarse",async()=>{
  const b=fakeBucket();const old=new Map([...b.objects].map(([name,obj])=>[name,Buffer.from(obj.bytes)]));
  const report=await copyPlans(b,await inspect(b,allRoutes),allRoutes,()=>{});
  assert.equal(report.files.length,526);assert.equal(report.collections.length,5);
  assert.equal(b.writes.length,531);assert.equal(b.copies.length,526);
  for(const [name,bytes] of old)assert.deepEqual(b.objects.get(name).bytes,bytes);
  for(const c of Object.values(layout.collections)){
    const markerIndex=b.writes.indexOf(c.readyPath);
    assert.ok(c.files.every(f=>b.writes.indexOf(f.destination)<markerIndex));
    assert.equal(JSON.parse(b.objects.get(c.readyPath).bytes).layoutHash,c.hash);
  }
  await copyPlans(b,await inspect(b,allRoutes),allRoutes,()=>{});
  assert.equal(b.writes.length,531,"retry cannot write or replace existing objects");
});
test("una copia corrupta no activa la colección y conserva los originales",async()=>{
  const route="collagen-pt",b=fakeBucket([route]);const originalFile=b.file.bind(b);
  const corrupted=layout.collections[route].files.at(-1).destination;
  b.file=(name,options)=>{
    const f=originalFile(name,options);const copy=f.copy;
    f.copy=async(dest,opts)=>{await copy(dest,opts);if(dest.name===corrupted)b.put(dest.name,Buffer.from("corrupt"));};return f;
  };
  await assert.rejects(copyPlans(b,await inspect(b,[route]),[route],()=>{}),/Verificación falló/);
  assert.ok(!b.objects.has(layout.collections[route].readyPath));
  assert.ok(layout.collections[route].files.every(f=>b.objects.has(f.sources[0])));
});
test("se reconocen los nombres de carpeta acentuados y las extensiones JPG",async()=>{
  const route="collagen-es",b=fakeBucket([route]);const f=layout.collections[route].files.find(f=>f.role==="thumb");
  const old=b.objects.get(f.sources[0]);b.objects.delete(f.sources[0]);b.put(f.sources.at(-1),old.bytes);
  const plans=await inspect(b,[route]);assert.equal(plans.find(p=>p.destination===f.destination).source,f.sources.at(-1));
});
test("los cinco videos optimizados conservan la preferencia y su respaldo",async()=>{
  const route="collagen-es",b=fakeBucket([route]);const optimized=layout.collections[route].files.find(f=>f.role==="optimized");
  assert.ok(optimized.sources[0].includes("optimized-20261106"));
  let plans=await inspect(b,[route]);assert.equal(plans.find(p=>p.role==="optimized").source,optimized.sources[0]);
  for(const source of optimized.sources.filter(s=>s.includes("optimized-20261106")))b.objects.delete(source);
  plans=await inspect(b,[route]);assert.ok(plans.find(p=>p.role==="optimized").source.startsWith("bot/active/"));
});
test("no se aceptan planes incompletos ni destinos o fuentes ajenos al catálogo",async()=>{
  const route="collagen-pt",b=fakeBucket([route]);const plans=await inspect(b,[route]);
  await assert.rejects(copyPlans(b,plans.slice(1),[route],()=>{}),/Lote incompleto/);
  await assert.rejects(copyPlans(b,plans.map((p,i)=>i? p:{...p,source:"another/source.jpg"}),[route],()=>{}),/Plan no permitido/);
  assert.equal(b.writes.length,0);
});
test("el lector solo usa copias activadas y permite volver a las rutas anteriores",async()=>{
  const route="collagen-pt",b=fakeBucket([route]),c=layout.collections[route];
  const loader=async name=>{const obj=b.objects.get(name);if(!obj)throw Object.assign(Error("missing"),{code:404});return {totalSize:Number(obj.meta.size),name};};
  assert.equal(await layout.resolveAsset(loader,route,1,1,"original"),null);
  await copyPlans(b,await inspect(b,[route]),[route],()=>{});
  const file=c.files.find(f=>f.day===1&&f.index===1&&f.role==="original");
  assert.equal((await layout.resolveAsset(loader,route,1,1,"original")).name,file.destination);
  b.objects.delete(file.destination);assert.equal(await layout.resolveAsset(loader,route,1,1,"original"),null);
  assert.equal(await layout.resolveAsset(loader,route,8,1,"original"),null);
  assert.equal(await layout.resolveAsset(loader,"unknown",1,1,"original"),null);
});

test("la API conserva las URL, las variantes y Range al servir los destinos organizados",async()=>{
  const routes=new Map(),requested=[];
  const root=path.resolve(__dirname,"..");
  const source=fs.readFileSync(path.join(root,"server.js"),"utf8");
  const start=source.indexOf('const internationalLibraryCatalog = require(');
  const end=source.indexOf('app.use(\n  "/api/bot-assets"',start);
  const files=new Map(Object.values(layout.collections).flatMap(c=>[
    [c.readyPath,{size:100,contentType:"application/json"}],
    ...c.files.map(f=>[f.destination,{size:2048,contentType:f.destination.endsWith(".mp4")?"video/mp4":f.destination.endsWith(".png")?"image/png":"image/jpeg"}])
  ]));
  vm.runInNewContext(source.slice(start,end),{
    require:createRequire(path.join(root,"server.js")),
    app:{get:(route,handler)=>routes.set(route,handler),use:(route,handler)=>routes.set(route,handler)},
    async getAssetFileV108(name){
      requested.push(name);const item=files.get(name);
      if(!item)throw Object.assign(Error("missing"),{code:404});
      return{totalSize:item.size,contentType:item.contentType,etag:'"fixture"',file:{createReadStream:options=>({name,options})}};
    },
    shouldReturnNotModifiedV114:()=>false,shouldHonorRangeV114:()=>true,
    parseBotAssetRange:()=>({start:0,end:31}),pipeAssetStreamV108:(stream,res)=>{res.stream=stream;return res;}
  });
  const inputs=[
    {collection:"collagen-pt",day:1,index:1,role:"original",query:{}},
    {collection:"collagen-pt",day:1,index:1,role:"thumb",query:{variant:"thumb"}},
    {collection:"lumispa-collagen-es",day:1,index:1,role:"preview",query:{variant:"preview"}},
    {collection:"collagen-pt",day:3,index:7,role:"poster",query:{poster:"first-frame"}},
    {collection:"collagen-it",day:3,index:4,role:"optimized",query:{v:"optimized-preview-20261106"}}
  ];
  for(const input of inputs){
    const res={code:200,headers:{},set(k,v){if(typeof k==="object")Object.assign(this.headers,k);else this.headers[k]=v;return this;},status(n){this.code=n;return this;},end(){return this;}};
    await routes.get("/api/international-assets/:collection/:day/:index")({params:{collection:input.collection,day:String(input.day),index:String(input.index)},method:"GET",query:input.query,headers:input.role==="optimized"?{range:"bytes=0-31"}:{}},res,error=>{throw error;});
    const file=layout.collections[input.collection].files.find(f=>f.day===input.day&&f.index===input.index&&f.role===input.role);
    assert.equal(res.stream.name,file.destination);assert.equal(requested.at(-1),file.destination);
    assert.equal(res.code,input.role==="optimized"?206:200);
    if(input.role==="optimized"){
      assert.equal(res.headers["X-Nu-International-Variant"],"optimized-preview");
      assert.equal(res.headers["Content-Length"],"32");
    }
  }
  assert.ok(requested.every(name=>name.startsWith(layout.ROOT+"/")));
});
