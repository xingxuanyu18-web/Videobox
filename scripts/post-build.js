#!/usr/bin/env node
/**
 * post-build.js — 构建后自动归档 & 上传
 *
 * 用途：
 *   每次 npm run build 完成后自动执行，将安装包归档到 builds/ 并可选发布到 GitHub
 *
 * 用法：
 *   node scripts/post-build.js [--upload]
 *     --upload   归档后同时上传到 GitHub Releases（需要 GH_TOKEN 或 gh auth login）
 *
 * 归档目录结构：
 *   builds/
 *   ├── Videobox.Setup.1.3.2.exe          ← 最新安装包
 *   ├── Videobox.Setup.1.3.2.exe.blockmap  ← 增量更新块文件
 *   ├── Videobox.Setup.1.3.1.exe          ← 历史版本
 *   └── manifest.json                      ← 版本清单
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BUILDS_DIR = join(ROOT, 'builds')
const RELEASE_DIR = join(ROOT, 'release')

// 读取版本号
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version
const productName = pkg.build.productName
const installerName = `${productName}.Setup.${version}.exe`
const blockmapName = `${installerName}.blockmap`

const installerPath = join(RELEASE_DIR, installerName)
const blockmapPath = join(RELEASE_DIR, blockmapName)

// ==================== 归档到 builds/ ====================
function archive() {
  if (!existsSync(installerPath)) {
    console.error(`❌ 找不到安装包: ${installerPath}`)
    console.error('   请先运行 npm run build')
    process.exit(1)
  }

  if (!existsSync(BUILDS_DIR)) mkdirSync(BUILDS_DIR, { recursive: true })

  // 复制安装包
  const dest = join(BUILDS_DIR, installerName)
  copyFileSync(installerPath, dest)
  console.log(`📦 已归档: builds/${installerName}  (${(readFileSync(installerPath).length / 1024 / 1024).toFixed(1)} MB)`)

  // 复制 blockmap
  if (existsSync(blockmapPath)) {
    copyFileSync(blockmapPath, join(BUILDS_DIR, blockmapName))
    console.log(`📦 已归档: builds/${blockmapName}`)
  }

  // 更新 manifest
  const manifestPath = join(BUILDS_DIR, 'manifest.json')
  let manifest = { versions: [] }
  if (existsSync(manifestPath)) {
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) } catch {}
  }
  const existing = manifest.versions.find(v => v.version === version)
  const entry = {
    version,
    installer: installerName,
    size: readFileSync(installerPath).length,
    createdAt: new Date().toISOString(),
  }
  if (existing) {
    Object.assign(existing, entry)
  } else {
    manifest.versions.unshift(entry)
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  console.log(`📋 版本清单已更新: builds/manifest.json (${manifest.versions.length} 个版本)`)
}

// ==================== 上传到 GitHub ====================
function uploadToGitHub() {
  const tag = `v${version}`

  // 检查 gh 是否可用
  let ghAvailable = false
  try { execSync('gh --version', { stdio: 'pipe' }); ghAvailable = true } catch {}

  if (!ghAvailable) {
    console.error('❌ 未找到 GitHub CLI (gh)，请先安装: https://cli.github.com/')
    console.error('   或手动上传: builds/' + installerName)
    process.exit(1)
  }

  // 检查是否已登录
  try {
    execSync('gh auth status', { stdio: 'pipe' })
  } catch {
    console.error('❌ 未登录 GitHub CLI，请先运行: gh auth login')
    process.exit(1)
  }

  console.log(`\n🚀 上传到 GitHub Releases ${tag}...`)

  // 检查 tag 是否存在
  let tagExists = false
  try { execSync(`gh release view ${tag} --repo xingxuanyu18-web/Videobox`, { stdio: 'pipe' }); tagExists = true } catch {}

  if (!tagExists) {
    console.log(`   创建 Release ${tag}...`)
    execSync(
      `gh release create ${tag} "${installerPath}" "${blockmapPath}" --repo xingxuanyu18-web/Videobox --title "Videobox ${tag}" --notes "Videobox ${version} 版本发布"`,
      { stdio: 'inherit' }
    )
  } else {
    console.log(`   Release ${tag} 已存在，上传文件...`)
    execSync(
      `gh release upload ${tag} "${installerPath}" "${blockmapPath}" --repo xingxuanyu18-web/Videobox --clobber`,
      { stdio: 'inherit' }
    )
  }

  console.log(`✅ 已上传到 GitHub: https://github.com/xingxuanyu18-web/Videobox/releases/tag/${tag}`)
  console.log(`   下载链接: https://github.com/xingxuanyu18-web/Videobox/releases/download/${tag}/${installerName}`)
}

// ==================== 上传到 Gitee ====================
async function uploadToGitee() {
  const TOKEN = process.env.GITEE_TOKEN
  if (!TOKEN) {
    console.log('\n⚠ 跳过 Gitee 上传（未设置 GITEE_TOKEN 环境变量）')
    console.log('  1. 访问 https://gitee.com/profile/personal_access_tokens 创建令牌')
    console.log('  2. set GITEE_TOKEN=你的令牌 然后重新运行')
    return
  }

  console.log('\n🎯 上传到 Gitee...')
  const tag = `v${version}`
  const OWNER = process.env.GITEE_OWNER || 'xing-xuanyu'
  const REPO = process.env.GITEE_REPO || 'videobox-releases'
  const { readFileSync: rf } = await import('fs')

  try {
    const checkUrl = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/tags/${tag}`
    const checkRes = await fetch(checkUrl)
    let releaseId = null

    if (checkRes.ok) {
      const release = await checkRes.json()
      releaseId = release.id
      console.log(`   Release ${tag} 已存在`)
    } else {
      console.log(`   创建 Release ${tag}...`)
      const createRes = await fetch(`https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: TOKEN,
          tag_name: tag,
          name: `Videobox v${version}`,
          body: `Videobox ${version} 安装包`,
          target_commitish: 'master',
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.text()
        console.log(`   ⚠ 创建失败: ${err.slice(0, 200)}`)
        return
      }
      releaseId = (await createRes.json()).id
      console.log(`   创建成功`)
    }

    // 删除旧同名附件
    try {
      const listRes = await fetch(`https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files`)
      if (listRes.ok) {
        const files = await listRes.json()
        for (const f of files) {
          if (f.name === installerName) {
            await fetch(`https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files/${f.id}?access_token=${TOKEN}`, { method: 'DELETE' })
          }
        }
      }
    } catch {}

    // 上传安装包
    console.log(`   上传 ${installerName}...`)
    const form = new FormData()
    form.append('file', new Blob([rf(installerPath)]), installerName)
    form.append('access_token', TOKEN)
    const uploadRes = await fetch(`https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files`, { method: 'POST', body: form })
    if (uploadRes.ok) {
      const result = await uploadRes.json()
      console.log(`   ✅ Gitee 已发布: ${result.browser_download_url || `https://gitee.com/${OWNER}/${REPO}/releases/download/${tag}/${installerName}`}`)
    } else {
      console.log(`   ⚠ 上传失败: ${(await uploadRes.text()).slice(0, 200)}`)
    }
  } catch (e) {
    console.log(`   ⚠ Gitee 上传异常: ${e.message}`)
  }
}

// ==================== main ====================
const args = process.argv.slice(2)
const shouldUpload = args.includes('--upload')
const shouldGitee = args.includes('--gitee')

console.log(`\n🎬 Videobox Post-Build v${version}`)
console.log('=' .repeat(50))

archive()

if (shouldUpload) {
  uploadToGitHub()
  await uploadToGitee()
} else if (shouldGitee) {
  await uploadToGitee()
} else {
  console.log('\n💡 提示:')
  console.log('   node scripts/post-build.js --upload  → 上传到 GitHub + Gitee')
  console.log('   node scripts/post-build.js --gitee    → 仅上传到 Gitee')
}

console.log('=' .repeat(50) + '\n')
