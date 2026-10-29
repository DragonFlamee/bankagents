# 预约实际日累计验证修复 · 2026-10-29

修复前快照：`89c39bc`，只提交本地，未推送。该快照包含用户手调后的19页PPT。账户、金额与验证码均为模拟；本轮不调用模型服务。

## 复现与修复

原路径先确认次日1000元预约，次日普通转账300元后，`run_due`仍直接扣预约款。修复前新增测试以`done != awaiting_verification`失败，确认能够复现缺口。

当前`_run_schedule`在`BEGIN IMMEDIATE`中复核实际执行日（UTC+8）的已提交总额、余额和安全锁定。超过1000元时不扣款，创建一笔与预约及本期日期唯一关联的红色`transfer`操作，进入审批中心。其OTP绑定该操作与参数指纹，提交时再次走普通转账的累计检查。

示例当前行为：普通300元已经提交；1000元预约到期后停在待验证，可用余额只受已提交300元影响。独立验证完成后预约扣1000元，总累计恰为1300元，不重复统计或付款。不能沿用创建预约时的验证码。

## 状态与兼容

- `bank_schedule_runs`新增可空`operation_id`，已有数据库启动时自动迁移。旧的直接执行记录保留；新的待验证付款通过该字段关联。
- 到期超限后持久化唯一执行记录，重复调度和服务重启复用原操作，不生成第二笔付款。`unknown`先对账；取消和授权过期都不付款。
- 验证、取消、失败和对账在银行事务中同步预约状态；月度预约仅在本期成功后推进日期，每期重新计算风险和验证。
- 高风险预约付款作为普通转账回执计入累计，关联预约记录不重复求和；旧记录仍按原预约执行日记账时间计算。
- `/api/overview`新增`scheduled_operations`。只有具备银行持久化预约链接且归属当前用户的操作可不依赖Agent计划授权，响应`plan`可以为`null`；未关联操作和其他用户仍拒绝。
- 网页的总览、审批中心与资金日程显示此类待办，复用验证码面板。演示“现在执行”同样遵守实际日限额，不能跳过强验证。

## 验证

| 检查 | 结果与证据 |
| --- | --- |
| 项目回归 | [201项通过](../evals/results/pytest-schedule-fix-20261029.xml)，命令`python -m pytest tests -q`；1条既有HTTPX兼容弃用提醒 |
| 专项回归 | [18项用例](../tests/test_scheduled_authorization.py)：原案例、1000元边界、同日多预约、月度每期、重复调度、重启、过期、余额不足、取消、故障、对账、用户隔离、UTC+8跨日及旧库迁移 |
| 网页构建 | `npm run typecheck`与`npm run build:web`通过；保留既有大包体积提醒 |
| 实际浏览器 | [4项检查](../evals/results/schedule-ui-20261029.json)：待验证零扣款、OTP一次付款、演示不能绕过及取消、390px无整页溢出；零页面脚本错误 |
| 页面证据 | [待验证](../artifacts/screenshots/schedule-fix-20261029/01-pending-planner.png)、[审批](../artifacts/screenshots/schedule-fix-20261029/02-approval.png)、[完成](../artifacts/screenshots/schedule-fix-20261029/03-completed-approvals.png)、[手机](../artifacts/screenshots/schedule-fix-20261029/04-mobile-planner.png) |

第三方下载的`skill-review/`测试不是本项目测试，未计入201项。旧183项和30组页面检查保留其原版本范围，本轮没有重做全部场景的真实模型验收。

## PPT更新

当前 [19页PPT](../demo/tracebank-technical-defense-20261029.pptx)与原生成脚本不完全相同。以`89c39bc`中的手调PPT为依据，使用已安装presentation-skill的检查、解包、清理与封包工具，仅修改5个XML部件：删除第15页问题框的背景、标题和正文；更新第15/19页相关表格，以及第9/15/16页备注。其余包部件逐字节一致，用户的其他手调内容保留。

修改脚本、部件哈希与补充预览在[制作目录](../demo/defense-20261029/README.md)。原生PowerPoint兼容性未做自动验收，补充渲染不替代真实Office打开检查。原型同应用OTP、未知注入、多worker和真实银行接入等边界继续保留在[安全自评](security-self-assessment.md)。
