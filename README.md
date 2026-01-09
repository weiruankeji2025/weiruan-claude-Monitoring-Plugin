# 威软Claude用量检测 🔍

<p align="center">
  <img src="https://img.shields.io/badge/版本-1.0.0-blue.svg" alt="版本">
  <img src="https://img.shields.io/badge/许可证-MIT-green.svg" alt="许可证">
  <img src="https://img.shields.io/badge/平台-Tampermonkey-orange.svg" alt="平台">
</p>

> 一款功能强大的 Claude AI 用量检测油猴脚本，实时监控使用量、显示恢复时间、提供使用统计等功能。

**署名：威软科技 (WeiRuan Tech)**

---

## ✨ 功能特性

### 核心功能
- **实时用量检测** - 自动检测 Claude 使用限制状态
- **恢复时间预估** - 显示预计恢复用量的倒计时
- **消息统计** - 记录会话和每日消息发送数量
- **限制次数统计** - 追踪每日触发限制的次数

### 扩展功能
- **可拖拽面板** - 支持自由拖动到任意位置
- **折叠/展开** - 一键折叠面板，不影响正常使用
- **数据导出** - 导出统计数据为 JSON 文件
- **深色模式** - 自动适配系统深色模式
- **桌面通知** - 限制触发和恢复时发送通知提醒
- **本地存储** - 数据持久化保存，刷新不丢失

---

## 📦 安装方法

### 前置要求
请先安装以下任一浏览器扩展：
- [Tampermonkey](https://www.tampermonkey.net/) (推荐)
- [Violentmonkey](https://violentmonkey.github.io/)
- [Greasemonkey](https://www.greasespot.net/) (仅 Firefox)

### 安装步骤

1. **安装油猴扩展**（如已安装可跳过）
2. **点击下方链接安装脚本**
   - [直接安装](./weiruan-claude-usage-detector.user.js)
3. **或手动安装**
   - 打开油猴扩展管理面板
   - 点击「新建脚本」
   - 复制 `weiruan-claude-usage-detector.user.js` 内容并粘贴
   - 保存并启用

---

## 🖥️ 使用说明

### 面板说明
安装后访问 [claude.ai](https://claude.ai)，右上角将显示检测面板：

```
┌─────────────────────────────────────┐
│ 📊 威软Claude用量检测    🔄  −      │
├─────────────────────────────────────┤
│ 当前状态          [ 正常 / 已限制 ] │
├─────────────────────────────────────┤
│ [倒计时显示区域 - 限制时显示]       │
├─────────────────────────────────────┤
│  会话消息数    │    今日消息数      │
│     25        │       100          │
├─────────────────────────────────────┤
│  会话时长      │   今日限制次数     │
│   2小时30分   │        1           │
├─────────────────────────────────────┤
│   [ 导出统计 ]    [ 重置统计 ]      │
├─────────────────────────────────────┤
│   v1.0.0 | GitHub | 威软科技出品    │
└─────────────────────────────────────┘
```

### 功能按钮

| 按钮 | 功能 |
|------|------|
| 🔄 | 手动刷新状态 |
| − / + | 折叠/展开面板 |
| 导出统计 | 下载 JSON 格式统计数据 |
| 重置统计 | 清除当前会话统计数据 |

### 状态说明

| 状态 | 说明 |
|------|------|
| 🟢 正常 | 可正常使用 Claude |
| 🔴 已限制 | 已达到使用限制，需等待恢复 |

---

## 🔧 配置选项

可在脚本开头的 `CONFIG` 对象中自定义配置：

```javascript
const CONFIG = {
    // 检测间隔（毫秒）
    CHECK_INTERVAL: 5000,

    // 限制重置周期（小时）
    RESET_PERIOD_HOURS: 5,

    // 是否启用通知
    ENABLE_NOTIFICATIONS: true,

    // 调试模式
    DEBUG: false
};
```

---

## 🧪 测试

### 运行单元测试

```bash
node test/unit-test.js
```

### 测试结果

```
══════════════════════════════════════════════════
📊 威软Claude用量检测 - 测试报告
══════════════════════════════════════════════════
版本: 1.0.0
──────────────────────────────────────────────────
✅ 通过: 32
❌ 失败: 0
📋 总计: 32
──────────────────────────────────────────────────
🎉 所有测试通过！
```

### 浏览器测试

打开 `test/test-runner.html` 在浏览器中进行交互测试。

---

## 📊 导出数据格式

```json
{
  "exportTime": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "currentStatus": {
    "isLimited": false,
    "remainingTime": 0,
    "messageCount": 50,
    "todayMessages": 100,
    "todayLimits": 1
  },
  "dailyStats": {
    "Mon Jan 15 2024": {
      "messages": 100,
      "limits": 1
    }
  }
}
```

---

## 🔒 隐私说明

- 所有数据仅存储在本地浏览器中
- 不会向任何第三方服务器发送数据
- 不收集任何个人信息
- 完全开源，代码可审查

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📝 更新日志

### v1.0.0 (2024-01-15)
- 🎉 首次发布
- ✅ 实时用量检测
- ✅ 恢复时间倒计时
- ✅ 消息统计功能
- ✅ 数据导出功能
- ✅ 深色模式支持
- ✅ 可拖拽面板

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

---

## 👨‍💻 作者

**威软科技 (WeiRuan Tech)**

- GitHub: [@weiruankeji2025](https://github.com/weiruankeji2025)

---

<p align="center">
  Made with ❤️ by 威软科技
</p>
