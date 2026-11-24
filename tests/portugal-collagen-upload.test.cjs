"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const combo = require("../international-collagen-pt");
const { uploadPlans } = require("../scripts/upload-portugal-collagen-preview");
const plans = combo.manifest.files.map(item => ({...item,source:"fixture",destination:`${combo.base}/${item.path}`}));

function fakeBucket({ corrupt = null } = {}) {
  const objects = new Map();
  const writes = [];
  return {objects,writes,
    file(name) { return {
      exists: async()=>[objects.has(name)],
      getMetadata: async()=>{
        if(!objects.has(name))throw Object.assign(Error("missing"),{code:404});
        const meta=objects.get(name);
        return [{...meta,md5Hash:name===corrupt?"bad-checksum":meta.md5Hash}];
      }
    };},
    async upload(source, options) {
      assert.equal(options.preconditionOpts.ifGenerationMatch,0);
      assert.ok(!objects.has(options.destination),"must not overwrite existing objects");
      const item=plans.find(p=>p.destination===options.destination);
      if(item)objects.set(options.destination,{size:item.bytes,md5Hash:item.md5});
      else {
        assert.equal(options.destination,combo.readyPath);
        const bytes=fs.readFileSync(source);
        const marker=JSON.parse(bytes);
        assert.equal(marker.manifestHash,combo.manifestHash);
        assert.equal(marker.objects,107);
        objects.set(options.destination,{size:bytes.length,md5Hash:crypto.createHash("md5").update(bytes).digest("base64")});
      }
      writes.push(options.destination);
    }
  };
}

test("el importador habilita la colección solo al verificar los 107 objetos y permite reanudar",async()=>{
  const bucket=fakeBucket();
  await uploadPlans(plans,bucket,()=>{});
  assert.equal(bucket.writes.length,108);
  assert.equal(bucket.writes.at(-1),combo.readyPath);
  assert.ok(bucket.writes.every(name=>name.startsWith("bot/preview/international/collagen-pt-20261124/")));
  await uploadPlans(plans,bucket,()=>{});
  assert.equal(bucket.writes.length,108,"retry must not overwrite anything");
});

test("una copia distinta bloquea la activación sin sobrescribirla",async()=>{
  const bucket=fakeBucket({corrupt:plans[10].destination});
  await assert.rejects(uploadPlans(plans,bucket,()=>{}),/copia remota no coincide/);
  assert.ok(!bucket.objects.has(combo.readyPath));
  assert.equal(bucket.writes.length,11);
});

test("un lote incompleto no inicia ninguna subida",async()=>{
  const bucket=fakeBucket();
  await assert.rejects(uploadPlans(plans.slice(0,-1),bucket,()=>{}),/todos los objetos/);
  assert.equal(bucket.writes.length,0);
});
