# 选用 Puppeteer 官方基础镜像（与 package-lock.json 里的版本对应最佳）
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/ghcr.io/puppeteer/puppeteer:latest

# 切换到 root 用户以便执行系统级权限操作（安装依赖和调整目录权限）
USER root

# 设置工作目录
WORKDIR /app

# 仅先复制 package.json 和 package-lock.json 以利用 Docker 缓存层
COPY package*.json ./

# 安装项目依赖
RUN npm ci

# 复制项目源代码（受 .dockerignore 过滤）
COPY . .

# 切换回安全的非特权用户运行程序
USER pptruser

# 启动主程序
CMD ["node", "scheduler.js"]