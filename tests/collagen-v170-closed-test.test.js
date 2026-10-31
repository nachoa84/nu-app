"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertEnvironment, buildPlan, createFixture } = require("../scripts/prepare-collagen-v170-closed-test");

// Fixed UTC+2 model for the September fixture. The real script uses Luxon.
class MadridDate {
  constructor(ms, offset = 120) { this.ms = ms; this.offset = offset; this.isValid = Number.isFinite(ms); }
  static fromJSDate(date) { return new MadridDate(date.getTime()); }
  local() { return new Date(this.ms + this.offset * 60000); }
  change(values) {
    const d = this.local();
    if (values.days) d.setUTCDate(d.getUTCDate() + values.days);
    if (values.minutes) d.setUTCMinutes(d.getUTCMinutes() + values.minutes);
    if (values.seconds) d.setUTCSeconds(d.getUTCSeconds() + values.seconds);
    return new MadridDate(d.getTime() - this.offset * 60000, this.offset);
  }
  plus(values) { return this.change(values); }
  minus(values) { return this.change(Object.fromEntries(Object.entries(values).map(([k,v]) => [k,-v]))); }
  startOf(unit) {
    const d = this.local();
    if (unit === "day") d.setUTCHours(0,0,0,0);
    if (unit === "minute") d.setUTCSeconds(0,0);
    return new MadridDate(d.getTime() - this.offset * 60000, this.offset);
  }
  set(values) {
    const d = this.local();
    if (values.hour !== undefined) d.setUTCHours(values.hour);
    if (values.minute !== undefined) d.setUTCMinutes(values.minute);
    if (values.second !== undefined) d.setUTCSeconds(values.second);
    if (values.millisecond !== undefined) d.setUTCMilliseconds(values.millisecond);
    return new MadridDate(d.getTime() - this.offset * 60000, this.offset);
  }
  get hour() { return this.local().getUTCHours(); }
  get minute() { return this.local().getUTCMinutes(); }
  toMillis() { return this.ms; }
  toUTC() { return new MadridDate(this.ms,0); }
  toISO() { return new Date(this.ms).toISOString(); }
  toFormat() { return [this.hour,this.minute].map(n=>String(n).padStart(2,"0")).join(":"); }
}
const ID = "e8f941f7-d5f4-4f03-913a-6be6f318e248";
const source = "// CONFIRMACIÓN DE PROGRESO COLLAGEN V170\nconfirmCollagenDayV170(day)";
const env = { DATABASE_URL: "postgres://postgres:secret@helium:5432/heliumdb", ENABLE_DEMO_ROUTES: "false" };
const context = { env, branch: "development", source, remote: "https://github.com/nachoa84/nu-app.git" };
const now = new Date("2026-09-08T12:03:44.804Z");

test("rejects Production, wrong branch, demo, missing V170 and wrong database", () => {
  assert.doesNotThrow(() => assertEnvironment(context));
  for (const change of [
    { branch:"main" }, { env:{...env,REPLIT_DEPLOYMENT:"1"} },
    { env:{...env,NODE_ENV:"production"} }, { env:{...env,ENABLE_DEMO_ROUTES:"true"} },
    { env:{...env,DATABASE_URL:"postgres://postgres@production/db"} },
    { source:"unverified" }, { remote:"https://github.com/another/repo.git" }
  ]) assert.throws(() => assertEnvironment({...context,...change}));
});

test("creates coherent Madrid day 1–5 history with a real near-future unlock", () => {
  const plan = buildPlan(now,MadridDate);
  assert.equal(plan.targetAt,"2026-09-08T12:19:00.000Z");
  assert.equal(plan.notificationTime,"14:19");
  assert.equal(plan.progress.length,5);
  for (let i=0;i<5;i++) {
    const row=plan.progress[i];
    assert.equal(row.day,i+1);
    assert.equal(Date.parse(row.completedAt)-Date.parse(row.openedAt),5000);
    assert.ok(Date.parse(row.completedAt)<now.getTime());
    if(i>0) assert.equal(Date.parse(row.openedAt)-Date.parse(plan.progress[i-1].openedAt),86400000);
  }
  assert.equal(Date.parse(plan.targetAt)-Date.parse(plan.progress[4].completedAt),86400000-5000);
});

