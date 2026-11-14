import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ActivityStore, ActivityError, verifyPassword, csv } from './store.mjs';

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const parseCookies=header=>Object.fromEntries(String(header??'').split(';').map(s=>s.trim().split('=')).filter(p=>p.length===2));
export function createApp({store,root=fileURLToPath(new URL('../',import.meta.url)),origin,adminHash}) {
  if(!origin||new URL(origin).origin!==origin)throw new Error('PUBLIC_ORIGIN must be an exact origin without trailing slash');
  if(!/^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$/.test(adminHash??''))throw new Error('ADMIN_PASSWORD_HASH is required');
  const secure=origin.startsWith('https:');
  const attempts=new Map(),assets=new Map();
  function cookie(name,value,age){return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;}
  function send(res,status,data,headers={}){
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));
  }
  function throttle(key,max) {
    const time=Date.now(),entry=attempts.get(key);
    if(!entry||entry.until<time)attempts.set(key,{count:1,until:time+60000});
    else if(++entry.count>max)throw new ActivityError(429,'请求较多，请稍等一分钟再试。','rate_limited');
    if(attempts.size>5000)for(const [key,value] of attempts)if(value.until<time)attempts.delete(key);
  }
  async function body(req){
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new ActivityError(415,'请使用 JSON 请求。');
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>8192)throw new ActivityError(413,'请求内容过长。');chunks.push(chunk);}
    try {const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}
    catch {throw new ActivityError(400,'请求格式不正确。');}
  }
  const http=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      const url=new URL(req.url,origin),path=url.pathname;
      if(path==='/healthz'&&req.method==='GET')return send(res,200,{ok:true});
      if(path.startsWith('/api/')){
        if(req.method!=='GET'&&req.method!=='POST')throw new ActivityError(405,'不支持此请求方法。');
        if(req.method==='POST'&&req.headers.origin!==origin)throw new ActivityError(403,'请从活动网页提交请求。','invalid_origin');
        const cookies=parseCookies(req.headers.cookie);
        const playerSession=()=>{
          const session=store.session(cookies.dundao_player,'player');
          if(!session)throw new ActivityError(401,'请先填写真实姓名进入正式场。','unauthorized');
          return session.entry_id;
        };
        const adminSession=()=>{
          if(!store.session(cookies.dundao_admin,'admin'))throw new ActivityError(401,'请先登录活动管理。','unauthorized');
        };
        if(path==='/api/activity'&&req.method==='GET')return send(res,200,{activity:store.info()});
        if(path==='/api/leaderboard'&&req.method==='GET'){
          const session=store.session(cookies.dundao_player,'player');
          return send(res,200,store.leaderboard(session?.entry_id??null));
        }
        if(path==='/api/me'&&req.method==='GET'){
          const session=store.session(cookies.dundao_player,'player');
          return send(res,200,{player:session?store.player(session.entry_id):null});
        }
        if(path==='/api/join'&&req.method==='POST'){
          throttle(`join:${req.socket.remoteAddress}`,200);
          const data=await body(req),session=store.session(cookies.dundao_player,'player'),joined=store.join(data.code,data.nickname,session?.entry_id??null);
          return send(res,200,{player:joined.player},{'Set-Cookie':cookie('dundao_player',joined.token,604800)});
        }
        if(path==='/api/logout'&&req.method==='POST'){
          store.deleteSession(cookies.dundao_player);
          return send(res,200,{ok:true},{'Set-Cookie':cookie('dundao_player','',0)});
        }
        if(path==='/api/start'&&req.method==='POST'){
          const id=playerSession(),data=await body(req);return send(res,200,{player:store.start(id,data.selection)});
        }
        if(path==='/api/hit'&&req.method==='POST'){
          const id=playerSession(),data=await body(req);return send(res,200,{player:store.hit(id,data.expectedHit)});
        }
        if(path==='/api/admin/login'&&req.method==='POST'){
          throttle(`admin:${req.socket.remoteAddress}`,10);
          const data=await body(req);
          if(typeof data.password!=='string'||data.password.length>256||!verifyPassword(data.password,adminHash))throw new ActivityError(401,'管理口令不正确。','invalid_password');
          return send(res,200,{ok:true},{'Set-Cookie':cookie('dundao_admin',store.newSession('admin'),43200)});
        }
        if(path==='/api/admin/session'&&req.method==='GET')return send(res,200,{authenticated:!!store.session(cookies.dundao_admin,'admin')});
        if(path.startsWith('/api/admin/')){
          adminSession();
          if(path==='/api/admin/summary'&&req.method==='GET')return send(res,200,{activity:store.info(),results:store.results(),codes:store.codes(origin)});
          if(path==='/api/admin/logout'&&req.method==='POST'){
            store.deleteSession(cookies.dundao_admin);return send(res,200,{ok:true},{'Set-Cookie':cookie('dundao_admin','',0)});
          }
          if(path==='/api/admin/test-entry'&&req.method==='POST')return send(res,200,store.newTestEntry(origin));
          if(path==='/api/admin/results.csv'&&req.method==='GET'){
            const rows=[['排名','参与者编号','真实姓名','分数','品质','路线','残损处数','锤数','完成时间（UTC）','成刀编号'],...store.results().map(r=>[r.rank,r.number,r.nickname,r.score,r.quality,r.route,r.damage,r.hits,r.finishedAt,r.forgeId])];
            res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="dundao-scores.csv"','Cache-Control':'no-store'});return res.end(csv(rows));
          }
          if(path==='/api/admin/codes.csv'&&req.method==='GET'){
            const rows=[['参与者编号','参与码','专属参与链接','状态','真实姓名'],...store.codes(origin).map(r=>[r.number,r.code,r.link,r.status,r.nickname])];
            res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="dundao-invite-codes.csv"','Cache-Control':'no-store'});return res.end(csv(rows));
          }
        }
        throw new ActivityError(404,'接口不存在。');
      }
      if(req.method!=='GET'&&req.method!=='HEAD')throw new ActivityError(405,'不支持此请求方法。');
      if(path==='/'){res.writeHead(302,{Location:'/web/','Cache-Control':'no-cache'});return res.end();}
      if(path==='/admin'){res.writeHead(302,{Location:'/web/admin.html','Cache-Control':'no-cache'});return res.end();}
      if(path==='/leaderboard'){res.writeHead(302,{Location:'/web/leaderboard.html','Cache-Control':'no-cache'});return res.end();}
      let file=decodeURIComponent(path);
      if(file==='/web/')file='/web/index.html';
      if(!(file.startsWith('/web/')||file==='/verification/route-gallery.html'||file==='/release.json'||file==='/LICENSE.txt')||file.split('/').some(p=>p==='..'||p.startsWith('.')))throw new ActivityError(404,'页面不存在。');
      const absolute=resolve(root,'.'+file);
      if(!absolute.startsWith(resolve(root)+'/')||!MIME[extname(file)])throw new ActivityError(404,'页面不存在。');
      let asset=assets.get(file);
      if(!asset){
        try {if(!statSync(absolute).isFile())throw new Error();const raw=readFileSync(absolute);asset={raw,gz:raw.length>1024?gzipSync(raw):null};assets.set(file,asset);}
        catch {throw new ActivityError(404,'页面不存在。');}
      }
      const compressed=asset.gz&&/\bgzip\b/.test(req.headers['accept-encoding']??'');
      res.writeHead(200,{'Content-Type':MIME[extname(file)],'Cache-Control':'no-cache','Vary':'Accept-Encoding',...(compressed?{'Content-Encoding':'gzip'}:{})});
      return res.end(req.method==='HEAD'?undefined:compressed?asset.gz:asset.raw);
    } catch(error){
      if(error instanceof ActivityError)return send(res,error.status,{error:error.message,code:error.code});
      console.error('Activity request failed:',error.name,error.message);
      if(!res.headersSent)send(res,500,{error:'保存暂时失败，请稍后重试；你的参与机会不会因此增加或扣除。',code:'server_error'});
      else res.end();
    }
  });
  http.headersTimeout=15000;http.requestTimeout=20000;
  return http;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const store=new ActivityStore({filename:resolve(process.env.DATA_DIR??'./private/activity-data','activity.sqlite'),title:process.env.ACTIVITY_TITLE??'锻刀大会',capacity:Number(process.env.ACTIVITY_CAPACITY??100)});
  if(process.env.ACTIVITY_CAPACITY)store.expandCapacity(Number(process.env.ACTIVITY_CAPACITY));
  if(process.env.ACTIVITY_TITLE)store.setTitle(process.env.ACTIVITY_TITLE);
  const server=createApp({store,origin:process.env.PUBLIC_ORIGIN,adminHash:process.env.ADMIN_PASSWORD_HASH});
  const port=Number(process.env.PORT??8080);
  server.listen(port,'0.0.0.0',()=>console.log(`Forge activity listening on ${port}; entries=${store.info().capacity}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>{store.close();process.exit(0);});});
}
