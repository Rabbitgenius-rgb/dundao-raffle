import { PARTS, ROUTES, TOTAL_HITS, QUALITY_TIERS, createGame, advance, getTier, formatScore } from './game.mjs';
import { ForgeScene } from './scene.mjs';
import { getEvolutionInfo } from './evolution.mjs';
import { activityApi, escapeHtml } from './activity.mjs';

const panel=document.querySelector('#panel');
const host=document.querySelector('#scene');
const scene=new ForgeScene(host);
const soundToggle=document.querySelector('#sound-toggle');
soundToggle.addEventListener('click',()=>{
  scene.audio.setEnabled(!scene.audio.enabled);
  soundToggle.setAttribute('aria-pressed',String(scene.audio.enabled));
  soundToggle.textContent=scene.audio.enabled?'音效 开':'音效 关';
  soundToggle.title=scene.audio.enabled?'关闭锻造音效':'开启锻造音效';
});
const labels={blade:'刀身',handle:'刀柄',guard:'护手'};
const order=Object.keys(labels);
let selection={blade:'straight',handle:'wrap',guard:'disc'};
let state=createGame(selection);
let screen='home', tab='blade', busy=false, generation=0;
let activity=null, officialPlayer=null, notice='', entryName='', inviteCode=new URLSearchParams(location.hash.slice(1)).get('join')??'';
const $=selector=>document.querySelector(selector);
const routeOf=()=>ROUTES.find(r=>r.id===state.route);
const selectedNames=()=>order.map(k=>PARTS[k].find(p=>p.id===selection[k]).name).join(' / ');
const signed=n=>(n>=0?'+':'−')+formatScore(Math.abs(n));
const action=(id,label,secondary=false)=>'<button type="button" class="'+(secondary?'secondary':'primary')+'" data-action="'+id+'">'+label+'</button>';
const footer=(main,back,caption='')=>'<div class="actions">'+main+(back||'')+(caption?'<p class="fineprint">'+caption+'</p>':'')+'</div>';
const damageText=()=>state.damage.length?'刀身有 '+state.damage.length+' 处残损':'刀身完整';
const row=e=>'<div class="event-row"><span>'+String(e.hit).padStart(2,'0')+'</span><span>'+e.title+'</span><span class="'+(e.delta<0?'loss':'gain')+'">'+signed(e.delta)+'</span></div>';
function officialResult(){
  if(!officialPlayer)return '';
  const title=officialPlayer.isTest?'测试流程已完成':officialPlayer.isDuplicate?'同名最早成绩已保留':'✓ 正式成绩已保存';
  const detail=officialPlayer.isTest?'不占用正式名额，不进入排名':officialPlayer.isDuplicate?'这个姓名已有更早完成的成绩，本次不重复进入排名。':escapeHtml(officialPlayer.nickname)+' · 暂列第 '+officialPlayer.rank+' 名 / '+(activity?.capacity??100)+' 人';
  return '<div class="saved-result" role="status"><strong>'+title+'</strong><span>'+detail+'</span><small>同名保留最早完成的成绩；同分并列，名次随其他人完成而更新。</small></div>';
}

