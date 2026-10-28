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
- Dashboard（`/secure/Dashboard.jspa`）扫描已加载工单，不限 Issue Type；支持作为 Job 运行页面。
- 油猴菜单【Job 设置】：指定 JQL，按北京时间每天、工作日或固定间隔自动扫描（需保留已登录的总览标签页）。
- DEV正常阈值4/5天、DCT 13/14天，北京时间周五上下限提前2天。
- 彩色Excel导出、Jira超链接和负责人。
- 总览自动与手动通知均只发送即将超期/已超期；详情仅手动通知，保留全部有效结果。
- 自动24小时去重，详情和总览共用油猴设置及记录。

公开版不内置Webhook，自动通知默认关闭。通知需在油猴菜单 **Jira Monitor：Teams 设置** 中自行设置。

当前适配 `https://jira.xpaas.lenovo.com/*`，需要已登录且有工单权限。其他实例/Cloud尚未验证。脚本不要求提供Jira密码或token，使用当前登录会话；只有配置通知后才会向指定工作流发送工单数据。

本地验证方法及限制见 [使用说明](jiraMonitor.md#本地验证)。

邮件通知：油猴菜单【邮件设置】可维护多个邮箱；需在 Webhook 工作流添加邮件步骤，详见 [邮件配置指南](EMAIL.md)。
