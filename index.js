import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer';

async function loadCookies(cookiePath) {
    if (!fs.existsSync(cookiePath)) {
        return [];
    }

    try {
        const moduleUrl = `${pathToFileURL(cookiePath).href}?t=${Date.now()}`;
        const cookieModule = await import(moduleUrl);
        if (Array.isArray(cookieModule.default)) {
            return cookieModule.default;
        }
    } catch {
    }

    const raw = (await fsp.readFile(cookiePath, 'utf8')).trim();
    if (!raw) return [];

    try {
        return JSON.parse(raw);
    } catch {
        return Function(`"use strict"; return (${raw});`)();
    }
}

function resolveChromeExecutablePath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    // Puppeteer 官方推荐路径解析（优先使用与当前版本匹配的浏览器）
    try {
        const p = puppeteer.executablePath();
        if (p && fs.existsSync(p)) {
            return p;
        }
    } catch {
    }

    const candidates = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/opt/google/chrome/chrome'
    ];

    return candidates.find((p) => fs.existsSync(p));
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

        const chromePath = resolveChromeExecutablePath();
        if (chromePath) {
            launchOptions.executablePath = chromePath;
            console.log(`   --> 使用浏览器可执行文件: ${chromePath}`);
        } else {
            console.warn('   --> 未检测到可执行浏览器，Puppeteer 将尝试默认方式启动。');
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
