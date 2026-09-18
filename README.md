# readAssistant

> Chrome extension that rewrites hard English into **simpler English** — same language, no translation.
> Click a paragraph, select a sentence to get a short simple rewrite, or select a single word to get it said again with simpler words.

把外语网页里"对你来说太难"的内容，改写成**同一种外语**的简单表达。

不翻译成中文。目标是让大脑直接建立 `外语形式 -> 含义` 的映射，而不是绕道中文。

## 三种用法

| 触发 | 动作 | 作用范围 |
|---|---|---|
| 点击段落 | Simplify | 整个段落 |
| **选中一个词 / 一个短语 / 一句话** | Simplify 或 Translate | 只处理选中的部分 |
| **选中一整段** | Simplify | 只处理选中的部分 |

**Simplify** 把内容改写成 CEFR 指定难度的简单英文，并抽出关键单词与短语。
**Translate** 把内容用最简单的外语词重说一遍：`plainWords`（难词 → 简单词）+ `plainSentence`（一到三句简单句）。

> "Translate" 是**用更简单的外语重说**，不是译成中文——面板里始终只有英文。

划词后，选区上方会出现蓝色胶囊按钮，**按选区能不能装得下决定给哪些动作**：

| 选区 | 胶囊 | 面板 tab |
|---|---|---|
| 词 / 短语（不足 20 字符且不足 12 词） | `Translate` | Simplify 置灰：需要 20 字符或 12 词 |
| 短语 / 一句话（≥ 20 字符或 ≥ 12 词，≤ 40 词） | `Simplify` + `Translate` | 两个都能用，随时切 |
| 一整段（> 40 词） | `Simplify` | Translate 置灰：超出重说的长度上限 |

**40 词是有来历的**：Translate 的输出预算是 1~3 句、每句 ≤14 词 ≈ 42 词。超过这个预算，模型只能压缩，而**校验器看不出信息被丢了**（它只查 CJK、难词、句长、数字）。所以上限做成结构性约束，而不是指望 prompt 自律。

> 想要"整段用简单词概括"的话，那是**摘要**，不是翻译——本项目会把它做成独立动作，而不是放宽 Translate 的保真要求。

面板顶部的 tab 始终保持两个，不可用的那个置灰并说明原因，所以 tab 行本身就在解释这条边界。

## 结果长什么样

面板里全是英文，**不会出现中文**：

### Simplify

| 区块 | 内容 |
|---|---|
| **正文** | 用简单句、简单词重写的版本。一个长句会被拆成 2~4 个短句 |
| **Key words** | 3~6 个重点单词，格式 `word — simple English meaning` |
| **Key phrases** | 1~4 个重点短语，含搭配、短语动词、固定表达，格式 `phrase — simple English meaning` |

### Translate

| 区块 | 内容 |
|---|---|
| **正文** | `plainSentence`：把选区用最简单的词重说一遍，一到三句 |
| **Plain words** | 1~4 个难词，格式 `hard word — simpler word`，带英美音标与朗读 |

例：划中 `fascinating` → 正文 `It makes you want to know more.`，Plain words `fascinating — very interesting`。

其他：

- 原文保留不动，简化只是对照层
- **点任意词可以一路往下钻**（见下），背面还带着音标和朗读；Translate 的正文和单词同样可点
- 弹窗位置三选一：段落底部 / 段落侧边 / 跟随光标（见下）
- 结果按段落缓存 30 天，同一段二次点击不再请求 API（Simplify 与 Translate 各自独立缓存）
- 难度三档：A2 / B1 / B2（只影响 Simplify，Translate 恒为"最简单"）
- popup：总开关、难度、显示位置、划完即译、发音口音、音标开关、模型、DeepSeek API Key、按站点禁用

## 发音：音标 + 朗读

### 音标（离线，不发请求、不耗 token）

- 面板里每个 **Key word / Key phrase** 都带两套音标：`UK /.../  ·  US /.../`
- 点面板顶部的 **Aa** 按钮，Simplified 里每个单词上方会用 ruby 注音，按 popup 里选的**当前口音**显示
- 英美拼写差异会自动回退：`organization` 没有英式音标时，会去查 `organisation`
- 某个口音真的查不到时，会借用另一口音并在前面标 `≈`

