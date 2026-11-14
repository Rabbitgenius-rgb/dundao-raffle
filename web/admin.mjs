import {activityApi,escapeHtml as esc} from './activity.mjs';
const root=document.querySelector('#admin-console');
let snapshot=null,tab='scores',message='',lastUpdated='',testLink='',refreshing=false,authenticated=false;
const time=value=>new Date(value).toLocaleString('zh-CN',{hour12:false});
const empty=(title,detail)=>'<div class="empty-state"><strong>'+title+'</strong><p>'+detail+'</p></div>';
function renderLogin(){
  authenticated=false;
  root.innerHTML='<section class="admin-login"><p class="eyebrow">ORGANIZER ACCESS</p><h2>查看这场锻刀大会</h2><p class="intro">使用管理口令查看参与进度、排名，<br>以及下载参与码与成绩表。</p><form id="admin-login" class="entry-form"><label for="admin-password">管理口令</label><input type="password" id="admin-password" name="password" autocomplete="current-password" required><button class="primary" type="submit">进入活动管理</button></form><p class="admin-message" role="alert">'+esc(message)+'</p></section>';
}
function render(){
  if(!authenticated||!snapshot){renderLogin();return;}
  const {activity,results,codes}=snapshot;
  const table=tab==='scores'?
    (results.length?'<div class="table-wrap"><table class="admin-table"><thead><tr><th>名次</th><th>真实姓名</th><th>分数</th><th>品质</th><th>进化路线</th><th>完成时间</th></tr></thead><tbody>'+results.map(r=>'<tr><td class="place">'+r.rank+'</td><td class="person">'+esc(r.nickname)+'<small class="muted"> · '+String(r.number).padStart(2,'0')+'</small></td><td class="score">'+r.score.toLocaleString()+'</td><td>'+esc(r.quality)+'</td><td>'+esc(r.route)+'</td><td>'+esc(time(r.finishedAt))+'</td></tr>').join('')+'</tbody></table></div>':empty('等待第一把成刀','参与者填写姓名并完成十五锤后，成绩会自动出现在这里。')):
    '<div class="table-wrap"><table class="admin-table"><thead><tr><th>编号</th><th>备用参与码</th><th>状态</th><th>真实姓名</th><th>专属恢复链接</th></tr></thead><tbody>'+codes.map(r=>'<tr><td>'+String(r.number).padStart(2,'0')+'</td><td><code>'+esc(r.code)+'</code></td><td class="'+(r.status==='已完成'?'status-done':r.status==='未使用'?'status-pending':'status-progress')+'">'+r.status+'</td><td class="person">'+esc(r.nickname||'—')+'</td><td><button class="admin-button" data-copy="'+r.number+'">复制专属链接</button></td></tr>').join('')+'</tbody></table></div><p class="code-notice">直接分享游戏首页，参与者填写真实姓名即可参加。下方专属链接可用于指定参与或换设备恢复，请核对姓名后再提供，不要把同一链接发给多人。</p>';
  root.innerHTML='<div class="admin-title"><div><h2>'+esc(activity.title)+'</h2><p>填写真实姓名 · 同名保留最早成绩 · 同分并列</p></div><div class="admin-actions"><button class="admin-button" data-action="refresh" '+(refreshing?'disabled':'')+'>'+(refreshing?'刷新中…':'刷新数据')+'</button><a class="admin-button gold" href="/api/admin/results.csv" download>导出成绩 CSV</a><button class="admin-button" data-action="logout">退出管理</button></div></div>'+
    '<div class="stat-grid">'+[['参与名额',activity.capacity,'填写真实姓名即可参加'],['已收录',activity.completed,'按姓名去重的正式成绩'],['锻造中',activity.inProgress,'可恢复原有进度'],['未开局',activity.capacity-activity.started,'尚未开始正式锻造']].map(([label,value,note])=>'<div class="stat-card"><span>'+label+'</span><strong>'+value+'</strong><small>'+note+'</small></div>').join('')+'</div>'+
    '<div class="admin-tabs" role="tablist" aria-label="管理内容"><button role="tab" aria-selected="'+(tab==='scores')+'" data-tab="scores">成绩排名</button><button role="tab" aria-selected="'+(tab==='codes')+'" data-tab="codes">参与码 · '+activity.capacity+'</button></div>'+
    '<div class="table-heading"><div><h3>'+(tab==='scores'?'正式成绩':'备用参与码与恢复链接')+'</h3><p>'+(tab==='scores'?'每个姓名只计最早完成的一局，再按分数从高到低排名。':'普通参与者只需填写姓名，无须逐个分发这些链接。')+'</p></div>'+(tab==='codes'?'<a class="admin-button gold" href="/api/admin/codes.csv" download>下载 '+activity.capacity+' 个参与码 CSV</a>':'')+'</div>'+table+
    '<p class="update-note">最近更新 '+esc(lastUpdated)+' · 同名重复不计入 '+activity.duplicates+' 条 · 每 10 秒自动刷新</p><p class="admin-status" role="status">'+esc(message)+'</p>'+
    '<div class="test-tools"><button class="admin-button" data-action="test">生成流程测试链接</button><p>测试不占正式名额，不进入正式排名。</p>'+(testLink?'<a class="test-link" href="'+esc(testLink)+'" target="_blank" rel="noopener">打开测试正式流程 ↗</a>':'')+'</div>';
}
async function refresh(quiet=false){
  if(refreshing)return;refreshing=true;
  if(!quiet)render();
  try {snapshot=await activityApi('admin/summary');authenticated=true;lastUpdated=new Date().toLocaleTimeString('zh-CN',{hour12:false});if(!quiet)message='数据已更新。';}
  catch(error){message=error.message;if(error.status===401){authenticated=false;snapshot=null;}}
  refreshing=false;render();
}
root.addEventListener('submit',async event=>{
  if(event.target.id!=='admin-login')return;event.preventDefault();
  const button=event.target.querySelector('button');button.disabled=true;
  const password=document.querySelector('#admin-password').value;
  try {await activityApi('admin/login',{password});authenticated=true;message='';await refresh(true);}
  catch(error){message=error.message;renderLogin();}
});
root.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.tab){tab=button.dataset.tab;message='';render();return;}
  try {
    if(button.dataset.copy){
      const item=snapshot.codes.find(item=>item.number===Number(button.dataset.copy));
      try {await navigator.clipboard.writeText(item.link);message='参与者 '+String(item.number).padStart(2,'0')+' 的专属链接已复制。';}
      catch {message='请从参与码 CSV 中复制该参与者的专属链接。';}
      render();return;
    }
    if(button.dataset.action==='refresh')return refresh();
    if(button.dataset.action==='logout'){await activityApi('admin/logout',{});snapshot=null;message='';renderLogin();return;}
    if(button.dataset.action==='test'){button.disabled=true;const result=await activityApi('admin/test-entry',{});testLink=result.link;message='已创建独立测试码，不占用正式名额。';render();}
  } catch(error){message=error.message;render();}
});
async function initialize(){
  try {const session=await activityApi('admin/session');if(session.authenticated){authenticated=true;return refresh(true);}}
  catch(error){message=error.message;}
  renderLogin();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated)refresh(true);});
setInterval(()=>{if(authenticated&&!document.hidden&&tab==='scores')refresh(true);},10000);
initialize();
