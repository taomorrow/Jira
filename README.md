# Jira Monitor

面向 Jira Server / Data Center 的油猴脚本：扫描工单、计算 DEV/DCT 时长、导出 Excel，并可通过用户自己的 Teams Workflow Webhook 发送通知。

需要已登录且有权查看相应工单。未在其他 Jira 实例或 Jira Cloud 验证。

| 脚本 | 使用场景 | 安装 | 文档 |
|---|---|---|---|
| jiraMonitorOverview | 从总览逐条扫描、翻页、暂停/继续 | [安装总览版](https://raw.githubusercontent.com/taomorrow/Jira/main/jiraMonitorOverview.user.js) | [总览版说明](jiraMonitorOverview.md) |
| jiraMonitorDetail | 打开详情后自动分析当前工单 | [安装详情版](https://raw.githubusercontent.com/taomorrow/Jira/main/jiraMonitorDetail.user.js) | [详情版说明](jiraMonitorDetail.md) |

**首次使用请先阅读：[油猴与脚本安装指南](INSTALL.md)**（含 Chrome / Edge 权限设置、手动安装、Teams 配置及常见问题）。

先安装 Tampermonkey，再点击安装链接。若未弹出安装页，将脚本完整代码粘贴到油猴的新建脚本中保存。两个脚本择一启用，避免面板重叠及重复通知。

公开版不包含 Webhook 密钥，自动通知默认关闭。需要通知时，在 Jira 页面打开油猴菜单，选择 **Teams：配置 Webhook / 自动通知**。每个脚本分别保存配置。

DEV 常规阈值为 4/5 天，DCT 为 13/14 天；北京时间周五上下限均提前 2 天。完整口径、状态范围、去重限制和通知设置请查看各脚本文档。

本项目无第三方运行时依赖，不要求提供 Jira 密码或 API token；使用当前登录会话读取 Jira。只有启用 Teams 通知后才会把通知数据发送到用户配置的工作流地址。公开版本通过本地模拟验证；内部页面和租户行为仍需使用者验证。
