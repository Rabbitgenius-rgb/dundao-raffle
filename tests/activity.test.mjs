import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { ActivityStore,hashPassword,verifyPassword,csv,normalizeName,maskName } from '../server/store.mjs';
import { createApp } from '../server/server.mjs';
const selection={blade:'straight',handle:'wrap',guard:'disc'};
const password='qa-only-not-a-production-password';
const adminHash=hashPassword(password);
function fixture(t,capacity=30,registerCleanup=true){
  const dir=mkdtempSync(join(tmpdir(),'dundao-activity-'));
  const store=new ActivityStore({filename:join(dir,'activity.sqlite'),capacity});
  const cleanup=()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});};
  if(registerCleanup)t.after(cleanup);
  return {dir,store,cleanup};
}
async function httpFixture(t,capacity=30){
  const {store,cleanup}=fixture(t,capacity,false);
  const server=createApp({store,origin:'http://127.0.0.1',adminHash});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));cleanup();});
  const base=`http://127.0.0.1:${server.address().port}`;
  // Bound physical sockets below macOS's accept queue; all player flows remain concurrent.
  let active=0;const waiting=[];
  async function acquire(){if(active<64){active++;return;}await new Promise(resolve=>waiting.push(resolve));}
  function release(){const next=waiting.shift();if(next)next();else active--;}
  async function request(path,{method='GET',body,cookie,origin='http://127.0.0.1'}={}){
    await acquire();
    try{
    const res=await fetch(base+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method==='POST'?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await res.text();
    return {status:res.status,text,json:res.headers.get('content-type')?.includes('application/json')?JSON.parse(text):null,cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};
    }finally{release();}
  }
  return {store,request,base};
}

test('30 unique codes own one game each; replay and repeated starts cannot reroll',t=>{
  const {store}=fixture(t),codes=store.codes('https://example.test');
  assert.equal(codes.length,30);assert.equal(new Set(codes.map(c=>c.code)).size,30);
  const joined=store.join(codes[0].code,'参与者01');
  assert.equal(store.info().started,0);
  const session=store.session(joined.token,'player');
  const start=store.start(session.entry_id,selection);
  assert.equal(start.state.hits,0);
  assert.deepEqual(store.start(session.entry_id,{blade:'thick'}),start);
  assert.equal(store.info().started,1);
  const first=store.hit(session.entry_id,1);
  assert.deepEqual(store.hit(session.entry_id,1),first);
  assert.throws(()=>store.hit(session.entry_id,3),e=>e.status===409);
  assert.equal(store.player(session.entry_id).state.hits,1);
  for(let n=2;n<=15;n++)store.hit(session.entry_id,n);
  const finished=store.player(session.entry_id);
  assert.equal(finished.state.complete,true);assert.equal(finished.rank,1);
  assert.deepEqual(store.start(session.entry_id,selection),finished);
  assert.deepEqual(store.hit(session.entry_id,15),finished);
  assert.throws(()=>store.hit(session.entry_id,16));
  const again=store.join(codes[0].code,'试图改名');
  assert.equal(again.player.nickname,'参与者01');assert.deepEqual(again.player.state,finished.state);
  assert.equal(store.results().length,1);
});

test('database reopen preserves code, session, in-progress game and completed score',t=>{
  const dir=mkdtempSync(join(tmpdir(),'dundao-restart-')),filename=join(dir,'activity.sqlite');
  let store=new ActivityStore({filename,capacity:2});
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const codes=store.codes('https://example.test'),activity=store.info();
  const joined=store.join(codes[0].code,'断线恢复'),id=store.session(joined.token,'player').entry_id;
  store.start(id,selection);for(let n=1;n<=7;n++)store.hit(id,n);
  const seven=store.player(id);store.close();store=new ActivityStore({filename,capacity:30});
  assert.equal(store.info().id,activity.id);assert.equal(store.info().capacity,2);
  assert.deepEqual(store.codes('https://example.test'),codes.map((c,i)=>i===0?{...c,nickname:'断线恢复',status:'锻造中'}:c));
  assert.equal(store.session(joined.token,'player').entry_id,id);assert.deepEqual(store.player(id),seven);
  for(let n=8;n<=15;n++)store.hit(id,n);
  const result=store.results();store.close();store=new ActivityStore({filename});
  assert.deepEqual(store.results(),result);assert.equal(store.info().completed,1);
});

