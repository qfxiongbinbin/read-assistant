# Prompt 版本记录

改动 `src/lib/prompt.ts` 时必须在这里追加一条，并注明评测结果。

## v1 — 2026-09-14（当前）

- 文件：`src/lib/prompt.ts`
- 模型：`deepseek-chat`
- 结果结构：`SCHEMA_VERSION = 'v2'`（新增 `keyWords` / `keyPhrases`，取代 `glossary`）

### 相对 v0 的变化

1. 新增 EXTRACTION 段：要求抽 3~6 个 `keyWords` 与 1~4 个 `keyPhrases`，都用简单英文解释（不超过 8 词）
2. 明确"输入是一个长句时，拆成 2~4 个短句"
3. user prompt 由 `Rewrite this paragraph` 改为 `Rewrite this part`，因为现在也处理选中的句子

### 输出格式

```json
{"simplified": "...", "keyWords": [{"term": "...", "simple": "..."}], "keyPhrases": [{"term": "...", "simple": "..."}]}
```

`parseResult` 会做归一化：单词进 `keyWords`，多词进 `keyPhrases`，并兼容旧的 `glossary` 字段。

### 评测基线

`npm run selftest`：26 项通过。

### 待观察

- [ ] 真实网页 20 段人工评估：可懂度、事实保真、是否出现中文
- [ ] `keyWords` / `keyPhrases` 是否真的"值得学"，有没有抽到 the / and 这类词
- [ ] 多了一个抽取任务，输出变长，观察平均重试次数与 token 成本

## v0 — 2026-09-14

- 文件：`src/lib/prompt.ts`
- 模型：`deepseek-chat`
- 温度：0.2
- 结构化：`response_format: { type: 'json_object' }`

### 目标

把英语段落改写成 CEFR 指定级别的英语，保留全部事实，不出现中文。

### 核心约束（system prompt）

1. 只输出英语，绝不翻译，绝不输出中文或其他语言
2. 保留所有事实、数字、人名、日期与逻辑关系，不增不减
3. 尽可能只用最高频的 2000 英语词
4. 每句最多 14 词，一句一个意思，优先主动语态
5. 习语、短语动词、名词化改写为简单动词
6. 专有名词、产品名、无法替换的术语保留原样
7. 无法替换的难词保留，并用括号给出简单英语解释
8. 段落数量与顺序不变

### 输出格式

```json
{"simplified": "...", "glossary": [{"term": "...", "simple": "..."}]}
```

### 评测基线

`npm run selftest`：20 例检查通过（CJK 检测、JSON 解析、词形还原、专有名词、好样例通过、5 类反例被拒）。

### 待观察

- [ ] 真实网页 20 段人工评估：可懂度、事实保真、是否出现中文
- [ ] 平均重试次数与 token 成本
- [ ] A2 / B1 / B2 三档的输出差异是否明显
