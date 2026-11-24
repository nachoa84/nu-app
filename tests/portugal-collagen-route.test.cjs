"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const combo = require("../international-collagen-pt");
const root = path.resolve(__dirname,"..");

function fixture(ready=true) {
  const routes=new Map(),requested=[];
  const files=new Map(combo.manifest.files.map(item=>[`${combo.base}/${item.path}`,item]));
  const code=fs.readFileSync(path.join(root,"server.js"),"utf8");
  const start=code.indexOf('const internationalLibraryCatalog = require(');
  const end=code.indexOf('app.use(\n  "/api/bot-assets"',start);
  assert.ok(start>0&&end>start);
  vm.runInNewContext(code.slice(start,end),{
    require:createRequire(path.join(root,"server.js")),
    app:{get:(route,handler)=>routes.set(route,handler),use:(route,handler)=>routes.set(route,handler)},
    async getAssetFileV108(name){
      requested.push(name);
      if(name===combo.readyPath&&ready)return{totalSize:100};
      const item=files.get(name);
      if(!item)throw Object.assign(Error("missing"),{code:404});
      return{totalSize:item.bytes,contentType:item.contentType,etag:'"fixture"',file:{createReadStream:options=>({options,name})}};
    },
    shouldReturnNotModifiedV114:()=>false,
    shouldHonorRangeV114:()=>true,
    parseBotAssetRange:()=>({start:0,end:31}),
    pipeAssetStreamV108:(stream,res)=>{res.stream=stream;return res;}
  });
  async function request({collection="collagen-pt",day="1",index="1",query={},method="HEAD",headers={}}={}){
    const res={code:200,headers:{},set(key,value){if(typeof key==="object")Object.assign(this.headers,key);else this.headers[key]=value;return this;},status(code){this.code=code;return this;},end(){return this;},json(body){this.body=body;return this;}};
    await routes.get("/api/international-assets/:collection/:day/:index")({params:{collection,day,index},query,method,headers},res,error=>{throw error;});
    return res;
  }
  return{routes,request,requested};
}

test("la ruta sirve JPEG original y sus variantes desde el prefijo nuevo",async()=>{
  const f=fixture();
  const original=await f.request();
  assert.equal(original.code,200);
  assert.equal(original.headers["Content-Type"],"image/jpeg");
  assert.equal(original.headers["Content-Length"],String(combo.manifest.files.find(item=>item.path==="DIA 1/1.jpg").bytes));
  assert.equal(f.requested.at(-1),`${combo.base}/DIA 1/1.jpg`);
  assert.equal(original.stream,undefined,"HEAD must not download bytes");
  const preview=await f.request({query:{variant:"preview"}});
  assert.equal(preview.headers["Content-Type"],"image/jpeg");
  assert.equal(f.requested.at(-1),`${combo.base}/DIA 1/1.preview.jpg`);
  const thumb=await f.request({query:{variant:"thumb"}});
  assert.equal(thumb.headers["Content-Type"],"image/jpeg");
  assert.equal(f.requested.at(-1),`${combo.base}/DIA 1/1.thumb.jpg`);
});

test("MP4, poster y Range conservan el comportamiento del visor habitual",async()=>{
  const f=fixture();
  const video=await f.request({day:"3",index:"7",method:"GET",headers:{range:"bytes=0-31"}});
  assert.equal(video.code,206);
  assert.equal(video.headers["Content-Type"],"video/mp4");
  assert.equal(video.headers["Content-Length"],"32");
  assert.equal(video.stream.name,`${combo.base}/DIA 3/7.mp4`);
  assert.equal(video.stream.options.start,0);
  assert.equal(video.stream.options.end,31);
  const poster=await f.request({day:"3",index:"7",query:{poster:"first-frame"}});
  assert.equal(poster.headers["Content-Type"],"image/jpeg");
  assert.equal(f.requested.at(-1),`${combo.base}/DIA 3/7.jpg`);
});

test("no admite días extra, índices inexistentes, variantes inválidas ni escrituras",async()=>{
  const f=fixture();
  for(const input of [{day:"8"},{index:"5"},{day:"0"},{query:{poster:"first-frame"}},{query:{variant:"unknown"}},{query:{variant:"thumb",poster:"first-frame"}}]){
    assert.equal((await f.request(input)).code,404);
  }
  assert.equal((await f.request({method:"POST"})).code,405);
  assert.equal(f.requested.length,0);
});

test("la disponibilidad depende del marcador de importación verificada",async()=>{
  for(const ready of [false,true]){
    const f=fixture(ready);
    const res={set(){return this;},json(body){this.body=body;return this;}};
    await f.routes.get("/api/portugal-collagen-status")({},res,error=>{throw error;});
    assert.equal(res.body.ready,ready);
    assert.equal(f.requested[0],combo.readyPath);
  }
});
