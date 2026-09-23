/**
 * APK 构建编排（2026-09-23）
 *
 * 前置：scripts/setup-android-sdk.mjs 已装配 SDK；JDK17 在 .android-tools。
 * 动作：设置 JAVA_HOME / ANDROID_HOME → gradlew assembleDebug（-all 分发走腾讯镜像）。
 * 产物：android/app/build/outputs/apk/debug/app-debug.apk（debug 签名，可直接安装）
 *
 * 跑法：node android/build-apk.mjs
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve('.')
const TOOLS = join(ROOT, '.android-tools')

const jdkDir =
  readdirSync(TOOLS).find((d) => d.startsWith('jdk-21')) ??
  readdirSync(TOOLS).find((d) => d.startsWith('jdk-17'))
if (!jdkDir) throw new Error('未找到 JDK')
// 🔴 Capacitor 7 的安卓库按 Java 21 编译 —— 必须 JDK 21（17 会报「无效的源发行版：21」）
const JAVA_HOME = join(TOOLS, jdkDir)
const SDK = join(TOOLS, 'sdk')
const ANDROID_HOME = SDK

// local.properties（Gradle 找 SDK 的标准途径；路径转义反斜杠）
writeFileSync(join(ROOT, 'android', 'local.properties'), `sdk.dir=${SDK.replace(/\\/g, '\\\\')}\n`)

const env = {
  ...process.env,
  JAVA_HOME,
  ANDROID_HOME,
  // 🔴 gradle 用户目录迁到项目内 —— C 盘默认 ~/.gradle 的 .tmp 出现过
  // 「拒绝访问」下载失败（杀软/权限），且脏缓存会反复作祟
  GRADLE_USER_HOME: join(TOOLS, 'gradle-home'),
  PATH: `${join(JAVA_HOME, 'bin')};${process.env.PATH ?? ''}`,
}

// 🔴 依赖走阿里云镜像（google / mavenCentral 的国内镜像），下载稳且快
const GRADLE_USER = env.GRADLE_USER_HOME
mkdirSync(join(GRADLE_USER, 'init.d'), { recursive: true })
writeFileSync(
  join(GRADLE_USER, 'init.d', 'mirrors.gradle'),
  `def ALIYUN = 'https://maven.aliyun.com/repository'
allprojects {
    repositories {
        maven { url ALIYUN + '/google' }
        maven { url ALIYUN + '/public' }
    }
}
settingsEvaluated {
    it.pluginManagement {
        repositories {
            maven { url ALIYUN + '/google' }
            maven { url ALIYUN + '/gradle-plugin' }
            gradlePluginPortal()
        }
    }
}
`,
)

if (!existsSync(join(SDK, 'platforms', 'android-34', 'android.jar'))) {
  throw new Error('platforms/android-34 未就绪 —— 先跑 scripts/setup-android-sdk.mjs / 手动解压 platform-34')
}

console.log('JAVA_HOME:', JAVA_HOME)
console.log('ANDROID_HOME:', ANDROID_HOME)
console.log('开始 gradle assembleDebug（首次会下载 gradle 分发 + 依赖，耐心等）…')

const gradlew = join(ROOT, 'android', 'gradlew.bat')
// ⚠️ 不设 execSync timeout —— Defender 实时扫描会让解压/依赖下载远超预期，
// 超时自杀等于前功尽弃（本脚本只在后台跑）
execSync(`"${gradlew}" assembleDebug --no-daemon`, {
  env,
  cwd: join(ROOT, 'android'),
  stdio: ['ignore', 'inherit', 'inherit'],
})

const apk = join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
if (!existsSync(apk)) throw new Error('APK 未产出')
console.log('\n🎉 APK 就绪:', apk)
