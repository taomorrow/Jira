# Jira Monitor

一个油猴脚本，同时支持 **Jira详情自动分析** 和 **总览手动批量扫描**。DEV/DCT规则、周五阈值、Excel和Teams通知共用一套逻辑与配置。

## 安装

1. [安装Tampermonkey和脚本的完整指南](INSTALL.md)。
2. [点击安装统一版 Jira Monitor](https://raw.githubusercontent.com/taomorrow/Jira/main/jiraMonitor.user.js)。
3. 打开 Jira：详情页自动分析；总览页点击“开始统计”。

**从旧版迁移：先停用 jiraMonitorOverview 和 jiraMonitorDetail，再安装统一版。** 旧版不会自动迁移为新脚本；Webhook、自动通知开关和冷却记录需要在统一版重新配置，旧扫描进度不迁移。

## 使用说明

查看 [Jira Monitor 详细文档](jiraMonitor.md)，包括：

- 总览自动翻页、暂停/继续，详情自动检测与重新分析。
- Dashboard（`/secure/Dashboard.jspa`）扫描已加载工单，不限 Issue Type。
- DEV正常阈值4/5天、DCT 13/14天，北京时间周五上下限提前2天。
- 彩色Excel导出、Jira超链接和负责人。
- 总览自动与手动通知均只发送即将超期/已超期；详情仅手动通知，保留全部有效结果。
- 自动24小时去重，详情和总览共用油猴设置及记录。

公开版不内置Webhook，自动通知默认关闭。通知需在油猴菜单 **Jira Monitor：配置中心** 中自行设置。

当前适配 `https://jira.xpaas.lenovo.com/*`，需要已登录且有工单权限。其他实例/Cloud尚未验证。脚本不要求提供Jira密码或token，使用当前登录会话；只有配置通知后才会向指定工作流发送工单数据。

本地验证方法及限制见 [使用说明](jiraMonitor.md#本地验证)。

邮件通知：配置中心的项目表可为各项目维护多个邮箱；需在 Webhook 工作流添加邮件步骤，详见 [邮件配置指南](EMAIL.md)。

分项目通知：工单 Key 横杠前的值为项目 Key，如 CSP-3909 → CSP。配置中心逐项目维护 Webhook、邮件收件人与批量自动开关；混合项目扫描分别发送，未配置项目不发送。详情、总览和 Dashboard 共用此规则。

统计规则可在【配置中心 → 统计规则设置】维护，包括阈值、状态范围、起始及排除状态；保存后用于新扫描，正常升级保留。
