import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, timingSafeEqual, scryptSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createGame, advance, getTier, ROUTES } from '../web/game.mjs';

export class ActivityError extends Error {
  constructor(status, message, code='invalid_request') { super(message); this.status=status; this.code=code; }
}
const digest=value=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString();
const fail=(status,message,code)=>{throw new ActivityError(status,message,code);};
export const normalizeCode=value=>String(value??'').toUpperCase().replace(/[\s-]/g,'');
export function maskName(value){
  const letters=[...String(value??'').replace(/\s+/gu,'')];
  if(letters.length<2)return '*';
  if(letters.length===2)return letters[0]+'*';
  return letters[0]+'*'.repeat(Math.min(3,letters.length-2))+letters.at(-1);
}
export function normalizeName(value){
  const display=String(value??'').normalize('NFKC').trim().replace(/\s+/gu,' ');
  if([...display].length<1||[...display].length>40||/\p{C}/u.test(display))fail(400,'请输入 1–40 个字的真实姓名，不要使用隐藏字符。');
  return {display,key:display.replace(/\s+/gu,'').toLowerCase()};
}
export function hashPassword(password, salt=randomBytes(16).toString('hex')) {
  return `scrypt:${salt}:${scryptSync(password,salt,32).toString('hex')}`;
}
export function verifyPassword(password, hash) {
  const [kind,salt,key]=String(hash).split(':');
  if(kind!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt??'')||!/^[a-f0-9]{64}$/.test(key??''))return false;
  const value=scryptSync(String(password),salt,32);
  return timingSafeEqual(value,Buffer.from(key,'hex'));
}
export function csv(rows) {
  return '\ufeff'+rows.map(row=>row.map(value=>{
    let text=String(value??'');
    if(/^[=+\-@\t\r\n]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n')+'\r\n';
}

/** One entry owns one persisted game; the client never supplies a score or RNG. */
export class ActivityStore {
  constructor({filename, title='锻刀大会', capacity=100}) {
    if(!Number.isInteger(capacity)||capacity<1||capacity>200)throw new Error('Invalid activity capacity');
    if(filename!==':memory:')mkdirSync(dirname(filename),{recursive:true});
    this.db=new DatabaseSync(filename,{timeout:5000});
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries(
        id INTEGER PRIMARY KEY,code TEXT NOT NULL UNIQUE,number INTEGER NOT NULL,
        is_test INTEGER NOT NULL DEFAULT 0,nickname TEXT,
        state_json TEXT,started_at TEXT,finished_at TEXT,score INTEGER,name_key TEXT,completion_order INTEGER,
        CHECK(score IS NULL OR (score>=0 AND score<=100000))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS formal_entry_number ON entries(number) WHERE is_test=0;
      CREATE TABLE IF NOT EXISTS sessions(
        token_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,entry_id INTEGER REFERENCES entries(id),expires_at INTEGER NOT NULL
      );`);
    this.transaction(()=>{
      const columns=new Set(this.db.prepare('PRAGMA table_info(entries)').all().map(column=>column.name));
      if(!columns.has('name_key'))this.db.exec('ALTER TABLE entries ADD COLUMN name_key TEXT');
      if(!columns.has('completion_order'))this.db.exec('ALTER TABLE entries ADD COLUMN completion_order INTEGER');
      for(const entry of this.db.prepare('SELECT id,nickname FROM entries WHERE nickname IS NOT NULL AND name_key IS NULL').all()){
        this.db.prepare('UPDATE entries SET name_key=? WHERE id=?').run(normalizeName(entry.nickname).key,entry.id);
      }
      let completionOrder=this.db.prepare('SELECT COALESCE(MAX(completion_order),0) AS n FROM entries').get().n;
      for(const entry of this.db.prepare('SELECT id FROM entries WHERE finished_at IS NOT NULL AND completion_order IS NULL ORDER BY finished_at,id').all()){
        this.db.prepare('UPDATE entries SET completion_order=? WHERE id=?').run(++completionOrder,entry.id);
      }
      if(!this.db.prepare("SELECT value FROM metadata WHERE key='activity_id'").get()) {
        const insert=this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)');
        insert.run('activity_id',randomBytes(8).toString('hex')); insert.run('title',title);
        insert.run('created_at',now());
        for(let i=1;i<=capacity;i++)this.addEntry(i,false);
      }
    });
  }
  expandCapacity(capacity){
    if(!Number.isInteger(capacity)||capacity<1||capacity>200)fail(400,'参与名额应为 1–200。');
    this.transaction(()=>{
      const current=this.db.prepare('SELECT COUNT(*) AS n FROM entries WHERE is_test=0').get().n;
      if(capacity<current)fail(409,'已有参与码不能通过缩小名额移除。');
      for(let number=current+1;number<=capacity;number++)this.addEntry(number,false);
    });
  }
  setTitle(title){this.db.prepare("UPDATE metadata SET value=? WHERE key='title'").run(String(title));}
  rankedEntries(){
    // Commit order resolves even same-millisecond finishes; later names never replace a result.
    const rows=this.db.prepare('SELECT * FROM entries WHERE is_test=0 AND finished_at IS NOT NULL ORDER BY completion_order,id').all();
    const names=new Set();
    return rows.filter(row=>{if(names.has(row.name_key))return false;names.add(row.name_key);return true;})
      .sort((a,b)=>b.score-a.score||a.completion_order-b.completion_order);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {const result=fn();this.db.exec('COMMIT');return result;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  addEntry(number,isTest) {
    const raw=randomBytes(8).toString('hex').toUpperCase();
    const code=raw.match(/.{4}/g).join('-');
    const result=this.db.prepare('INSERT INTO entries(code,number,is_test) VALUES(?,?,?)').run(normalizeCode(code),number,isTest?1:0);
    return this.db.prepare('SELECT * FROM entries WHERE id=?').get(result.lastInsertRowid);
  }
  info() {
    const meta=Object.fromEntries(this.db.prepare('SELECT key,value FROM metadata').all().map(r=>[r.key,r.value]));
    const counts=this.db.prepare(`SELECT COUNT(*) AS capacity,COUNT(started_at) AS started,COUNT(finished_at) AS finished FROM entries WHERE is_test=0`).get();
    const completed=this.rankedEntries().length;
    return {id:meta.activity_id,title:meta.title,...counts,completed,duplicates:counts.finished-completed,inProgress:counts.started-counts.finished,remaining:counts.capacity-counts.finished};
  }
  newSession(kind,entryId=null) {
    const token=randomBytes(32).toString('base64url');
    const expiry=Date.now()+(kind==='admin'?12*60*60*1000:7*24*60*60*1000);
    this.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    this.db.prepare('INSERT INTO sessions(token_hash,kind,entry_id,expires_at) VALUES(?,?,?,?)').run(digest(token),kind,entryId,expiry);
    return token;
  }
  session(token,kind) {
    if(typeof token!=='string'||token.length>100)return null;
    return this.db.prepare('SELECT entry_id FROM sessions WHERE token_hash=? AND kind=? AND expires_at>?').get(digest(token),kind,Date.now())??null;
  }
  deleteSession(token) {if(token)this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
  join(code,nickname,activeEntryId=null) {
    if(code===undefined||code===null||String(code).trim()===''){
      return this.transaction(()=>{
        const name=normalizeName(nickname);
        const current=activeEntryId?this.entry(activeEntryId):null;
        if(current&&!current.is_test&&current.name_key===name.key)return {token:this.newSession('player',current.id),player:this.player(current.id)};
        if(this.rankedEntries().some(row=>row.name_key===name.key))fail(409,'这个姓名已有正式成绩，已保留最早完成的那次，不能再次开局。','same_name_completed');
        const existing=this.db.prepare('SELECT id,finished_at FROM entries WHERE is_test=0 AND name_key=? ORDER BY completion_order,id LIMIT 1').get(name.key);
        if(existing)fail(409,existing.finished_at?'这个姓名已有正式成绩，已保留最早完成的那次，不能再次开局。':'这个姓名已进入正式场，请在原来的设备继续；换设备恢复请联系组织者。',existing.finished_at?'same_name_completed':'same_name_in_progress');
        const available=this.db.prepare('SELECT id FROM entries WHERE is_test=0 AND nickname IS NULL ORDER BY number LIMIT 1').get();
        if(!available)fail(409,'本次活动参与名额已满，请联系组织者。','activity_full');
        this.db.prepare('UPDATE entries SET nickname=?,name_key=? WHERE id=?').run(name.display,name.key,available.id);
        return {token:this.newSession('player',available.id),player:this.player(available.id)};
      });
    }
    const normalized=normalizeCode(code);
    if(!/^[A-F0-9]{16}$/.test(normalized))fail(400,'参与码无效，请核对组织者发给你的参与码。','invalid_code');
    const entry=this.db.prepare('SELECT * FROM entries WHERE code=?').get(normalized);
    if(!entry)fail(400,'参与码无效，请核对组织者发给你的参与码。','invalid_code');
    if(!entry.nickname) {
      const name=normalizeName(nickname);
      if(!entry.is_test&&this.rankedEntries().some(row=>row.name_key===name.key))fail(409,'这个姓名已有正式成绩，已保留最早完成的那次。本参与码尚未开局。','same_name_completed');
      this.db.prepare('UPDATE entries SET nickname=?,name_key=? WHERE id=? AND nickname IS NULL').run(name.display,name.key,entry.id);
    }
    return {token:this.newSession('player',entry.id),player:this.player(entry.id)};
  }
  entry(id) {
    const entry=this.db.prepare('SELECT * FROM entries WHERE id=?').get(id);
    if(!entry)fail(401,'请先填写真实姓名进入正式场。','unauthorized');
    return entry;
  }
  player(id) {
    const entry=this.entry(id);
    const state=entry.state_json?JSON.parse(entry.state_json):null;
    const ranked=entry.finished_at&&!entry.is_test?this.rankedEntries():[];
    const isDuplicate=!!entry.finished_at&&!entry.is_test&&!ranked.some(row=>row.id===entry.id);
    const rank=entry.finished_at&&!entry.is_test&&!isDuplicate?1+ranked.filter(row=>row.score>entry.score).length:null;
    return {number:entry.number,nickname:entry.nickname,isTest:!!entry.is_test,state,rank,isDuplicate,finishedAt:entry.finished_at};
  }
  start(id,selection) {
    return this.transaction(()=>{
      const entry=this.entry(id);
      if(!entry.state_json){
        if(!entry.is_test&&this.rankedEntries().some(row=>row.name_key===entry.name_key))fail(409,'这个姓名已有更早完成的正式成绩，不能再次开局。','same_name_completed');
        let state;
        try {state=createGame(selection);}catch {fail(400,'配件选择无效，请重新选择。');}
        this.db.prepare('UPDATE entries SET state_json=?,started_at=? WHERE id=? AND state_json IS NULL').run(JSON.stringify(state),now(),id);
      }
      return this.player(id);
    });
  }
  hit(id,expectedHit) {
    if(!Number.isInteger(expectedHit)||expectedHit<1||expectedHit>15)fail(400,'落锤序号无效。');
    return this.transaction(()=>{
      const entry=this.entry(id);
      if(!entry.state_json)fail(409,'请先选择配件并让刀胚入炉。','not_started');
      const state=JSON.parse(entry.state_json);
      // A lost response, double click or second tab can repeat a request safely.
      if(expectedHit<=state.hits)return this.player(id);
      if(state.complete||expectedHit!==state.hits+1)fail(409,'锻造进度已变化，请恢复已保存的进度。','out_of_order');
      const next=advance(state);
      const completionOrder=next.complete?1+this.db.prepare('SELECT COALESCE(MAX(completion_order),0) AS n FROM entries').get().n:null;
      this.db.prepare('UPDATE entries SET state_json=?,score=?,finished_at=?,completion_order=? WHERE id=?').run(JSON.stringify(next),next.complete?next.score:null,next.complete?now():null,completionOrder,id);
      return this.player(id);
    });
  }
  results() {
    const complete=this.rankedEntries();
    let previousScore=null,rank=0;
    return complete.map((entry,index)=>{
      if(entry.score!==previousScore)rank=index+1;
      previousScore=entry.score;
      const state=JSON.parse(entry.state_json);
      return {rank,number:entry.number,nickname:entry.nickname,score:entry.score,
        route:ROUTES.find(r=>r.id===state.route)?.name??'',quality:getTier(entry.score).name,
        damage:state.damage.length,hits:state.hits,finishedAt:entry.finished_at,forgeId:state.id};
    });
  }
  leaderboard(entryId=null){
    const player=entryId?this.player(entryId):null;
    const rows=this.results().map(row=>({
      rank:row.rank,number:row.number,name:maskName(row.nickname),score:row.score,
      quality:row.quality,route:row.route,
      isSelf:!!player&&!player.isTest&&!player.isDuplicate&&player.number===row.number
    }));
    return {activity:this.info(),rows,viewer:player?{
      number:player.number,rank:player.rank,complete:!!player.state?.complete,
      isTest:player.isTest,isDuplicate:player.isDuplicate
    }:null};
  }
  codes(origin) {
    const ranked=new Set(this.rankedEntries().map(row=>row.id));
    return this.db.prepare('SELECT * FROM entries WHERE is_test=0 ORDER BY number').all().map(entry=>({
      number:entry.number,code:entry.code.match(/.{4}/g).join('-'),nickname:entry.nickname??'',
      status:entry.finished_at?(ranked.has(entry.id)?'已完成':'同名不计入'):entry.started_at?'锻造中':entry.nickname?'已进入':'未使用',
      link:`${origin}/web/#join=${entry.code.match(/.{4}/g).join('-')}`
    }));
  }
  newTestEntry(origin) {
    const entry=this.addEntry(0,true);
    return {code:entry.code.match(/.{4}/g).join('-'),link:`${origin}/web/#join=${entry.code}`};
  }
  close(){this.db.close();}
}
