# readAssistant

把外语网页里"对你来说太难"的句子，改写成**同一种外语**的简单表达。

不翻译成中文。目标是让大脑直接建立 `外语形式 -> 含义` 的映射，而不是绕道中文。

## 现在能做什么（M1）

- 在任意 http/https 页面，鼠标移到段落上会出现左侧蓝色提示条
- 点击段落 -> 段落下方出现简化版（同语言），**原文保留不动**
- 难词以 `term — simple English explanation` 列出，全程不出现中文
- 结果按段落缓存 30 天，同一段二次点击不再请求 API
- 难度三档：A2 / B1 / B2
- popup：总开关、难度、模型、DeepSeek API Key、按站点禁用

## 安装（开发版）

1. `npm install`
2. `npm run build`
3. Chrome -> `chrome://extensions` -> 打开右上角"开发者模式" -> "加载已解压的扩展程序" -> 选 `.output/chrome-mv3`
4. 点扩展图标，填入 DeepSeek API Key（在 platform.deepseek.com 创建），点 Save
5. 打开任意英文网页，点击段落

> 没有图标文件，Chrome 会显示默认的拼图图标，不影响使用。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | WXT 开发模式，自动重建并打开浏览器 |
| `npm run build` | 生产构建到 `.output/chrome-mv3` |
| `npm run compile` | `wxt prepare` + `tsc --noEmit` 类型检查 |
| `npm run selftest` | 校验器自测，不需要 API Key |
| `npm run gen:freq` | 重新生成 5000 高频词表（需 `tmp/freq10000.txt`） |

## 目录

```
src/
  entrypoints/
    background.ts     调度：缓存 -> 调 DeepSeek -> 校验 -> 重试
    content.ts        段落标记、点击、就地渲染
    popup/            设置界面
  lib/
    prompt.ts         改写 prompt（核心资产，改动请同步 docs/prompt-log.md）
    verify.ts         校验器：中文/词频/句长/数字
    llm.ts            DeepSeek 适配器（OpenAI 兼容）
    cache.ts          settings + 段落缓存
    segment.ts        段落发现与稳定 ID
    storage.ts / hash.ts / style.ts / types.ts
  data/enFreq.ts      自动生成的 5000 高频词表
scripts/
  selftest.ts         校验器自测
  gen-freq.mjs        词表生成
```

## 三条硬约束

1. **零中文**：注入页面的内容全部是英文；`verify.ts` 检测到 CJK 字符直接判废并触发重试
2. **原文永不替换**：简化版是插入在段落下方的一层对照
3. **只处理被点击的段落**：不整页改写，控制成本也避免打扰阅读

## 已知限制（M1）

- 只支持英语
- 只处理 `p / li / blockquote / dd / h1-h4`，每页最多 600 段
- 不做难度预判，需要手动点击
- 还没有个人词表画像与"简化率随水平下降"的进度指标
