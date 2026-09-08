"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assertEnvironment, provision } = require("../scripts/prepare-collagen-v170-test");
const ID = "6b5e7b94-a44d-42ea-a4cd-3b4df355b0ad";
const DEV = "1a7e811a-e701-49c6-a3fd-1d7315975c36";
const PROD = "4fa0a37d-b0b8-40d8-a2e4-1322ff69d4fd";
const env = { DATABASE_URL: "postgres://test:pw@helium/heliumdb" };
const source = "// CONFIRMACIÓN DE PROGRESO COLLAGEN V170\nawait confirmCollagenDayV170(day);";
function setup({ witness = [{id:DEV,name:"Test Maria Noel"}], served = true, state = null } = {}) {
  const queries = [];
  const expected = state || { userId: ID, currentDay:3, nextUnlockAt:null, completedDays:[1,2] };
  const db = { async query(sql, values = []) {
    queries.push({sql,values});
    if (sql.includes("current_database()")) return {rows:[{database_name:"heliumdb"}]};
    if (sql.includes("id = ANY(")) return {rows:witness};
    if (sql.includes("SELECT u.current_day")) return {rows:[1,2].map(day=>({current_day:3,next_unlock_at:null,day,completed_at:new Date()}))};
    return {rows:[]};
  }};
  const request = async url => {
    let body = {ok:true};
    if (url.endsWith("/api/state/"+ID)) body = {ok:true,state:expected};
    return {ok:true,status:200,async text(){return url.endsWith("/daily-view.js") ? (served?source:"old") : JSON.stringify(body);}};
  };
  return {db,request,queries};
}
const args = h => ({...h,id:ID,env,branch:"development",source,now:new Date("2026-09-07T20:00:00Z")});
test("rejects production and deployed processes",()=>{
  assert.throws(()=>assertEnvironment({...env,NODE_ENV:"production"},"development",source));
  assert.throws(()=>assertEnvironment({...env,REPLIT_DEPLOYMENT:"1"},"development",source));
});
test("rejects wrong branch, database, missing V170 and enabled demo",()=>{
  assert.throws(()=>assertEnvironment(env,"main",source));
  assert.throws(()=>assertEnvironment({...env,DATABASE_URL:"postgres://test:pw@other/heliumdb"},"development",source));
  assert.throws(()=>assertEnvironment(env,"development","old"));
  assert.throws(()=>assertEnvironment({...env,ENABLE_DEMO_ROUTES:"true"},"development",source));
});
test("rejects old server before any SQL",async()=>{
  const h=setup({served:false});
  await assert.rejects(provision(args(h)));
  assert.equal(h.queries.length,0);
});
test("rejects missing development witness and rolls back",async()=>{
  const h=setup({witness:[]});
  await assert.rejects(provision(args(h)));
  assert.deepEqual(h.queries.map(q=>q.sql),["BEGIN",h.queries[1].sql,h.queries[2].sql,"ROLLBACK"]);
  assert.equal(h.queries.some(q=>q.sql.includes("INSERT")),false);
});
test("rejects production witness and existing test id",async()=>{
  for (const extra of [{id:PROD,name:"Noe"},{id:ID,name:"collision"}]) {
    const h=setup({witness:[{id:DEV,name:"Test Maria Noel"},extra]});
    await assert.rejects(provision(args(h)));
    assert.equal(h.queries.at(-1).sql,"ROLLBACK");
  }
});
test("creates only a fresh day-3 fixture and verifies canonical state",async()=>{
  const h=setup();
  const result=await provision(args(h));
  assert.equal(result.id,ID);
  assert.deepEqual(result.completedDays,[1,2]);
  assert.equal(result.currentDay,3);
  const writes=h.queries.filter(q=>q.sql.includes("INSERT"));
  assert.equal(writes.length,2);
  assert(writes.every(q=>q.values[0]===ID));
  assert.equal(h.queries.some(q=>/UPDATE users|DELETE FROM/.test(q.sql)),false);
  assert.equal(h.queries.some(q=>q.sql==="COMMIT"),true);
});
test("mismatched API state is rejected after fixture creation",async()=>{
  const h=setup({state:{userId:ID,currentDay:4,completedDays:[1,2,3]}});
  await assert.rejects(provision(args(h)),/estado esperado/);
  assert.equal(h.queries.some(q=>q.sql==="COMMIT"),true);
  assert.equal(h.queries.some(q=>/UPDATE users|DELETE FROM/.test(q.sql)),false);
});
