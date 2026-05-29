# LarkCron
灵雀（Lark）在传统文化中是报时的飞鸟，且身手敏捷。这个名字寓意你的 Docker 容器就像一只训练有素的灵雀，每天准时飞往指定的网页帮你衔取信息、执行任务。

## 🚀 代码设计逻辑与架构

本项目采用 **“纯配置数据驱动”** 的无代码架构设计。核心调度器会自动扫描 `task` 目录下的所有子目录，根据里面的 `config.json` 和 `cookie.js` 自动排期并执行，全程无需编写业务逻辑代码。

### 目录结构

```text
/LarkCron
├── scheduler.js            # 核心调度器：负责遍历 task 目录、解析配置并注册 cron
├── index.js                # 公共执行器：通用无头浏览器逻辑入口
├── package.json            # 项目依赖
└── task/                   # 🌟 存放所有独立任务的目录（可随时动态增删）
    ├── baidu_com/          # 任务1：例如百度访问任务
    │   ├── config.json     # 任务配置文件（定义目标URL、请求方法、cron 等）
    │   └── cookie.js       # [可选] 对应的登录 Cookie 数据
    └── coze_cn/            # 任务2：其他定时任务...
```

### 核心逻辑解析

1. **动态加载**: `scheduler.js` 启动时，会扫描 `tasks` 文件夹，读取每个子目录下的 `config.json`。
2. **安全校验**: 调度器会自动校验必填字段，并使用 `cron.validate()` 验证表达式合法性，防止某个插件的拼写错误导致整个主程序崩溃。
3. **独立隔离**: 利用 `node-cron` 注册任务。定时触发时，动态 `require` 对应的脚本并执行其导出的 `run()` 方法。通过内部的 `try...catch` 保证各个任务之间的异常相互隔离，互不干扰。
4. **软开关**: 支持通过 `config.json` 中的 `"enabled": false` 随时禁用某个任务，极大方便了日常任务的管理与调试。

## 🛠️ 程序使用过程指南

只需简单几步，即可轻松添加和管理一个新的定时任务：

### 第一步：创建任务目录与配置文件

在 `tasks/` 目录下新建一个专属文件夹（例如 `my-task`），并在其中创建 `config.json` 文件：

```json
{
  "name": "我的测试任务",
  "cron": "0 8 * * *",
  "script": "index.js",
  "enabled": true
}
```
- `name`: 任务的易读名称（用于日志输出）。
- `cron`: 标准的 Cron 表达式（如 `0 8 * * *` 表示每天早上 8:00 执行）。
- `script`: 任务入口脚本的文件名。
- `enabled`: 是否启用此任务（`true` 为启用，`false` 为挂起禁用）。

### 第二步：编写任务业务代码

在同一目录下创建 `index.js`（须与配置中的 `script` 字段对应），并严格暴露 `run` 异步方法：

```javascript
// 暴露一个 run 异步函数供核心调度器调用
module.exports.run = async () => {
    console.log("正在执行 [我的测试任务] 的业务逻辑...");
    // 在这里编写你的代码：例如启动 Puppeteer 签到、发起 HTTP 请求、操作文件等
    await new Promise(resolve => setTimeout(resolve, 1000)); 
    console.log("业务逻辑处理完毕！");
};
```

### 第三步：启动调度器

配置完成后，让程序跑起来：

**本地直接运行：**
```bash
npm install
node scheduler.js
```
*(如果使用 Docker 部署，建议在 `docker-compose.yml` 中将本地的 `tasks` 目录挂载到容器内，这样每次添加新脚本时只需要修改物理机的文件，无需重新打包镜像。)*
