#!/bin/bash
# ================================================================
# Videobox 官网一键部署脚本
# 适用平台：Cloudflare Workers + KV
# ================================================================
# 前置条件：
#   1. 安装 Node.js + npm
#   2. npm install -g wrangler
#   3. wrangler login
#   4. 拥有一个域名（在 Cloudflare 管理）
# ================================================================

set -e

echo "=== Videobox 官网部署 ==="

# Step 1: 上传网站 HTML 到 KV
echo ""
echo "[1/3] 创建 KV namespace（如果不存在）..."
KV_ID=$(wrangler kv:namespace create VIDEOBOX_SITE_HTML --preview=false 2>/dev/null | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

if [ -z "$KV_ID" ]; then
  echo "   ⚠ 无法创建 KV namespace，尝试列出现有..."
  wrangler kv:namespace list
  echo "   请手动将上面的 ID 填入 ../worker/wrangler.toml 中 VIDEOBOX_SITE_HTML 的 id 字段"
  echo "   然后重新运行此脚本"
  exit 1
fi

echo "   KV Namespace ID: $KV_ID"

# 更新 wrangler.toml
sed -i '' "s/{ binding = \"VIDEOBOX_SITE_HTML\", id = \"\" }/{ binding = \"VIDEOBOX_SITE_HTML\", id = \"$KV_ID\" }/" ../worker/wrangler.toml

# Step 2: 上传 HTML 到 KV
echo ""
echo "[2/3] 上传官网 HTML 到 KV..."
wrangler kv:key put --binding=VIDEOBOX_SITE_HTML "site-html" --path=index.html

# Step 3: 部署 Worker
echo ""
echo "[3/3] 部署 Worker..."
cd ../worker
wrangler deploy

echo ""
echo "=== 部署完成！==="
echo ""
echo "下一步："
echo "  1. 打开 Cloudflare Dashboard → Workers & Pages → videobox-api"
echo "  2. 点击「Add Custom Domain」绑定你的域名"
echo "  3. 等待 DNS 生效（通常几分钟）"
echo ""
echo "你的官网就上线了！🎉"
