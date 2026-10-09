# 决策记录（旧线 Demo 仓库）

> 本表只记录与本仓库（旧线分路）相关的决策。团队主线《言咒》决策见 `dsaj4/game_design`。

| 日期 | 决策 | 来源 | 结果 | 理由 |
| --- | --- | --- | --- | --- |
| 2026-05-13 | 建立创意整理工作流；卡牌战斗细化 v2 写入核心 | 上游归档快照 | Accepted（历史） | 见 `core-concept.md` |
| 2026-07-01 | 整体系统优先，战斗为关键解决层 | 上游归档 | Accepted（历史） | 共享世界动机；Demo 可后置多人 |
| 2026-08-22 | 字素合成取代成语组合为战斗主线 | GDD-BATTLE-002 | Hypothesis | 成语实现线 Parked |
| 2026-08-24 | Godot 灰盒客户端合同 | GDD-CLIENT-001 | Hypothesis | 与构思库分离实现 |
| 2026-09-04 | 首测 10 组怪物遭遇 | GDD-ENEMY-001 | Hypothesis | 不入库完整卡表 docx |
| 2026-09-09 | 卡牌设计表 v0.2（咏唱制原文） | 用户提交 | 内容冻结为表 | **不改用户原文**；作 Demo 卡源 |
| 2026-09-15 | 旧线与言咒分路；设计文档迁入本仓库 | 用户指令 | Accepted（本仓） | 主体开发言咒；本仓推进旧线 Demo；不混入 game-002 |
| 2026-09-18 | HTML demo 为权威可玩床；Godot 灰盒暂停扩玩法 | 用户 / 控制中心 | Accepted（本仓 Demo） | 卡表咏唱制优先；迭代落 `html-demo/` |
| 2026-09-22 | 局内 tokens=0；staging；撤离入 vault；败北不退仓 | 用户经济需求 | Evaluation→实装 | 覆盖旧「起始 20」；见 GDD-META-001 |
| 2026-09-22 | 战斗合成分解 / 地图永久合成 | 用户经济需求 | Evaluation→实装 | 防止永久牌组被战场合成污染 |
| 2026-09-22 | 抗性仅敌方施加；自燃不吃抗性 | A/B 协商拍板 | Accepted（Demo） | agent-coord 纪要 |
| 2026-10-09 | 自由市场：分区、挂牌、5% 费、周一 +3、价格柱 | 用户需求 | Evaluation→实装 | `market.js`；GDD-META-001 |
| 2026-10-09 | 数据调试台可输入改数 | 用户需求 | Evaluation→实装 | `debug.html`；覆盖键 `fb_html_demo_debug_v1` |
| 2026-10-09 | 仓库公开；欢迎 Fork+PR（非全网直写） | 用户指令 | Accepted（流程） | GitHub Public + Issues/Discussions |
| 2026-10-09 | 归档优化思路/流程/时间线 + GDD-META-001 | 用户「留档」 | Accepted（文档） | `docs/archive/2026-10-09-…` |