function render(updateModel=true) {
  const route=routeOf();
  const evolution=getEvolutionInfo(state);
  const quality=getTier(state.score);
  const viewport=$('.viewport-panel');
  viewport.dataset.mode=screen;
  viewport.classList.toggle('legendary',!!route&&quality.level===6);
  document.documentElement.style.setProperty('--route',route?.color||'#ffb657');
  panel.className='control-panel '+screen+'-panel';
  $('#session-note').textContent=officialPlayer?(officialPlayer.isTest?'测试正式流程 · 不计入活动排名':'正式场 · 每人一局，成绩自动保存'):'自由试玩 · 本局结果不参与活动排名';
  $('.edition-tag').textContent=officialPlayer?(officialPlayer.isTest?'测试场':'正式场'):'试玩版';
  $('#scene-index').textContent=screen==='forge'?'STRIKE / '+String(state.hits).padStart(2,'0'):'THE FORGE / '+(screen==='result'?'03':'01');
  if(screen==='home'){
    $('#scene-label').textContent='炉火未熄，命运未定';
    $('#scene-caption').textContent='选定刀胚，落锤之后才会进化。';
    panel.innerHTML='<p class="eyebrow">A BLADE YET TO BE BORN</p><h1>十五锤，<br><em>锻出未知。</em></h1><p class="intro">从一枚刀胚，到十二种命运。<br>每次落锤，都让它长出新的模样。</p>'+
      '<div class="route-list">'+ROUTES.map(r=>'<span class="route-chip"><i style="--c:'+r.color+'"></i>'+r.name.slice(0,2)+'</span>').join('')+'</div>'+
      '<div class="rules"><div><span>01</span>选择刀身、刀柄与护手</div><div><span>02</span>落锤进化，也可能受损</div><div><span>03</span>第十五锤，揭晓你的成刀</div></div>'+
      footer(action('join','填写姓名，参加正式场'),action('pick','自由试玩',true)+'<a class="atlas-link" href="./leaderboard.html" target="_blank" rel="noopener">查看锻刀排行榜 ↗</a><a class="atlas-link" href="../verification/route-gallery.html" target="_blank" rel="noopener">查看十二系进化与特效 ↗</a>','正式场仅需填写真实姓名 · 神品约 1%');
  } else if(screen==='join'){
    $('#scene-label').textContent='你的十五锤，值得被记住';
    $('#scene-caption').textContent='一人一局，一局成刀。中途离开后可恢复进度。';
    panel.innerHTML='<p class="eyebrow">OFFICIAL FORGE / 正式场</p><h2>'+escapeHtml(activity?.title??'锻刀大会')+'</h2><p class="intro">填写你的真实姓名，开始十五锤锻造。<br>同名保留最早完成的成绩，成刀后自动排名。</p>'+
      '<form id="entry-form" class="entry-form">'+(inviteCode?'<p class="pick-note">已使用专属参与或恢复链接。</p>':'')+
      '<label for="entry-name">真实姓名</label><input id="entry-name" name="name" autocomplete="name" maxlength="80" value="'+escapeHtml(entryName)+'" placeholder="请填写本人的真实姓名" required><p class="pick-note">完整姓名仅供组织者查看，公开排行榜显示脱敏姓名与成绩。同名取最早成绩。中途离开后，请在原设备重新打开本页继续。</p>'+
      '<button class="primary" type="submit" '+(busy?'disabled':'')+'>'+(busy?'正在连接…':'进入正式场')+'</button></form>'+action('practice','先自由试玩',true);
  } else if(screen==='pick'){
    $('#scene-label').textContent='选一枚属于你的刀胚';
    $('#scene-caption').textContent='基础轮廓由你选择，进化方向在锻造中揭晓。';
    const step=order.indexOf(tab);
    panel.innerHTML='<p class="eyebrow">SHAPE YOUR BEGINNING / 0'+(step+1)+'</p><h2>选'+labels[tab]+'</h2><p class="intro">它将带着这个起点，进入炉火。</p>'+
      '<div class="tabs" role="tablist" aria-label="配件类别">'+order.map(k=>'<button class="tab '+(k===tab?'active':'')+'" role="tab" aria-selected="'+(k===tab)+'" data-tab="'+k+'">'+labels[k]+'</button>').join('')+'</div>'+
      '<div class="part-grid">'+PARTS[tab].map(p=>'<button class="part '+(selection[tab]===p.id?'selected':'')+'" aria-pressed="'+(selection[tab]===p.id)+'" data-part="'+p.id+'">'+p.name+'</button>').join('')+'</div>'+
      '<p class="selection-summary">'+selectedNames()+'</p><p class="pick-note">配件决定初始轮廓。不同配件、不同进化路线，拥有相同的得分机会。</p>'+
      footer(action(step===2?'forge':'next',step===2?(officialPlayer?'确认配件，开始正式锻造':'入炉，准备落锤'):'下一步'),action('back','返回',true),officialPlayer?'入炉后固定这组配件；刷新可继续，不会重新开局。':'');
  } else if(screen==='forge'){
    $('#scene-label').textContent=route?route.name+' · '+getTier(state.score).name:'刀胚已入炉 · 等待第一锤';
    $('#scene-caption').textContent=route?route.subtitle+' · '+damageText():'进化尚未发生，第一锤会唤醒它。';
    const e=state.lastEvent;
    panel.innerHTML='<div class="forge-top"><p class="eyebrow">FORGING / 命运进行中</p><span class="hit-counter"><strong>'+state.hits+'</strong> / '+TOTAL_HITS+'</span></div>'+
      '<h2>'+(route?route.name:'未知的进化方向')+'</h2>'+
      '<div class="evolution-state"><span style="color:'+quality.color+'">'+(route?quality.name:'刀胚')+'</span>'+(route?evolution.featureLabel:'尚未觉醒')+'</div>'+
      '<div class="ticks" aria-label="已完成 '+state.hits+' 锤">'+Array.from({length:TOTAL_HITS},(_,i)=>'<i class="'+(i<state.hits?'done':'')+'"></i>').join('')+'</div>'+
      '<div class="score-label">当前得分</div><div class="score-number" id="score">'+formatScore(state.score)+'<small>分</small></div>'+
      '<div class="event-card '+(e?.kind||'')+'" aria-live="polite"><div class="event-top"><strong>'+(e?e.title:'刀胚静待炉火')+'</strong><span class="event-delta">'+(e?signed(e.delta):'—')+'</span></div><p>'+(e?e.description:'每落一锤，刀形与分数都会发生变化。好运会唤醒稀有的进化。')+'</p></div>'+
      '<div class="damage-status '+(state.damage.length?'hurt':'')+'">'+damageText()+(state.damage.length?' · 后续落锤可能修复':' · 主路线觉醒后保持不变')+'</div>'+
      '<div class="event-history">'+state.history.slice(-3).reverse().map(row).join('')+'</div>'+
      footer('<button type="button" class="primary" id="hit-button" data-action="hit" '+(busy?'disabled':'')+'>'+(busy?(state.complete?'正在淬火…':'锻造中…'):'落锤 · 第 '+(state.hits+1)+' 锤')+'</button>',null,
        quality.level<6?'距'+QUALITY_TIERS[quality.level+1].name+'还差 '+formatScore(QUALITY_TIERS[quality.level+1].min-state.score)+' 分':'神品已觉醒 · 分数最高 100,000');
  } else if(screen==='result'){
    const tier=getTier(state.score);
    $('#scene-label').textContent=route.name+' · '+tier.name+'成刀';
    $('#scene-caption').textContent=state.damage.length?'残损也属于这把刀的故事。':'每一道纹路，都来自刚才的十五锤。';
    const plus=state.history.reduce((sum,e)=>sum+Math.max(0,e.delta),0);
    const minus=state.history.reduce((sum,e)=>sum+Math.max(0,-e.delta),0);
    panel.innerHTML='<p class="eyebrow">THE FIFTEENTH STRIKE / 成刀</p><h2>'+route.name+'</h2><div class="result-tier" style="color:'+tier.color+'">'+tier.name+'</div><p class="result-subtitle">'+evolution.featureLabel+' · '+evolution.description+'</p>'+
      '<div class="score-label">最终得分</div><div class="score-number">'+formatScore(state.score)+'<small>分</small></div>'+
      '<div class="damage-status '+(state.damage.length?'hurt':'')+'">'+(state.damage.length?'带伤成刀 · 保留 '+state.damage.length+' 处局部残损':'完整成刀 · 炉火留下锋芒')+'</div>'+
      '<div class="result-meta">'+selectedNames()+'<br>完成 <b>'+TOTAL_HITS+'</b> 锤 · 成长与修复 <b>+'+formatScore(plus)+'</b><br>受损扣分 <b>−'+formatScore(minus)+'</b></div>'+
      '<details class="result-ledger"><summary>查看这把刀的锻造经历</summary><div class="event-history">'+state.history.map(row).join('')+'</div></details>'+
      '<div class="result-id">'+state.id+'</div>'+
      officialResult()+
      footer(officialPlayer?action('refresh-rank','刷新当前名次'):action('again','再锻一把'),'<a class="atlas-link" href="./leaderboard.html" target="_blank" rel="noopener">查看锻刀排行榜 ↗</a>'+(officialPlayer?action('switch-player','切换参与者',true)+action('practice','去自由试玩',true):action('home','回到首页',true))+'<a class="atlas-link" href="../verification/route-gallery.html" target="_blank" rel="noopener">查看其他进化形态 ↗</a>',officialPlayer?'每个姓名只以最早完成的那次成绩计入排名。':'神品约 1% · 各路线机会相同');
  }
  if(officialPlayer&&screen!=='join')panel.insertAdjacentHTML('afterbegin','<div class="participant-tag">'+(officialPlayer.isTest?'流程测试':'正式参与者 '+String(officialPlayer.number).padStart(2,'0'))+' · '+escapeHtml(officialPlayer.nickname)+'</div>');
  if(notice)panel.insertAdjacentHTML('beforeend','<p class="activity-message" role="alert">'+escapeHtml(notice)+'</p>');
  if(busy)panel.querySelectorAll('button').forEach(button=>button.disabled=true);
  host.setAttribute('aria-label',(route?route.name:'未进化的'+selectedNames())+'，'+(screen==='forge'?'置于铁砧上，已敲 '+state.hits+' 锤':screen==='result'?'成刀旋转展示，'+damageText():'立体像素刀胚展示'));
  if(updateModel) scene.setState(state,screen);
}

