# 安装指南：Tampermonkey 与 Jira Monitor

安装分两步：先安装浏览器扩展 Tampermonkey（油猴），再安装统一版 jiraMonitor 脚本。无需安装 Node.js 或下载整个仓库。

## 1. 安装 Tampermonkey

1. 使用电脑浏览器打开 [Tampermonkey 官网](https://www.tampermonkey.net/)。
2. 选择当前浏览器，通过官网提供的扩展商店链接安装 Tampermonkey。
3. 安装后，在浏览器工具栏的“扩展”菜单中找到 Tampermonkey，可将其固定到工具栏。
4. 确认扩展已启用。公司管理的浏览器如果禁止安装扩展，需要由管理员开放，无法通过脚本绕过。

以下以 Chrome / Edge 为主要说明；其他浏览器请按其扩展管理界面操作。

## 2. 允许用户脚本运行

### Chrome

1. 在地址栏输入 `chrome://extensions/`。
2. 找到 Tampermonkey，点击“详情”。
3. 如果有“允许用户脚本 / Allow User Scripts”，将其打开。
4. 若旧版浏览器没有该选项，按 Tampermonkey 的提示在扩展管理页面启用“开发者模式”。
5. 检查网站访问权限，确保扩展可以在你使用的 Jira 网站上运行，再刷新 Jira 页面。

### Edge

在地址栏输入 `edge://extensions/`，找到 Tampermonkey 的详情，检查相应用户脚本权限和网站访问权限；具体选项取决于浏览器版本。若扩展提示需要开发者模式或用户脚本权限，按该提示开启后刷新页面。

这些选项用于允许扩展执行用户脚本，不需要在 Jira 页面打开开发者工具。版本差异可参考 [Tampermonkey 官方说明](https://www.tampermonkey.net/faq.php#Q209) 和 [Chrome 用户脚本权限说明](https://developer.chrome.com/blog/chrome-userscript)。

## 3. 安装统一版脚本

[安装 jiraMonitor 统一版](https://raw.githubusercontent.com/taomorrow/Jira/main/jiraMonitor.user.js)

点击安装入口，出现 Tampermonkey 安装页后核对脚本名称与来源，点击“安装”。一份脚本同时适配总览与详情，不需要安装两版。已安装旧版的用户，请先停用 jiraMonitorOverview、jiraMonitorDetail 和其他旧脚本，避免重复分析和通知。

### 没有自动弹出安装页怎么办？

如果链接只显示代码或下载文件，使用手动安装：

1. 在浏览器点击 Tampermonkey 图标，选择“添加新脚本 / Create a new script”。
2. 删除编辑器中的默认示例代码。
3. 打开上面的安装入口，复制全部代码，包括开头的 `// ==UserScript==` 元数据。
4. 将完整代码粘贴到油猴编辑器。
5. 点击“文件 → 保存”，或按 Windows 的 `Ctrl+S` / macOS 的 `⌘S`。
6. 回到 Tampermonkey 管理面板，确认脚本开关为启用。

复制的是 Raw 原始代码，不要把 GitHub 网页的 HTML 内容粘贴到脚本编辑器。

## 4. 打开 Jira 验证

1. 先登录 Jira，确认你有权查看对应工单。
2. 当前脚本只匹配 `https://jira.xpaas.lenovo.com/*`。不同实例的域名和页面结构需另行调整；安装脚本不会自动获得内网或工单权限。
3. 总览页：打开 `/issues/` 工单列表，筛选后点击面板上的“开始统计”。
4. 详情页：打开 `/browse/工单编号`，刷新后会自动分析当前工单。

完整功能和规则：

- [jiraMonitor 统一版使用说明](jiraMonitor.md)

## 5. 可选：配置 Teams 通知

公开版未预置 Webhook，自动通知默认关闭。不配置 Teams 也能进行 Jira 分析和 Excel 导出。

1. 准备自己管理的 Teams / Power Automate Webhook，并在工作流中设置正确的接收聊天或频道。
2. 打开匹配的 Jira 页面，点击油猴图标。
3. 在所用脚本的菜单中选择 **Teams：配置 Webhook / 自动通知**。
4. 输入自己的工作流地址，按提示选择开启自动通知，或仅保留手动发送。
5. 刷新 Jira 页面。统一脚本的总览与详情共享设置；旧版设置不会自动迁移。

Webhook 是带签名的通知入口，不要上传到公开仓库或 Issue。接口接受请求不代表 Teams 已投递；未收到时请检查 Power Automate 运行记录。

## 常见问题

| 现象 | 检查方式 |
|---|---|
| 油猴已安装，但没有面板 | 确认脚本启用、网址匹配、已登录、用户脚本及网站权限开启，然后刷新 |
| 提示需要开发者模式或用户脚本权限 | 按第2步检查扩展详情；公司策略限制需要联系管理员 |
| 点击安装只显示代码 | 按第3步的手动安装方式操作 |
| 出现两个面板或重复通知 | 在油猴管理面板停用旧的两个版本及其他旧版脚本，只保留一份启用 |
| GitHub Raw 无法访问 | 检查网络是否可访问原始文件域名；若网页可访问，可从对应脚本文件复制完整源码手动安装 |
| Teams 收不到通知 | 检查菜单配置、自动触发条件、冷却记录及工作流运行结果 |

## 更新或卸载

脚本已配置 GitHub 更新地址，可在油猴管理面板使用“检查更新”。也可重新打开安装入口进行更新，确认是在更新现有脚本，避免重复安装。个人 Webhook 和自动开关保存在油猴存储中，正常代码更新不会覆盖。

停用：在油猴管理面板关闭对应脚本开关。卸载：在管理面板删除脚本；删除脚本可能同时清除本机设置和去重记录，重新安装后需要核对配置。
