#!/usr/bin/env node
/**
 * gitee-upload.js — Videobox 安装包上传到 Gitee Release
 *
 * 环境变量要求：
 *   GITEE_TOKEN    — Gitee 私人令牌（https://gitee.com/profile/personal_access_tokens）
 *   GITEE_OWNER    — Gitee 用户名（如 xing-xuanyu）
 *   GITEE_REPO     — Gitee 仓库名（如 videobox-releases）
 *
 * 用法：
 *   node scripts/gitee-upload.js <version> <filePath>
 *   node scripts/gitee-upload.js 1.5.1 builds/Videobox.Setup.1.5.1.exe
 */

import { readFileSync, existsSync } from 'fs'
import { basename } from 'path'
import { execSync } from 'child_process'

const args = process.argv.slice(2)
const version = args[0]
const filePath = args[1]

if (!version || !filePath) {
  console.error('用法: node scripts/gitee-upload.js <version> <filePath>')
  process.exit(1)
}

if (!existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`)
  process.exit(1)
}

const TOKEN = process.env.GITEE_TOKEN
const OWNER = process.env.GITEE_OWNER || 'xing-xuanyu'
const REPO = process.env.GITEE_REPO || 'videobox-releases'

if (!TOKEN) {
  console.error('❌ 未设置 GITEE_TOKEN 环境变量')
  console.error('   1. 访问 https://gitee.com/profile/personal_access_tokens')
  console.error('   2. 创建令牌，勾选 projects 权限')
  console.error('   3. 设置环境变量: set GITEE_TOKEN=你的token')
  process.exit(1)
}

const fileName = basename(filePath)
const fileSize = readFileSync(filePath).length
const tag = `v${version}`

console.log(`\n🎯 Gitee Release 上传`)
console.log(`   仓库: ${OWNER}/${REPO}`)
console.log(`   版本: ${tag}`)
console.log(`   文件: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`)

// Step 1: 检查/创建 Release
async function uploadToGitee() {
  try {
    // 尝试获取已有 release
    const checkUrl = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/tags/${tag}`
    const checkRes = await fetch(checkUrl, { headers: { 'Content-Type': 'application/json' } })

    let releaseId = null
    if (checkRes.ok) {
      const release = await checkRes.json()
      releaseId = release.id
      console.log(`   Release ${tag} 已存在 (id=${releaseId})`)
    } else {
      // 创建新 release
      console.log(`   创建 Release ${tag}...`)
      const createUrl = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases`
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: TOKEN,
          tag_name: tag,
          name: `Videobox v${version}`,
          body: `Videobox ${version} 安装包\n\n由 post-build 脚本自动发布`,
          target_commitish: 'master',
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.text()
        throw new Error(`创建 Release 失败: HTTP ${createRes.status} ${err}`)
      }
      const data = await createRes.json()
      releaseId = data.id
      console.log(`   Release 创建成功 (id=${releaseId})`)
    }

    // Step 2: 删除旧的同名附件（如果存在）
    const listUrl = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files`
    const listRes = await fetch(listUrl, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (listRes.ok) {
      const files = await listRes.json()
      for (const f of files) {
        if (f.name === fileName) {
          console.log(`   删除旧附件: ${f.name}`)
          await fetch(`https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files/${f.id}?access_token=${TOKEN}`, {
            method: 'DELETE',
          })
        }
      }
    }

    // Step 3: 上传附件
    console.log(`   上传中...`)
    const uploadUrl = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files`
    const form = new FormData()
    form.append('file', new Blob([readFileSync(filePath)]), fileName)
    form.append('access_token', TOKEN)

    const uploadRes = await fetch(uploadUrl, { method: 'POST', body: form })
    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      throw new Error(`上传失败: HTTP ${uploadRes.status} ${err}`)
    }
    const result = await uploadRes.json()
    console.log(`   ✅ 上传成功`)
    console.log(`   下载: ${result.browser_download_url || `https://gitee.com/${OWNER}/${REPO}/releases/download/${tag}/${fileName}`}`)
    return { success: true, url: result.browser_download_url || '' }
  } catch (e) {
    console.error(`   ❌ 上传失败: ${e.message}`)
    return { success: false, error: e.message }
  }
}

uploadToGitee().then((result) => {
  if (!result.success) process.exit(1)
})