test('200 active HTTP players with pooled connections finish 15 server-generated strikes exactly once',async t=>{
  const {store,request}=await httpFixture(t,200);
  const players=await Promise.all(store.codes('https://example.test').map(async(code,i)=>{
    const joined=await request('/api/join',{method:'POST',body:{nickname:`并发参与者${i+1}`}});
    assert.equal(joined.status,200);
    const started=await request('/api/start',{method:'POST',cookie:joined.cookie,body:{selection,score:100000}});
    assert.equal(started.json.player.state.score,0);
    return {cookie:joined.cookie,id:started.json.player.state.id};
  }));
  for(let hit=1;hit<=15;hit++){
    await Promise.all(players.map(async p=>{
      const first=await request('/api/hit',{method:'POST',cookie:p.cookie,body:{expectedHit:hit,score:9999999,route:'holy'}});
      assert.equal(first.status,200);assert.equal(first.json.player.state.hits,hit);
      const duplicate=await request('/api/hit',{method:'POST',cookie:p.cookie,body:{expectedHit:hit}});
      assert.deepEqual(duplicate.json.player.state,first.json.player.state);
    }));
  }
  assert.equal(store.info().completed,200);assert.equal(store.results().length,200);
  for(const result of store.results()){assert.equal(result.hits,15);assert.ok(result.score<=100000);}
  for(const p of players){
    const again=await request('/api/start',{method:'POST',cookie:p.cookie,body:{selection}});
    assert.equal(again.json.player.state.id,p.id);assert.equal(again.json.player.state.complete,true);
  }
});

test('admin authentication, CSRF, hidden server files and private exports enforce boundaries',async t=>{
  const {request}=await httpFixture(t,2);
  assert.equal((await request('/api/activity')).json.activity.capacity,2);
  assert.equal((await request('/api/me')).json.player,null);
  for(const path of ['/api/admin/summary','/api/admin/results.csv','/api/admin/codes.csv'])assert.equal((await request(path)).status,401);
  assert.equal((await request('/api/hit',{method:'POST',body:{expectedHit:1}})).status,401);
  assert.equal((await request('/api/admin/login',{method:'POST',body:{password},origin:'https://attacker.test'})).status,403);
  assert.equal((await request('/api/admin/login',{method:'POST',body:{password:'wrong'}})).status,401);
  const login=await request('/api/admin/login',{method:'POST',body:{password}});
  assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const summary=await request('/api/admin/summary',{cookie:login.cookie});
  assert.equal(summary.json.codes.length,2);assert.deepEqual(summary.json.results,[]);
  const exported=await request('/api/admin/codes.csv',{cookie:login.cookie});
  assert.equal(exported.status,200);assert.match(exported.text,/参与码/);assert.equal(exported.text.split('\r\n').filter(Boolean).length,3);
  for(const path of ['/server/store.mjs','/private/activity.sqlite','/web/../server/store.mjs','/web/.env','/web/%2e%2e/server/store.mjs'])assert.equal((await request(path)).status,404);
  const script=await request('/web/activity.mjs');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/application\/javascript/);
  assert.equal((await request('/api/admin/logout',{method:'POST',cookie:login.cookie,body:{}})).status,200);
  assert.equal((await request('/api/admin/summary',{cookie:login.cookie})).status,401);
});

test('test codes exercise full scoring without consuming formal places or rankings',t=>{
  const {store}=fixture(t),testCode=store.newTestEntry('https://example.test');
  const player=store.join(testCode.code,'流程测试'),id=store.session(player.token,'player').entry_id;
  store.start(id,selection);for(let n=1;n<=15;n++)store.hit(id,n);
  assert.equal(store.player(id).isTest,true);assert.equal(store.player(id).rank,null);
  assert.equal(store.info().completed,0);assert.equal(store.info().started,0);assert.equal(store.codes('https://example.test').length,30);assert.equal(store.results().length,0);
});

