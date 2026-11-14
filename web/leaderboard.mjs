import {activityApi,escapeHtml as esc} from './activity.mjs';
import {getTier} from './game.mjs';
const $=selector=>document.querySelector(selector);
const content=$('#rank-content'),refreshButton=$('#refresh-board'),findButton=$('#find-me');
let current=null,loading=false;
const score=value=>Number(value).toLocaleString('en-US');
const quality=row=>'<span class="rank-quality" style="color:'+getTier(row.score).color+'">'+esc(row.quality)+'</span>';
function render(data){
  const {activity,rows,viewer}=data;
  document.title=activity.title+' · 锻刀天榜';
  $('#activity-name').textContent=activity.title;
  $('#rank-count').textContent=rows.length+' / '+activity.capacity;
  $('#rank-best').textContent=rows.length?score(rows[0].score):'—';
  $('#rank-self').textContent=!viewer?'尚未参赛':viewer.isTest?'测试不入榜':viewer.isDuplicate?'同名成绩已收录':viewer.rank?'第 '+viewer.rank+' 名':'锻造中';
  const mine=rows.find(row=>row.isSelf);
  findButton.disabled=!mine;
  if(!rows.length){
    content.innerHTML='<div class="rank-empty"><span>✦</span><h2>天榜静候第一把成刀</h2><p>完成正式场的十五锤，成绩就会自动出现在这里。<br>自由试玩与测试局不参与排名。</p><a href="./">去工坊，留下你的锋芒 ↗</a></div>';
  }else{
    const best=rows[0],tied=rows.filter(row=>row.rank===1).length>1;
    content.innerHTML='<section class="champion" aria-label="当前榜首"><div class="champion-place">01</div><div><p class="eyebrow">'+(tied?'JOINT FIRST / 并列榜首':'LEADING BLADE / 当前榜首')+'</p><p class="champion-name">'+esc(best.name)+(best.isSelf?'<span class="my-tag">我</span>':'')+'</p><div class="champion-info">锻者 '+String(best.number).padStart(3,'0')+' · '+esc(best.route)+' · '+esc(best.quality)+'</div></div><div class="champion-score">'+score(best.score)+'<small>分</small></div></section>'+
      '<div class="ranking-title"><h2>正式成刀排名</h2><span>'+rows.length+' 位锻者已上榜 · 同分并列</span></div><div class="ranking-table-wrap"><table class="ranking-table"><thead><tr><th>名次</th><th>锻者</th><th>最终分数</th><th>品质</th><th>进化路线</th></tr></thead><tbody>'+rows.map(row=>'<tr id="rank-'+row.number+'" class="'+(row.rank<=3?'medal ':'')+(row.isSelf?'is-self':'')+'"><td class="rank-number">'+String(row.rank).padStart(2,'0')+'</td><td><div class="rank-person"><strong>'+esc(row.name)+(row.isSelf?'<span class="my-tag">我</span>':'')+'</strong><small>#'+String(row.number).padStart(3,'0')+'</small></div></td><td class="rank-score">'+score(row.score)+'</td><td>'+quality(row)+'</td><td>'+esc(row.route)+'</td></tr>').join('')+'</tbody></table></div>';
  }
  content.setAttribute('aria-busy','false');
}
async function update(){
  if(loading)return;
  loading=true;refreshButton.disabled=true;refreshButton.textContent='更新中…';
  try{
    current=await activityApi('leaderboard');render(current);
    $('#rank-error').hidden=true;
    $('#update-time').textContent='更新于 '+new Date().toLocaleTimeString('zh-CN',{hour12:false})+' · 每 10 秒刷新';
  }catch(error){
    $('#rank-error').textContent=(current?'暂时无法更新，保留上次榜单。':'')+error.message;
    $('#rank-error').hidden=false;
    $('#update-time').textContent='更新失败，可点击刷新重试';
    content.setAttribute('aria-busy','false');
    if(!current)content.innerHTML='<div class="rank-empty"><span>◇</span><h2>暂时未能展开天榜</h2><p>请检查网络，稍后点击“刷新榜单”重试。</p></div>';
  }finally{loading=false;refreshButton.disabled=false;refreshButton.textContent='刷新榜单';}
}
refreshButton.addEventListener('click',update);
findButton.addEventListener('click',()=>{
  const mine=current?.rows.find(row=>row.isSelf);
  if(mine)document.getElementById('rank-'+mine.number)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
setInterval(()=>{if(!document.hidden)update();},10000);
update();
