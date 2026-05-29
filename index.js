import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer';

async function loadCookies(cookiePath) {
    if (!fs.existsSync(cookiePath)) {
        return [];
    }

    // 优先按 ESM 模块读取：支持 export default []
    try {
        const moduleUrl = `${pathToFileURL(cookiePath).href}?t=${Date.now()}`;
        const cookieModule = await import(moduleUrl);
        if (Array.isArray(cookieModule.default)) {
            return cookieModule.default;
        }
    } catch {
        // 忽略并回退到文本解析
    }

    // 兼容旧格式：cookie.js 直接写数组字面量
    const raw = (await fsp.readFile(cookiePath, 'utf8')).trim();
    if (!raw) return [];

    try {
        return JSON.parse(raw);
    } catch {
        // 本地受信任文件，回退为表达式求值（允许尾逗号等非严格 JSON）
        return Function(`"use strict"; return (${raw});`)();
    }
}

export async function run(taskPath, config) {
    console.log(`\n   --> 开始执行 [${config.name}] 任务...`);
    console.log(`   --> 请求目标: ${config.url}`);
    console.log(`   --> 请求方法: ${config.method.toUpperCase()}`);

    const cookiePath = path.join(taskPath, 'cookie.js');
    const cookies = await loadCookies(cookiePath);

    if (cookies.length > 0) {
        console.log(`   --> 找到 cookie.js，共读取到 ${cookies.length} 条 Cookie。`);
    } else {
        console.log('   --> 未找到有效 Cookie，将以无登录状态发起请求。');
    }

    let browser;
    try {
        const launchOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        };

        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        await page.setViewport({ width: 1080, height: 1024 });

        if (cookies.length > 0) {
            await page.setCookie(...cookies);
            console.log('   --> 成功注入 Cookie 登录状态。');
        }

        const method = config.method.toUpperCase();

        if (method === 'GET') {
            await page.goto(config.url, { waitUntil: 'networkidle2' });

            const screenshotPath = path.join(taskPath, 'result.png');
            await page.screenshot({ path: screenshotPath });
            console.log(`   --> GET 请求完成！页面截图已保存至: ${screenshotPath}`);
        } else if (method === 'POST') {
            const urlObj = new URL(config.url);
            await page.goto(urlObj.origin, { waitUntil: 'domcontentloaded' });

            const responseData = await page.evaluate(async (targetUrl) => {
                const response = await fetch(targetUrl, { method: 'POST' });
                return await response.text();
            }, config.url);

            console.log('   --> POST 请求发送完毕！返回数据片段：\n', responseData.substring(0, 200));
        } else {
            throw new Error(`不支持的请求方法: ${method}`);
        }
    } catch (error) {
        console.error('   --> [错误] 任务执行时出错:', error);
    } finally {
        if (browser) await browser.close();
    }
}
