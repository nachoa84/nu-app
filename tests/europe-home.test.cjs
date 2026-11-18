"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
// Dependencia de revisión opcional, instalada fuera del runtime de producción.
// NUAPP_JSDOM_MODULE=/ruta/a/jsdom node --test tests/europe-home.test.cjs
let JSDOM;
try { ({ JSDOM } = require(process.env.NUAPP_JSDOM_MODULE || "jsdom")); }
catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
const optionalDom = { skip:!JSDOM && "Definí NUAPP_JSDOM_MODULE para ejecutar la prueba de interfaz" };
const root = path.resolve(__dirname,"..");
const read = file => fs.readFileSync(path.join(root,file),"utf8");
const catalog = JSON.parse(read("biblioteca-internacional-catalog.json"));

function fixture(){
  const dom=new JSDOM(read("index.html"),{url:"https://nuapp.test/",runScripts:"outside-only"});
  const w=dom.window;
  w.scrollTo=()=>{};
  w.matchMedia=()=>({matches:true});
  w.closeMediaPreview=()=>{};
  w.eval(read("ui-core.js"));
  w.eval(read("biblioteca-internacional-iris.js"));
  w.eval(read("bot-content.js"));
  return {dom,w,doc:w.document};
}

test("Europa filtra las tres colecciones y preserva los 30 días y las acciones de medios",optionalDom,async()=>{
  const {dom,w,doc}=fixture();
  try{
    const requests=[];
    w.fetch=async url=>{
      requests.push(url);
      return {ok:true,json:async()=>catalog};
    };
    w.eval(read("biblioteca-internacional-data.js"));
    await new Promise(resolve=>w.addEventListener("nu-international-catalog-ready",resolve,{once:true}));
    const before=JSON.stringify(w.localStorage);
    doc.querySelector("#openEuropeBtn").click();
    assert.ok(doc.querySelector("#view-europa.active"));
    assert.ok(doc.querySelector('.nav-btn[data-view="hoy"].active'));
    assert.deepEqual([...doc.querySelectorAll("[data-collection]")].map(node=>node.dataset.collection),["collagen/es"]);
    let materialCount=0;
    for(const [market,ids] of [["España",["collagen/es"]],["Italia",["collagen/it","lumispa/it"]]]){
      [...doc.querySelectorAll(".europe-market")].find(node=>node.textContent===market).click();
      assert.equal(doc.activeElement.textContent,market);
      assert.equal(doc.querySelector("#europeTitle").textContent,"Estrategia Europa");
      assert.equal(doc.querySelector("#europeSubtitle").textContent,"Elegí el mercado y explorá sus estrategias");
      assert.equal(doc.querySelector(".europe-section-title").textContent,"Estrategias para "+market);
      assert.equal(doc.querySelector("#view-europa").lang,"es");
      assert.ok(!doc.querySelector("#europeList").textContent.includes("Español"));
      assert.ok(!doc.querySelector("#europeList").textContent.includes("Italiano"));
      assert.deepEqual([...doc.querySelectorAll("[data-collection]")].map(node=>node.dataset.collection),ids);
      for(const id of ids){
        doc.querySelector(`[data-collection="${id}"]`).click();
        assert.equal(doc.querySelectorAll(".nu-il-day").length,10);
        assert.equal(doc.querySelector("#view-europa").lang,id.endsWith("/it")?"it":"es");
        for(let day=1;day<=10;day++){
          doc.querySelectorAll(".nu-il-day")[day-1].click();
          const rows=[...doc.querySelectorAll(".nu-il-media-row")];
          assert.equal(rows.length,catalog[`${id}/${day}`].length);
          materialCount+=rows.length;
          let gallery;
          w.openMediaPreview=(items,index,selectedDay)=>{gallery={items,index,selectedDay};};
          for(let index=0;index<rows.length;index++){
            rows[index].click();
            assert.equal(gallery.index,index);
            assert.equal(gallery.selectedDay,day);
            gallery.items.forEach((item,position)=>{
              assert.equal(item.src,w.NuInternationalLibraryData[`${id}/${day}`][position].src);
              assert.equal(item.mediaType,catalog[`${id}/${day}`][position].type);
              assert.equal(item.locale,id.endsWith("/it")?"it":"es");
              assert.equal(typeof item.download,"function");
              assert.equal(typeof item.prepareShare,"function");
            });
          }
          doc.querySelector("#europeBackBtn").click();
        }
        doc.querySelector("#europeBackBtn").click();
      }
    }
    assert.equal(materialCount,137);
    doc.querySelector("#europeBackBtn").click();
    assert.ok(doc.querySelector("#view-hoy.active"));
    assert.equal(JSON.stringify(w.localStorage),before);
    assert.deepEqual(requests,["/biblioteca-internacional-catalog.json"]);
    assert.ok(!w.BotContent.some(item=>item.id==="biblioteca-internacional"));
    assert.ok(w.BotContent.some(item=>item.id==="estrategia-colageno-europa"));
    const legacy=doc.createElement("a");legacy.href="/biblioteca-internacional.html";doc.body.append(legacy);legacy.click();
    assert.ok(doc.querySelector("#view-europa.active"));
    assert.equal(doc.querySelector(".bot-quick-access-sheet"),null);
    assert.ok(doc.querySelector(".europe-routine-card"));
    // Home entry is outside the container that routine reconciliation replaces.
    doc.querySelector("#view-hoy .home-routines").replaceChildren();
    assert.ok(doc.querySelector("#europeHomeEntry #openEuropeBtn"));
  }finally{dom.window.close();}
});

test("un catálogo demorado o fallido se actualiza al cargar y permite reintentar",optionalDom,async()=>{
  const {dom,w,doc}=fixture();
  try{
    let release,fail=true;
    w.fetch=()=>new Promise(resolve=>{release=()=>resolve({ok:!fail,json:async()=>catalog});});
    w.console.warn=()=>{};
    w.eval(read("biblioteca-internacional-data.js"));
    doc.querySelector("#openEuropeBtn").click();
    doc.querySelector("[data-collection]").click();
    doc.querySelector(".nu-il-day").click();
    assert.match(doc.querySelector("#europeList").textContent,/Cargando/);
    let ready=new Promise(resolve=>w.addEventListener("nu-international-catalog-error",resolve,{once:true}));
    release();await ready;
    assert.match(doc.querySelector("#europeList").textContent,/No se pudo cargar/);
    doc.querySelector("#europeList .nu-il-action").click();
    assert.match(doc.querySelector("#europeList").textContent,/Cargando/);
    fail=false;
    ready=new Promise(resolve=>w.addEventListener("nu-international-catalog-ready",resolve,{once:true}));
    release();await ready;
    assert.equal(doc.querySelectorAll(".nu-il-media-row").length,catalog["collagen/es/1"].length);
    // A later response must not reopen a collection after leaving Europa.
    w.activateMainView("hoy",{animate:false});
    w.dispatchEvent(new w.Event("nu-international-catalog-ready"));
    assert.ok(doc.querySelector("#view-hoy.active"));
  }finally{dom.window.close();}
});
