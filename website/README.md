# Videobox 官网部署指南

## 架构

```
用户域名 (videobox.app)
    │
    ▼
Cloudflare Worker (videobox-api)
    ├─ /          → 官网 HTML（从 KV 读取）
    ├─ /api/activate
    ├─ /api/verify
    ├─ /api/devices
    └─ /api/health
```

一个 Worker 搞定官网 + API，无需额外服务器。

## 前置条件

1. 安装 [Node.js](https://nodejs.org)
2. 安装 Wrangler CLI：`npm install -g wrangler`
3. 登录 Cloudflare：`wrangler login`
4. 拥有一个域名（托管在 Cloudflare DNS）

## 一键部署

```bash
cd website
chmod +x deploy.sh
./deploy.sh
```

## 手动部署步骤

### 1. 创建 KV 命名空间

```bash
wrangler kv:namespace create VIDEOBOX_SITE_HTML
```

记下输出的 `id`，填入 `worker/wrangler.toml`：

```toml
kv_namespaces = [
  { binding = "VIDEOBOX_ACTIVATIONS", id = "已有的ID" },
  { binding = "VIDEOBOX_SITE_HTML", id = "新创建的ID" }
]
```

### 2. 上传官网 HTML

```bash
cd website
wrangler kv:key put --binding=VIDEOBOX_SITE_HTML "site-html" --path=index.html
```

### 3. 部署 Worker

```bash
cd worker
wrangler deploy
```

### 4. 绑定域名

1. 打开 Cloudflare Dashboard → Workers & Pages → videobox-api
2. 点击 Triggers → Custom Domains → Add Custom Domain
3. 输入你的域名（如 `videobox.app`）
4. Cloudflare 自动配置 DNS

### 5. 更新应用内激活服务器地址

如果使用 Pro/Premium 激活功能，需要修改 `electron/license/LicenseManager.ts`：

```typescript
static ACTIVATION_SERVER = 'https://你的域名/api'
```

或在应用启动时动态设置：

```typescript
LicenseManager.setActivationServer('https://你的域名/api')
```

## 本地预览

```bash
cd website
npx serve .        # 静态网站预览
# 或
cd activation-page
node server.js     # 完整 Express 版（含 API）
```