function resetGame() {
  generation++;busy=false;state=createGame(selection);
}

async function hit() {
  if(busy||screen!=='forge'||state.complete) return;
  busy=true;
  const token=generation;
  const oldLevel=getTier(state.score).level;
  const button=$('#hit-button');
  button.disabled=true;button.textContent=officialPlayer?'正在连接工坊…':'举锤…';
  try {
    let next;
    if(officialPlayer){
      const result=await activityApi('hit',{expectedHit:state.hits+1});
      officialPlayer=result.player;next=result.player.state;
      if(next.hits!==state.hits+1){adoptPlayer(result.player);notice='已恢复服务器保存的最新进度。';busy=false;render();return;}
      button.textContent='举锤…';
    }else next=advance(state);
    notice='';
    await scene.strike(()=>{
      if(token!==generation)return;
      state=next;render();
      const newLevel=getTier(state.score).level;
      if(newLevel!==oldLevel||state.lastEvent.routeRevealed){
        const label=$('#evolution-label'), evo=getEvolutionInfo(state);
        const title=newLevel>oldLevel?(newLevel===6?'神品降临':getTier(state.score).name+'进化'):newLevel<oldLevel?'品质回落':'路线初醒';
        label.innerHTML='<span>'+title+'</span><strong>'+(state.lastEvent.routeRevealed?routeOf().name:evo.featureLabel)+'</strong>';
        label.className='evolution-label';
        void label.offsetWidth;
        label.classList.add('reveal');
        if(newLevel===6)label.classList.add('divine');
      }
      const pop=$('#impact-label');
      pop.innerHTML=signed(state.lastEvent.delta)+'<small>'+state.lastEvent.title+'</small>';
      pop.style.color=state.lastEvent.delta<0?'#ff9b8e':(routeOf()?.color||'#ffdc94');
      pop.classList.remove('pop');void pop.offsetWidth;pop.classList.add('pop');
    },next.lastEvent);
    if(token!==generation)return;
    busy=false;
    if(state.complete) screen='result';
    render(state.complete);
    if(screen==='forge') $('#hit-button')?.focus({preventScroll:true});
  } catch(error){
    busy=false;notice=error.message;
    if(error.status===401){officialPlayer=null;screen='join';}
    render(false);
  }
}