test('equal scores share rank and CSV protects spreadsheet formulas',t=>{
  const {store}=fixture(t,3),codes=store.codes('https://example.test');
  for(let index=0;index<3;index++){
    const joined=store.join(codes[index].code,index===0?'=1+2':`测试${index}`),id=store.session(joined.token,'player').entry_id;
    store.start(id,selection);for(let hit=1;hit<=15;hit++)store.hit(id,hit);
    store.db.prepare('UPDATE entries SET score=? WHERE id=?').run(index<2?90000:80000,id);
  }
  assert.deepEqual(store.results().map(r=>r.rank),[1,1,3]);
  assert.match(csv([['名字','分数'],['=1+2',90000]]),/"'=1\+2"/);
  assert.ok(verifyPassword(password,adminHash));assert.equal(verifyPassword('wrong',adminHash),false);
});

test('expansion from 100 to 200 preserves original codes, activity and saved games',t=>{
  const {store}=fixture(t,100),before=store.codes('https://example.test'),activityId=store.info().id;
  const joined=store.join(before[0].code,'保留原成绩'),id=store.session(joined.token,'player').entry_id;
  store.start(id,selection);store.hit(id,1);
  const previous=store.player(id);
  store.expandCapacity(200);
  assert.equal(store.info().capacity,200);assert.equal(store.info().id,activityId);
  assert.deepEqual(store.player(id),previous);
  assert.deepEqual(store.codes('https://example.test').slice(0,100).map(r=>r.code),before.map(r=>r.code));
  assert.equal(new Set(store.codes('https://example.test').map(r=>r.code)).size,200);
  store.expandCapacity(200);assert.equal(store.info().capacity,200);
  assert.throws(()=>store.expandCapacity(100),e=>e.status===409);
});

test('same real name retains first completed score even when later score is higher',t=>{
  const {store}=fixture(t,3),codes=store.codes('https://example.test');
  const first=store.join(codes[1].code,'  张 三  '),firstId=store.session(first.token,'player').entry_id;
  const later=store.join(codes[0].code,'张三'),laterId=store.session(later.token,'player').entry_id;
  store.start(firstId,selection);store.start(laterId,selection);
  for(let hit=1;hit<=15;hit++)store.hit(firstId,hit);
  for(let hit=1;hit<=15;hit++)store.hit(laterId,hit);
  store.db.prepare('UPDATE entries SET score=1000,finished_at=? WHERE id=?').run('2026-11-14T00:00:00.000Z',firstId);
  store.db.prepare('UPDATE entries SET score=99999,finished_at=? WHERE id=?').run('2026-11-14T00:00:00.000Z',laterId);
  const results=store.results();assert.equal(results.length,1);assert.equal(results[0].number,2);assert.equal(results[0].score,1000);
  assert.equal(store.player(firstId).isDuplicate,false);assert.equal(store.player(laterId).isDuplicate,true);assert.equal(store.player(laterId).rank,null);
  assert.equal(store.info().completed,1);assert.equal(store.info().finished,2);assert.equal(store.info().duplicates,1);assert.equal(store.info().inProgress,0);
  assert.equal(store.codes('https://example.test')[0].status,'同名不计入');
  assert.throws(()=>store.join(codes[2].code,'张三'),e=>e.code==='same_name_completed');
  assert.equal(store.codes('https://example.test')[2].status,'未使用');
  assert.equal(normalizeName(' Ａｌｉｃｅ  Li ').key,normalizeName('alice li').key);
  assert.throws(()=>normalizeName('张\u200b三'));
});