test("creates only the new account and uses canonical bootstrap to calculate the unlock", async () => {
  const plan=buildPlan(now,MadridDate);
  const queries=[]; const requests=[];
  const db={async query(sql,params=[]) {
    queries.push({sql,params});
    if(sql.includes("current_database()")) return {rows:[{database_name:"heliumdb",db_now:now}]};
    if(sql.includes("SELECT id, name, current_day FROM users")) return {rows:[
      {id:"1a7e811a-e701-49c6-a3fd-1d7315975c36",name:"Test Maria Noel"},
      {id:"93237fe7-0a64-4a15-bbff-6ef13d1b3ff7",name:"Test Collagen V170",current_day:5}
    ]};
    if(sql.includes("SELECT u.name")) return {rowCount:5,rows:plan.progress.map(row=>({
      name:plan.name,current_day:5,cycle:1,timezone:plan.timezone,
      notification_time:plan.notificationTime,next_unlock_at:plan.targetAt,...row,
      opened_at:row.openedAt,completed_at:row.completedAt
    }))};
    return {rowCount:1,rows:[]};
  }};
  const request=async(url,options={})=>{
    requests.push({url,options});
    if(url.endsWith("/daily-view.js")) return {ok:true,text:async()=>source};
    const state={userId:ID,currentDay:5,completedDays:[1,2,3,4,5],nextUnlockAt:Date.parse(plan.targetAt)};
    return {ok:true,json:async()=>url.endsWith("/api/health")?{ok:true}:{ok:true,state}};
  };
  const result=await createFixture({...context,db,request,id:ID,DateTime:MadridDate});
  assert.equal(result.targetAt,plan.targetAt);
  assert.equal(queries.filter(q=>q.sql.includes("INSERT INTO users")).length,1);
  assert.equal(queries.filter(q=>q.sql.includes("INSERT INTO day_progress")).length,5);
  assert.equal(queries.filter(q=>q.sql==="COMMIT").length,1);
  for(const q of queries.filter(q=>q.sql.includes("INSERT INTO"))) assert.equal(q.params[0],ID);
  assert.ok(!queries.some(q=>/UPDATE|DELETE|TRUNCATE|ALTER|DROP/i.test(q.sql)));
  const bootstrap=requests.find(r=>r.url.endsWith("/api/bootstrap"));
  const body=JSON.parse(bootstrap.options.body);
  assert.equal(bootstrap.options.method,"POST");
  assert.deepEqual(body.completedDays,[]);
  assert.equal(body.profile.userId,ID);
  assert.equal(body.profile.notificationTime,"14:19");
  assert.equal(body.localState.currentDay,5);
});

test("wrong database witness rolls back before inserting anything", async () => {
  const queries=[];
  const db={async query(sql,params=[]) {
    queries.push({sql,params});
    if(sql.includes("current_database()")) return {rows:[{database_name:"heliumdb",db_now:now}]};
    if(sql.includes("SELECT id, name, current_day FROM users")) return {rows:[{id:"4fa0a37d-b0b8-40d8-a2e4-1322ff69d4fd",name:"Noe"}]};
    return {rows:[],rowCount:0};
  }};
  const request=async(url)=>url.endsWith("/daily-view.js")?{ok:true,text:async()=>source}:{ok:true,json:async()=>({ok:true})};
  await assert.rejects(createFixture({...context,db,request,id:ID,DateTime:MadridDate}),/identidad de Development/);
  assert.ok(queries.some(q=>q.sql==="ROLLBACK"));
  assert.ok(!queries.some(q=>q.sql.includes("INSERT INTO")));
});

test("rejects protected or malformed fixture IDs before any request", async () => {
  let calls=0;
  const request=async()=>{calls++;return {ok:true,json:async()=>({ok:true})};};
  for(const id of ["bad","4fa0a37d-b0b8-40d8-a2e4-1322ff69d4fd","93237fe7-0a64-4a15-bbff-6ef13d1b3ff7"])
    await assert.rejects(createFixture({...context,db:{},request,id,DateTime:MadridDate}),/ID sintético inválido/);
  assert.equal(calls,0);
});
