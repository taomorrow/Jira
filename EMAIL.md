# 邮件通知配置

本指南适用于 Jira Monitor v5.4.0 或更高版本。邮件通过现有 Teams Webhook 所指向的 Power Automate 工作流发送，不需要把邮箱密码放进油猴脚本。

## 脚本设置

1. 油猴菜单 → Jira Monitor → 配置中心。
2. 在对应项目行填写多个邮箱：每行一个，或使用分号、逗号分隔。重复地址忽略大小写去重。邮箱留空则该项目不提交邮件。
3. 点击保存，看到“已保存并验证”。配置保存在当前脚本油猴存储中，升级保留；卸载或清除存储不保留。各项目独立保存。
4. 同一项目行必须配置 Webhook，每个项目的工作流都需要配置邮件步骤。当前【发送 Teams】按钮会同时向工作流提交 Teams 卡片和邮件内容；邮件设置不自动改变工作流中的 Teams 发送步骤。

保存本身不会发信。所有配置地址均作为 To 收件人发送，因此相互可见。每条工单一封邮件，自动扫描可能产生多封；沿用通知开关、筛选和24小时去重。更改收件人会被视为不同通知目标，使用独立冷却；手动通知不受冷却限制。邮件跟随该项目的批量自动通知开关。详情不自动发送。

## Power Automate 一次性设置

打开当前 Webhook 对应的工作流，在 Teams 原有逻辑外新增一个条件，避免放在附件 For each 中导致重复发信，也避免依赖 Teams 卡片动作成功：

```text
equals(triggerBody()?['email']?['enabled'], true)
```

条件为真时，新增 Office 365 Outlook → Send an email (V2) / 发送电子邮件(V2)，使用你的账号连接。字段填入表达式：

| 字段 | 表达式 |
|---|---|
| To / 收件人 | `triggerBody()?['email']?['to']` |
| Subject / 主题 | `triggerBody()?['email']?['subject']` |
| Body / 正文（HTML） | `triggerBody()?['email']?['bodyHtml']` |

编辑正文时将表达式作为整个 HTML 正文插入，避免在普通文本中直接显示 HTML 源码。多个收件人已由脚本转换为分号分隔。若触发器使用显式 JSON Schema 校验，请将 email 对象加入允许字段；不要只取 attachments，否则会丢失邮件字段。

[微软 Office 365 Outlook 连接器文档](https://learn.microsoft.com/en-us/connectors/office365/)

## 请求字段

```json
{
  "email": {
    "enabled": true,
    "recipients": ["first@example.com", "second@example.com"],
    "to": "first@example.com;second@example.com",
    "subject": "[Jira Monitor] TEST-1 · DEV 即将超期",
    "bodyText": "纯文本邮件内容",
    "bodyHtml": "<div>HTML邮件内容</div>"
  }
}
```

停用时仅提交 `email: {enabled: false}`，不提交收件人。标题、负责人等 Jira 内容经过 HTML 转义。邮件步骤配置后先手动通知一条，检查工作流运行记录和收件箱。Webhook 2xx 只表示请求已接收，不代表邮件成功送达。脚本测试验证了多收件人保存及请求字段，尚未在用户工作流中验证实际邮件投递。
