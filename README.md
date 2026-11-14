# 断刀 · 十二系锻造工坊

一款奇幻像素 / 体素风格的 3D 锻造小游戏。挑选刀身、刀柄和护手，经过 15 次锤击，让刀进化为十二种不同路线。支持自由试玩、正式活动、排行榜与组织者后台。

本项目在 [jerry-big/dundao-raffle](https://github.com/jerry-big/dundao-raffle) 的原版基础上开发。原项目与本项目均保留 MIT 许可证；Three.js 的许可见 `web/vendor/THREE-LICENSE.txt`。

## 本地启动

需要 Node.js 24，项目不需要安装第三方依赖。

```bash
node tools/prepare-activity.mjs
node tools/run-activity-local.mjs
```

访问 <http://127.0.0.1:8081/>，排行榜在 `/leaderboard`，管理页在 `/admin`。首次准备时会在本项目的 `private/` 中生成新的本地管理口令和空白数据库；数据库与已有线上活动相互独立。管理口令请在本机的 `private/活动管理访问说明.txt` 查看，不要提交或分享该目录。

仅体验自由试玩和十二系图鉴，也可以使用静态服务器：

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

访问 <http://127.0.0.1:8000/web/>。正式活动、排行榜和管理功能需要上面的 Node.js 服务。页面使用 WebGL 2，需通过 HTTP 打开。

## 玩法与活动

- 十二条等概率的锻造路线，每局 15 次锤击；成长、觉醒、损坏和修复都会影响分数或造型。
- 正式场由服务器保存每次锤击与最终结果；同名参与者以最早完成的一次成绩排名。姓名由参与者自行填写，未做身份核验。
- 排行榜显示脱敏姓名；完整姓名和 CSV 仅在管理页查看。自由试玩不进入排名。项目不包含实物发奖功能。
- 管理凭据、参与者记录和数据库不包含在仓库中。

## 检查

```bash
node --test tests/*.test.mjs
```

`web/` 是游戏和管理界面，`server/` 是活动接口和 SQLite 存储，`tests/` 是游戏规则与活动流程的检查，`verification/route-gallery.html` 提供十二系形态预览。正式部署时应自行配置独立域名、HTTPS、持久化存储和新的管理凭据。

## 许可

代码采用 [MIT License](LICENSE)，第三方 Three.js 按其附带的许可使用。