function adoptPlayer(player){
  officialPlayer=player;
  generation++;
  if(player.state){state=player.state;selection={...state.selection};screen=state.complete?'result':'forge';}
  else {resetGame();screen='pick';tab='blade';}
}
async function leaveOfficial(nextScreen){
  if(officialPlayer)await activityApi('logout',{});
  officialPlayer=null;inviteCode='';entryName='';notice='';resetGame();screen=nextScreen;tab='blade';
  history.replaceState(null,'',location.pathname);render();
}
async function startForge(){
  if(!officialPlayer){resetGame();screen='forge';render();return;}
  busy=true;notice='';render(false);
  try {const result=await activityApi('start',{selection});adoptPlayer(result.player);}
  catch(error){notice=error.message;}
  busy=false;render();
}
panel.addEventListener('submit',async event=>{
  if(event.target.id!=='entry-form')return;
  event.preventDefault();if(busy)return;
  const code=inviteCode,nickname=$('#entry-name').value;
  inviteCode=code;entryName=nickname;busy=true;notice='';render(false);
  try {const result=await activityApi('join',{code,nickname});adoptPlayer(result.player);history.replaceState(null,'',location.pathname);}
  catch(error){notice=error.message;}
  busy=false;render();
});
panel.addEventListener('click',async event=>{
  const button=event.target.closest('button');
  if(!button||button.disabled)return;
  if(button.dataset.part && screen==='pick') {
    selection={...selection,[tab]:button.dataset.part};state=createGame(selection);render();return;
  }
  if(button.dataset.tab && screen==='pick') {tab=button.dataset.tab;render(false);return;}
  try {switch(button.dataset.action){
    case 'join': generation++;notice='';screen='join';render();break;
    case 'practice': await leaveOfficial('home');break;
    case 'switch-player': await leaveOfficial('join');break;
    case 'pick': resetGame();screen='pick';tab='blade';render();break;
    case 'next': tab=order[order.indexOf(tab)+1];render(false);break;
    case 'back': if(tab==='blade'){if(officialPlayer)await leaveOfficial('join');else{screen='home';render();}}else{tab=order[order.indexOf(tab)-1];render(false);}break;
    case 'forge': await startForge();break;
    case 'hit': hit();break;
    case 'again': resetGame();screen='pick';tab='blade';render();break;
    case 'home': resetGame();screen='home';render();break;
    case 'refresh-rank': {const result=await activityApi('me');if(!result.player){officialPlayer=null;screen='join';notice='请重新进入正式场；换设备恢复原成绩时，请联系组织者。';render();break;}adoptPlayer(result.player);notice='已更新服务器保存的成绩与当前名次。';render();break;}
  }}catch(error){notice=error.message;render(false);}
});
window.addEventListener('pagehide',event=>{if(!event.persisted)scene.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)scene.visibilityHandler();});
if(inviteCode)screen='join';
render();
async function initializeActivity(){
  const initialGeneration=generation,initialScreen=screen;
  try {
    ({activity}=await activityApi('activity'));
    if(generation!==initialGeneration||screen!==initialScreen)return;
    if(inviteCode){screen='join';render();return;}
    try {const result=await activityApi('me');if(generation!==initialGeneration||screen!==initialScreen)return;if(result.player)adoptPlayer(result.player);}
    catch(error){if(error.status!==401)throw error;}
    render();
  } catch(error){
    if(inviteCode){screen='join';notice=error.message;render();}
  }
}
initializeActivity();
