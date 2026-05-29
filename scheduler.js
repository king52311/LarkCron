import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';
import { fileURLToPath } from 'url';

import { run } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TASKS_DIR = path.join(__dirname, 'task');

async function loadAndScheduleTasks() {
    try {
        await fs.access(TASKS_DIR);

        const entries = await fs.readdir(TASKS_DIR, { withFileTypes: true });
        let loadedCount = 0;

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const taskPath = path.join(TASKS_DIR, entry.name);
                const configPath = path.join(taskPath, 'config.json');

                try {
                    const configData = await fs.readFile(configPath, 'utf8');
                    const config = JSON.parse(configData);

                    if (config.enabled !== false) {
                        scheduleTask(taskPath, config, entry.name);
                        loadedCount++;
                    } else {
                        console.log(`[跳过任务] ${config.name || entry.name}: 状态为禁用 (enabled: false)`);
                    }
                } catch {
                    console.warn(`[警告] 目录 ${entry.name} 被跳过: 未找到 config.json 或格式错误`);
                }
            }
        }

        console.log(`\n🎉 所有任务加载完毕！共启动了 ${loadedCount} 个定时任务，正在后台静默运行...\n`);
        if (loadedCount === 0) {
            console.warn('[提示] 当前没有任何启用任务，进程将保持存活以等待后续挂载配置变更。');
            setInterval(() => {}, 60 * 1000);
        }
    } catch (error) {
        console.error('加载 task 目录失败，请确保目录存在:', error.message);
    }
}

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
            await run(taskPath, config);
            console.log(`[任务完成] ${taskName} 执行成功!`);
        } catch (error) {
            console.error(`[任务失败] ${taskName} 执行抛出异常:`, error);
        }
    });
}

loadAndScheduleTasks();