### 朗读（浏览器内置 Web Speech API，免费）

| 位置 | 行为 |
|---|---|
| 面板顶部 **UK** / **US** | 用英式 / 美式朗读整段简化文本 |
| Key word / phrase 右侧 **UK** / **US** | 朗读这一个词或短语 |
| **Alt** + 点击任意单词 | 用当前口音朗读该词并高亮一下 |
| `Esc` | 停止朗读并关闭浮层 |

popup 里的 **Pronunciation** 决定默认口音（British `en-GB` / American `en-US`）。

> 语音质量取决于系统装了哪些语音包。macOS 自带的 Serena / Daniel（英式）与 Samantha / Alex（美式）会被优先选用；没有对应口音时交给浏览器按 `lang` 自选。

## 划完即译

popup 里的 **Translate words as soon as I select them**：

| 状态 | 行为 |
|---|---|
| 关（默认） | 划词后出现胶囊，点 `Translate` 才发请求 |
| 开 | 划中**词或短语**后直接出结果，不用点 |

句子和段落始终走点击触发，避免顺手一划就发一次请求。

## 看不懂就继续点：下钻解释

Key word 的解释、简化正文里的词，**只要还不认识就继续点它**，面板会整体换成对这个词的解释：

```
fascinating
   │ 点击
   ▼
‹ Back   fascinating › intriguing                     ← 面包屑 + 逐层回退
intriguing                              [UK] [US]
UK /ɪnˈtriːɡɪŋ/  ·  US /ɪnˈtriːɡɪŋ/
hard to understand and interesting                     ← 这里的词还能点
Synonyms: puzzling, strange
```

- 解释里每个单词**同样可点**，所以能一直往下套（深度上限 12 层）
- 解释的硬约束：只用最高频 1000 词、一句话、4~12 词、**不许使用被解释的词本身**
- 校验器会拦下：含中文 / 超过 20 词 / 复用了原词 / 出现超纲词 → 自动重试，最多 3 次
- 解释按单词缓存 30 天，同一个词再点不重复请求
- 下钻进去后，解释里出现的生词会即时补音标

## 弹窗位置（三种）

在 popup 的 **Where to show it** 里切换。

| 选项 | 行为 | 会不会顶开页面 |
|---|---|---|
| `Below the paragraph`（默认） | 插在段落下方，属于文档流 | 会，下面的内容被下移 |
| `Beside the paragraph` | 绝对定位在段落右侧；右边放不下放左边，都放不下则落到段落下方 | 不会 |
| `Follow the cursor` | 固定定位，贴着光标出现，卡片不随页面滚动 | 不会 |

跟随光标模式的细节：

- 光标停在原段落内时卡片跟着光标走；一旦移开（比如移到卡片上）就冻结位置，方便阅读，不会被拖着跑
- 点击页面空白处或按 `Esc` 关闭
- 卡片加载完成后尺寸变大，会自动重新钳制到视口内，不会跑出屏幕
- 同一时间只保留一个跟随卡片；底部/侧边模式可以同时开多个

切换「显示位置」或「难度」会关闭当前已打开的卡片，避免混用两种位置。

## 安装

```bash
git clone https://github.com/qfxiongbinbin/read-assistant.git
cd read-assistant
npm install
npm run build
```

然后：

1. Chrome -> `chrome://extensions` -> 打开右上角"开发者模式" -> "加载已解压的扩展程序" -> 选 `.output/chrome-mv3`
2. 点扩展图标，填入 DeepSeek API Key（在 platform.deepseek.com 创建），点 Save
3. 打开任意英文网页：点击段落，或选中一句话后点 **Simplify**，或选中一个词后点 **Translate**

