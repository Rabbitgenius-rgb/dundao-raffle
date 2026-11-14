import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {hashPassword} from '../server/store.mjs';
const directory=fileURLToPath(new URL('../private/',import.meta.url));
mkdirSync(directory,{recursive:true,mode:0o700});
const destination=directory+'activity-credentials.json';
if(!existsSync(destination)){
  const password=randomBytes(18).toString('base64url');
  writeFileSync(destination,JSON.stringify({adminPassword:password,adminHash:hashPassword(password),origin:'http://127.0.0.1:8081'},null,2)+'\n',{flag:'wx',mode:0o600});
}
const credentials=JSON.parse(readFileSync(destination));
writeFileSync(directory+'活动管理访问说明.txt',`断刀 · 锻刀大会（200 人场）\n\n玩家入口：${credentials.origin}/\n活动管理：${credentials.origin}/admin\n公开排行榜：${credentials.origin}/leaderboard\n管理口令：${credentials.adminPassword}\n\n将玩家入口发给参与者，填写真实姓名即可参加，无须逐个分发参与码。\n参与者在同一设备刷新和再次进入会恢复原来的进度或成绩；换设备恢复时，请在管理页核对姓名，提供其专属恢复链接。\n参与者自填真实姓名，不做身份证核验。同名只以最早完成并保存的那次成绩计入排名；之后的同名成绩不会覆盖。\n管理页可导出最终成绩 CSV（可用 Excel 打开）；备用参与码和恢复链接也可单独下载。\n完整姓名仅在管理后台展示；公开排行榜显示脱敏姓名、分数、品质与路线，每 10 秒更新。成绩导出仍按姓名去重，同分并列。请保管管理口令和恢复链接，不要公开分享。\n` ,{mode:0o600});
console.log('活动管理凭据已准备于 private/；没有向终端输出口令。');