test('name-only entry needs no invitation, resumes only its own session and respects capacity',t=>{
  const {store}=fixture(t,2);
  const joined=store.join('', '李明'),id=store.session(joined.token,'player').entry_id;
  assert.equal(joined.player.number,1);assert.equal(joined.player.nickname,'李明');
  assert.throws(()=>store.join('', '李 明'),e=>e.code==='same_name_in_progress');
  store.start(id,selection);store.hit(id,1);
  assert.deepEqual(store.join('', '李明',id).player.state,store.player(id).state);
  store.join(undefined,'王芳');
  assert.throws(()=>store.join('', '赵强'),e=>e.code==='activity_full');
  for(let n=2;n<=15;n++)store.hit(id,n);
  assert.throws(()=>store.join('', '李明'),e=>e.code==='same_name_completed');
  assert.equal(store.join('', '李明',id).player.state.complete,true);
  assert.equal(store.info().completed,1);
});

test('public leaderboard masks names, shares deduplication and ties, excludes tests and pending games',t=>{
  const {store}=fixture(t,5),codes=store.codes('https://example.test');
  const names=['张三','李四','张三','周六','欧阳娜娜'];
  const ids=names.map((name,index)=>store.session(store.join(codes[index].code,name).token,'player').entry_id);
  ids.forEach(id=>store.start(id,selection));
  for(const index of [0,1,4,2])for(let hit=1;hit<=15;hit++)store.hit(ids[index],hit);
  for(const [index,score] of [[0,68000],[1,68000],[4,90000],[2,100000]])store.db.prepare('UPDATE entries SET score=? WHERE id=?').run(score,ids[index]);
  const testing=store.join(store.newTestEntry('https://example.test').code,'测试最高分'),testId=store.session(testing.token,'player').entry_id;
  store.start(testId,selection);for(let hit=1;hit<=15;hit++)store.hit(testId,hit);
  const before=store.results(),board=store.leaderboard(ids[0]);
  assert.deepEqual(board.rows.map(row=>[row.rank,row.score]),[[1,90000],[2,68000],[2,68000]]);
  assert.deepEqual(board.rows.map(row=>row.name),['欧**娜','张*','李*']);
  assert.deepEqual(board.rows.filter(row=>row.isSelf).map(row=>row.number),[1]);
  assert.equal(board.viewer.rank,2);assert.equal(board.activity.completed,3);
  for(const name of names)assert.ok(!JSON.stringify(board).includes(name));
  for(const row of board.rows)assert.deepEqual(Object.keys(row).sort(),['isSelf','name','number','quality','rank','route','score']);
  assert.equal(store.leaderboard(testId).rows.some(row=>row.isSelf),false);
  assert.equal(store.leaderboard(ids[2]).rows.some(row=>row.isSelf),false);
  assert.deepEqual(store.results(),before);
  assert.equal(maskName('王'),'*');assert.equal(maskName('  张 三丰  '),'张*丰');
});

test('leaderboard HTTP is public but self highlights require the player cookie and never expose private fields',async t=>{
  const {store,request}=await httpFixture(t,2);
  const empty=await request('/api/leaderboard');assert.equal(empty.status,200);assert.deepEqual(empty.json.rows,[]);assert.equal(empty.json.viewer,null);
  const joined=await request('/api/join',{method:'POST',body:{nickname:'王小明'}});
  await request('/api/start',{method:'POST',cookie:joined.cookie,body:{selection}});
  for(let hit=1;hit<=15;hit++)await request('/api/hit',{method:'POST',cookie:joined.cookie,body:{expectedHit:hit}});
  const anonymous=await request('/api/leaderboard?number=1');
  assert.equal(anonymous.status,200);assert.equal(anonymous.json.rows[0].name,'王*明');assert.equal(anonymous.json.viewer,null);assert.equal(anonymous.json.rows[0].isSelf,false);
  const mine=await request('/api/leaderboard',{cookie:joined.cookie});
  assert.equal(mine.json.viewer.rank,1);assert.equal(mine.json.rows[0].isSelf,true);
  assert.ok(!mine.text.includes('王小明'));assert.ok(!mine.text.includes(store.codes('https://example.test')[0].code));
  assert.equal((await request('/api/admin/summary')).status,401);assert.equal((await request('/api/admin/codes.csv')).status,401);
  const page=await request('/leaderboard');assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);assert.match(page.text,/锻刀天榜/);
});