> 没有图标文件，Chrome 会显示默认的拼图图标，不影响使用。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | WXT 开发模式，自动重建并打开浏览器 |
| `npm run build` | 生产构建到 `.output/chrome-mv3` |
| `npm run compile` | `wxt prepare` + `tsc --noEmit` 类型检查 |
| `npm run selftest` | 校验器自测（含划词翻译的解析与校验），不需要 API Key |
| `npm run gen:freq` | 重新生成 5000 高频词表（需 `tmp/freq10000.txt`） |
| `npm run gen:ipa` | 重新生成英美音标表（需 `tmp/ipa/en_UK.txt` 与 `en_US.txt`） |

## 目录

```
src/
  entrypoints/
    background.ts     调度：缓存 -> 调 DeepSeek -> 校验 -> 重试
    content.ts        段落标记、点击/选中触发、就地渲染
    popup/            设置界面
  lib/
    prompt.ts         改写 / 重说 prompt（核心资产，改动请同步 docs/prompt-log.md）
    verify.ts         校验器：中文/词频/句长/数字/抽取/换说
    llm.ts            DeepSeek 适配器（OpenAI 兼容）
    cache.ts          settings + 段落 / 解释 / 重说三套缓存
    segment.ts        段落发现与稳定 ID
    position.ts       三种弹窗位置的定位与视口钳制
    selection.ts      选区识别、长短判定与动作胶囊
    ipa.ts            音标查表与英美拼写回退（纯函数）
    phonetics.ts      音标词典懒加载（service worker 侧）
    speech.ts         Web Speech API 朗读与英美语音挑选
    storage.ts / hash.ts / style.ts / types.ts
  data/enFreq.ts      自动生成的 5000 高频词表
public/ipa/en.tsv     英美音标表（3.85 MB，构建时原样复制）
scripts/
  selftest.ts         校验器自测
  gen-freq.mjs        词表生成
  gen-ipa.mjs         音标表生成
```

## 四条硬约束

1. **零中文**：注入页面的内容全部是英文；`verify.ts` 检测到 CJK 字符直接判废并触发重试。Translate 也是**用更简单的外语重说**，不是译成中文
2. **原文永不替换**：简化版是一层对照，不是替换
3. **只处理你点选的内容**：不整页改写，控制成本也避免打扰阅读
4. **必须抽取**：Simplify 的 `keyWords` 为空会判废重试；Translate 的输入含难词时 `plainWords` 不能为空

## 已知限制（M1）

- 只支持英语
- 只处理 `p / li / blockquote / dd / h1-h4`，每页最多 600 段
- 不做难度预判，需要手动点选
- 抽取的关键词/短语不落库，还没有个人词表与"简化率随水平下降"的进度指标
- 结果结构版本号是 `SCHEMA_VERSION`（当前 `v2`），改结构会顺带失效旧缓存
- 下钻解释按「单词」缓存，不区分上下文；同一个词在不同语境下的多义会被第一次的结果复用
- Translate 的适用范围是**一个词 ~ 一句话（≤ 40 词）**，整段会退化成有损概括，所以直接不给这个动作（`TRANSLATE_MAX_WORDS`）
- Translate 不按 CEFR 档位分级，恒定输出"最简单的词"
- 三个分界都是硬编码的（Simplify 的 20 字符 / 12 词、Translate 的 40 词 / 600 字符），不区分语言与内容
- 朗读依赖系统语音包，系统里没有对应口音时会退回浏览器按 `lang` 自选的语音
- 音标词典 3.85 MB 随扩展分发，首次查表时在 service worker 里解析一次

## 数据来源

`src/data/enFreq.ts` 里的 5000 高频词表由 `scripts/gen-freq.mjs` 从
[first20hours/google-10000-english](https://github.com/first20hours/google-10000-english) 生成。
该列表按词频排序，源自 Google Web Trillion Word Corpus；本项目只取前 5000 个，**仅用于本地难度判定**，
不会发送给模型。

`public/ipa/en.tsv` 里的英美音标表由 `scripts/gen-ipa.mjs` 从
[open-dict-data/ipa-dict](https://github.com/open-dict-data/ipa-dict) 生成（MIT，(c) 2016 dohliam）。
合并后共 147,359 词（US 12.6 万 / UK 6.5 万），同样**只在本地查询**。

## License

[MIT](LICENSE)
