/**
 * Android SDK 环境装配（一次性，2026-09-23）
 *
 * 前置：.android-tools/ 下已解压 jdk-17 与 cmdline-tools/latest。
 * 动作：写 licenses（避开交互式 yes）→ sdkmanager 装 platform-tools /
 * platforms;android-34 / build-tools;34.0.0（走国内镜像由 sdkmanager 自身代理设置）。
 *
 * 跑法：node android/setup-sdk.mjs
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve('.')
const TOOLS = join(ROOT, '.android-tools')

const jdkDir = readdirSync(TOOLS).find((d) => d.startsWith('jdk-17'))
if (!jdkDir) throw new Error('未找到 jdk-17 目录，先解压 jdk17.zip')
const JAVA_HOME = join(TOOLS, jdkDir)
const SDK = join(TOOLS, 'sdk')
const CMDTOOLS = join(TOOLS, 'cmdline-tools', 'latest', 'bin')

mkdirSync(join(SDK, 'licenses'), { recursive: true })
writeFileSync(join(SDK, 'licenses', 'android-sdk-license'), '24333f8a63b6825ea9c5514f83c2829b004d1fee\n')
writeFileSync(join(SDK, 'licenses', 'android-sdk-preview-license'), '84831b9409646a918e30573bab4c9c91346d8abd\n')

const env = {
  ...process.env,
  JAVA_HOME,
  PATH: `${join(JAVA_HOME, 'bin')};${process.env.PATH ?? ''}`,
}

function run(cmd) {
  console.log('>', cmd.replace(JAVA_HOME, '%JAVA_HOME%'))
  execSync(cmd, { env, stdio: ['ignore', 'inherit', 'inherit'], timeout: 570_000 })
}

if (!existsSync(join(SDK, 'platforms', 'android-34'))) {
  run(`"${CMDTOOLS}\\sdkmanager.bat" --sdk_root="${SDK}" --no_https "platform-tools" "platforms;android-34" "build-tools;34.0.0"`)
} else {
  console.log('SDK 组件已就位，跳过安装')
}

console.log('\nSDK 装配完成：', SDK)
console.log('platforms:', existsSync(join(SDK, 'platforms', 'android-34')) ? '✓' : '✗')
console.log('build-tools:', existsSync(join(SDK, 'build-tools', '34.0.0')) ? '✓' : '✗')
