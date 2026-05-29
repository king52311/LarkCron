const fs = require('fs/promises');
const path = require('path');
const cron = require('node-cron');

// 引入根目录下的公共执行器统一入口
const executor = require('./index.js');

// 定义任务存放的根目录
const TASKS_DIR = path.join(__dirname, 'task');

/**
 * 遍历目录并加载所有任务
 */
async function loadAndScheduleTasks() {
    try {
        // 检查 task 目录是否存在
        await fs.access(TASKS_DIR);
        
        // 读取 task 目录下的所有子项
        const entries = await fs.readdir(TASKS_DIR, { withFileTypes: true });
        let loadedCount = 0;

        for (const entry of entries) {
            // 仅处理目录
            if (entry.isDirectory()) {
                const taskPath = path.join(TASKS_DIR, entry.name);
                const configPath = path.join(taskPath, 'config.json');

                try {
                    // 尝试读取 config.json
                    const configData = await fs.readFile(configPath, 'utf8');
                    const config = JSON.parse(configData);

                    // 如果配置中启用了该任务（默认启用）
                    if (config.enabled !== false) {
                        scheduleTask(taskPath, config, entry.name);
                        loadedCount++;
                    } else {
                        console.log(`[跳过任务] ${config.name || entry.name}: 状态为禁用 (enabled: false)`);
                    }
                } catch (err) {
                    console.warn(`[警告] 目录 ${entry.name} 被跳过: 未找到 config.json 或格式错误`);
                }
            }
        }
        console.log(`\n🎉 所有任务加载完毕！共启动了 ${loadedCount} 个定时任务，正在后台静默运行...\n`);
    } catch (error) {
        console.error('加载 task 目录失败，请确保目录存在:', error.message);
    }
}

/**
 * 将任务加入 node-cron 调度计划
 */
function scheduleTask(taskPath, config, dirName) {
    const taskName = config.name || dirName;
    
    if (!config.cron || !config.url || !config.method) {
        console.error(`[配置错误] ${taskName}: 缺少必填字段 'cron', 'url', 或 'method'`);
        return;
    }

    if (!cron.validate(config.cron)) {
        console.error(`[配置错误] ${taskName}: Cron 表达式 '${config.cron}' 不合法`);
        return;
    }

    console.log(`[成功加载] 任务: "${taskName}" -> 调度计划: [${config.cron}]`);

    cron.schedule(config.cron, async () => {
        console.log(`\n[${new Date().toLocaleString()}] 🚀 开始执行任务: ${taskName}`);
        try {
            // 调用公共执行器，传入当前任务所在的路径和配置内容
            await executor.run(taskPath, config); 
            console.log(`[任务完成] ${taskName} 执行成功!`);
        } catch (error) {
            console.error(`[任务失败] ${taskName} 执行抛出异常:`, error);
        }
    });
}

// 启动调度器
loadAndScheduleTasks();