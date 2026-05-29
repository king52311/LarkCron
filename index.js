const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

module.exports.run = async (taskPath, config) => {
    console.log(`\n   --> 开始执行 [${config.name}] 任务...`);
    console.log(`   --> 请求目标: ${config.url}`);
    console.log(`   --> 请求方法: ${config.method.toUpperCase()}`);
    
    // 动态检查当前触发的任务目录下是否存在 cookie.js
    const cookiePath = path.join(taskPath, 'cookie.js');
    let cookies = [];
    if (fs.existsSync(cookiePath)) {
        // 每次执行前清除 require 缓存，确保你在不重启容器时替换了 cookie 也能生效
        delete require.cache[require.resolve(cookiePath)];
        cookies = require(cookiePath);
        console.log(`   --> 找到 cookie.js，共读取到 ${cookies.length} 条 Cookie。`);
    } else {
        console.log(`   --> 未找到 cookie.js，将以无登录状态发起请求。`);
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // 1. 注入登录 Cookie
        if (cookies && cookies.length > 0) {
            await page.setCookie(...cookies);
            console.log("   --> 成功注入 Cookie 登录状态。");
        }
        
        const method = config.method.toUpperCase();
        
        // 2. 根据 config.json 配置的方法执行不同操作
        if (method === 'GET') {
            // GET 请求：直接打开页面
            await page.goto(config.url, { waitUntil: 'networkidle2' });
            
            const screenshotPath = path.join(taskPath, 'result.png'); // 截图保存到当前任务目录
            await page.screenshot({ path: screenshotPath });
            console.log(`   --> GET 请求完成！页面截图已保存至: ${screenshotPath}`);
            
        } else if (method === 'POST') {
            // POST 请求：解决 Puppeteer 原生无法直接 POST 导航的问题
            // 先访问同源域名的根目录，确保 Cookie 上下文被浏览器正确识别生效
            const urlObj = new URL(config.url);
            await page.goto(urlObj.origin); 
            
            // 然后在真实的浏览器环境中，利用 fetch 发送 POST 请求（会自动携带刚才的 Cookie）
            const responseData = await page.evaluate(async (targetUrl) => {
                const response = await fetch(targetUrl, { method: 'POST' });
                return await response.text();
            }, config.url);
            
            console.log("   --> POST 请求发送完毕！返回数据片段：\n", responseData.substring(0, 200));
        }
        
    } catch (error) {
        console.error("   --> [错误] 任务执行时出错:", error);
    } finally {
        if (browser) await browser.close();
    }
};