# 大模型开发使用规范（设计稿 v0.1）

> 状态：**已采纳** · 2026-08-26  
> 目标：在项目任意层方便、安全、可测试地调用大模型；提示词集中管理、版本可追溯。  
> 当前凭证：OpenRouter API Key（开发脚本已使用，运行时需接入凭据仓库）。

---

## 1. 设计目标

| 目标           | 说明                                                            |
| -------------- | --------------------------------------------------------------- |
| **随处可用**   | 业务代码通过统一入口调用，不出现散落的 `fetch('openrouter...')` |
| **提示词可管** | 提示词与业务代码分离，支持版本、变量、模型配置                  |
| **架构合规**   | 遵循现有 Electron 边界：渲染进程不直连外网，密钥不进 SQLite     |
| **产品合规**   | 不生成买卖建议；AI 输出必须可追溯到用户原始记录                 |
| **可测试**     | 单元测试可注入 Mock Provider，不消耗 token                      |
| **可演进**     | 首版 OpenRouter，后续可增 Anthropic / 本地模型而不改业务层      |

---

## 2. 非目标（首版不做）

- 渲染进程直连 OpenRouter
- 在 SQLite 中保存 API Key
- 流式输出 UI（可预留接口，P1 再做）
- 通用 Agent / 多轮工具调用框架
- 自动替用户填写交易逻辑或事后改写计划（见产品功能设计「明确不做」）

---

## 3. 运行时架构

```text
React 渲染进程
  └─ window.desktop.ai.*          （高层业务 API，推荐）
       └─ preload（类型化 IPC）
            └─ 主进程 IPC 鉴权
                 └─ Utility Process
                      ├─ LlmRunner.run(promptId, variables)
                      ├─ PromptLoader（读 prompts/）
                      ├─ OpenRouterProvider
                      └─ CredentialStore（读 API Key）
```

### 3.1 调用层级（由低到高）

```
Layer 3  业务服务     reviews.aiDraft(reviewId)     ← 渲染进程只应调这一层
Layer 2  LlmRunner    run('review.summarize', vars)  ← service 内业务模块
Layer 1  LlmClient    complete(messages, options)    ← 仅 llm 模块内部
Layer 0  Provider     openrouter.chat(...)           ← 仅 provider 实现
```

**规则**

- `renderer` **禁止** import `service/llm` 或 `prompts/` 下任何实现。
- `main` **禁止**直接调 LLM；只做 IPC 转发（与现有 `ServiceHost` 一致）。
- `scripts/`（如 `release.mjs`）**允许**直接 import `src/service/llm` 或共享包，走与运行时相同的 `LlmRunner`。
- 只有 `src/service/llm/` 和 `src/service/llm/providers/` 可以发 HTTP 请求。

### 3.2 与现有 ServiceContract 的衔接

在 `ServiceContract` 中增加两类方法：

**A. 通用底层（service 内部或高级 IPC 调试页使用）**

```typescript
'llm.complete': {
  params: {
    promptId: PromptId;
    variables: Record<string, unknown>;
    overrides?: { model?: string; temperature?: number };
  };
  result: LlmCompletionResult;
};
```

**B. 业务语义层（渲染进程推荐）**

```typescript
'reviews.generateAiDraft': {
  params: { reviewId: string };
  result: { draftMarkdown: string; citations: string[] };
};
```

原则：**面向用户的页面优先暴露 B**；A 仅供 service 内部组合与调试。

---

## 4. 目录结构（建议）

```text
src/
├── shared/llm/
│   ├── types.ts              # LlmMessage, LlmCompletionResult, PromptId
│   ├── prompt-id.ts          # PromptId 联合类型（或 const 对象）
│   └── llm.schemas.ts        # Zod：变量校验、JSON 输出 schema
│
├── prompts/                  # ★ 提示词唯一来源（纳入 Git）
│   ├── _shared/
│   │   └── safety.system.md  # 全局安全约束（禁止荐股等）
│   ├── review/
│   │   └── summarize.prompt.md
│   ├── journal/
│   │   └── weekly-report.prompt.md
│   └── release/
│       └── notes.prompt.md   # 从 scripts/release.mjs 迁入
│
└── service/llm/
    ├── llm-client.ts         # 聚合 Provider、重试、fallback
    ├── llm-runner.ts         # run(promptId, variables) 主入口
    ├── prompt-loader.ts      # 解析 .prompt.md + 变量渲染
    ├── credential-store.ts   # 读 OS 凭据 / 开发环境变量
    ├── providers/
    │   ├── provider.ts       # interface LlmProvider
    │   ├── openrouter.ts
    │   └── mock.ts           # 测试用
    └── guards/
        └── output-policy.ts  # 输出合规检查（可选拦截/告警）
```

`prompts/` 放在 `src/` 下以便 TypeScript 引用与打包；构建时将 `prompts/**` 复制到 service 可访问路径（或 embed 为字符串，见 §5.2）。

---

## 5. 提示词管理规范

### 5.1 文件格式：`.prompt.md` + YAML frontmatter

每个提示词一个文件，命名：`{domain}/{name}.prompt.md`。

````markdown
---
id: review.summarize
version: 2
description: 根据交易回合事实与用户复盘草稿，生成结构化总结（不含买卖建议）
model: ~deepseek/deepseek-v4-flash-latest
fallbackModels:
  - qwen/qwen-plus
  - deepseek/deepseek-v4-flash-0731
temperature: 0.2
maxTokens: 2048
responseFormat: markdown # markdown | json | text
variables:
  episodeFacts:
    type: object
    required: true
    description: 交易回合结构化事实（JSON）
  userAnswers:
    type: object
    required: true
    description: 用户五问复盘答案
tags:
  - review
  - p2
---

## system

{{> _shared/safety.system }}

你是「交易日记」复盘助手。只基于用户提供的记录归纳，不得预测价格或建议买卖。

## user

### 交易事实

```json
{{episodeFactsJson}}
```
````

### 用户复盘

{{userAnswersText}}

请输出：

1. 过程评价（与盈亏分开）
2. 做得好的地方
3. 需改进的地方
4. 可写入规则库的一条建议（如有）

````

**约定**

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 全局唯一，与 `PromptId` 类型一致，如 `review.summarize` |
| `version` | 是 | 整数递增；变更逻辑时 +1，便于日志与 A/B |
| `model` | 否 | 默认模型；缺省用全局配置 |
| `fallbackModels` | 否 | 地区不可用 / 429 时依次尝试 |
| `temperature` | 否 | 默认 0.2 |
| `responseFormat` | 否 | `json` 时配合 Zod schema 校验 |
| `variables` | 是 | 声明变量名与类型；运行时先 Zod 校验再渲染 |

正文用 `## system` / `## user` 分段；支持 `{{variable}}` 与 partial 引用 `{{> _shared/...}}`。

### 5.2 模板引擎

首版采用 **轻量 Mustache 风格**（仅 `{{key}}`、`{{> partial}}`），不引入重型模板依赖；复杂 JSON 变量由调用方预序列化为 `*Json` 字符串注入。

构建时：`electron-vite` 将 `src/prompts/**` 作为 service 静态资源复制到 `out/service/prompts/`（与现有 asset 策略一致）。

### 5.3 PromptId 类型安全

```typescript
// shared/llm/prompt-id.ts
export const PROMPT_IDS = {
  REVIEW_SUMMARIZE: 'review.summarize',
  JOURNAL_WEEKLY: 'journal.weekly-report',
  RELEASE_NOTES: 'release.notes',
} as const;

export type PromptId = (typeof PROMPT_IDS)[keyof typeof PROMPT_IDS];
````

新增提示词 = 新增文件 + 在 `PROMPT_IDS` 注册 +（可选）在 `llm.schemas.ts` 增加变量 schema。

### 5.4 共享安全提示词

`_shared/safety.system.md` 全文注入所有面向用户的 system 段，核心约束：

- 不提供买入/卖出/目标价建议
- 不预测涨跌
- 只引用上下文中已有事实；无依据时不臆造
- 区分「结果」与「执行过程」
- 输出语言：简体中文（除非 prompt 指定）

---

## 6. 使用方式

### 6.1 三步上手

**① 配置 Key（一次性）**

| 场景     | 做法                                                     |
| -------- | -------------------------------------------------------- |
| 桌面应用 | 设置 → AI → 填入 OpenRouter API Key →「测试连接」        |
| 本地开发 | `electron-builder.env` 中 `OPENROUTER_API_KEY=sk-or-...` |
| 发布脚本 | 同上，或 export 环境变量                                 |

**② 选 PromptId 调**

所有 AI 能力都对应一个 `promptId`（见 §9 映射表）。业务代码**只传变量**，不写 prompt 正文。

**③ 按所在层选调用方式**

| 你在哪写代码              | 怎么调                                     |
| ------------------------- | ------------------------------------------ |
| `src/renderer/` 页面/组件 | `window.desktop.{模块}.{业务方法}`         |
| `src/service/` 后台服务   | `llmRunner.run(PROMPT_IDS.XXX, variables)` |
| `scripts/` 构建/发布脚本  | 同 service，`llmRunner.run(...)`           |
| `tests/`                  | 注入 `MockProvider`，不耗 token            |

---

### 6.2 渲染进程（UI 层）

页面**只调语义化 API**，不接触 `promptId` 和 OpenRouter。

```typescript
// JournalPage.tsx — 用户点击「AI 生成复盘草稿」
async function handleGenerateDraft(reviewId: string) {
  setLoading(true);
  try {
    const { draftMarkdown, citations } = await window.desktop.reviews.generateAiDraft(reviewId);
    form.setFieldsValue({ summary: draftMarkdown });
    message.success('草稿已生成，请核对后保存');
  } catch (error) {
    if (isLlmNotConfigured(error)) {
      message.warning('请先在设置中配置 OpenRouter API Key');
      navigate('/settings');
      return;
    }
    message.error('生成失败，请稍后重试');
  } finally {
    setLoading(false);
  }
}
```

```typescript
// SettingsPage.tsx — 配置与测试
await window.desktop.settings.saveLlmApiKey(apiKey);
const { ok, model, latencyMs } = await window.desktop.settings.testLlmConnection();
```

**preload / api.types 形态（设计目标）：**

```typescript
window.desktop.reviews.generateAiDraft(reviewId: string): Promise<{
  draftMarkdown: string;
  citations: string[];   // 引用了哪些本地记录 ID，便于审计
}>;

window.desktop.settings.saveLlmApiKey(key: string): Promise<void>;
window.desktop.settings.testLlmConnection(): Promise<{ ok: boolean; model: string; latencyMs: number }>;
```

---

### 6.3 Service 层（业务 + AI 组合）

业务模块负责：**读数据库 → 组装变量 → 调 LlmRunner → 写回/返回**。

```typescript
// service/reviews/review-ai-service.ts
import { llmRunner } from '../llm/llm-runner';
import { PROMPT_IDS } from '../../shared/llm/prompt-id';
import { reviewSummarizeVariablesSchema } from '../../shared/llm/llm.schemas';

export async function generateReviewDraft(db: AppDatabase, reviewId: string) {
  const review = db.getReview(reviewId);
  const episode = db.getTradeEpisode(review.episodeId);

  const variables = reviewSummarizeVariablesSchema.parse({
    episodeFacts: episode.toFacts(),
    userAnswers: review.answers,
  });

  const result = await llmRunner.run(PROMPT_IDS.REVIEW_SUMMARIZE, variables);

  return {
    draftMarkdown: result.content,
    citations: [reviewId, episode.id],
    meta: { model: result.model, promptVersion: result.promptVersion },
  };
}
```

```typescript
// service/app-service.ts — 注册到 ServiceContract
case 'reviews.generateAiDraft':
  return generateReviewDraft(this.db, request.params.reviewId);
```

**JSON 输出类 prompt**（如 CSV 列映射）：

```typescript
const result = await llmRunner.run(PROMPT_IDS.IMPORT_COLUMN_GUESS, {
  headers: csvHeaders,
  sampleRows: rows.slice(0, 5),
});

const mapping = importColumnGuessSchema.parse(JSON.parse(result.content));
// mapping: { symbol: '代码', price: '成交价', ... }
```

---

### 6.4 脚本层（发布 / 离线任务）

与运行时**同一套** `LlmRunner` + `prompts/`，不再内联 prompt 字符串。

```javascript
// scripts/release.mjs
import { llmRunner } from '../src/service/llm/llm-runner.js';
import { PROMPT_IDS } from '../src/shared/llm/prompt-id.js';

const { content } = await llmRunner.run(PROMPT_IDS.RELEASE_NOTES, {
  currentVersion: '1.2.0',
  lastTag: 'v1.0.1',
  commits: commitSubjects,
});

fs.writeFileSync('release-notes.md', content);
```

```bash
# 环境变量自动从 electron-builder.env 读取（与现有 release 脚本一致）
npm run release
```

---

### 6.5 新增一个 AI 功能（标准流程）

以「周报 AI 草稿」为例，从零到可用：

**Step 1 — 写提示词**

新建 `src/prompts/journal/weekly-report.prompt.md`（格式见 §5.1）。

**Step 2 — 注册 ID 与变量 schema**

```typescript
// shared/llm/prompt-id.ts
JOURNAL_WEEKLY: 'journal.weekly-report',

// shared/llm/llm.schemas.ts
export const journalWeeklyVariablesSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  statsJson: z.string(),
  episodesJson: z.string(),
});
```

**Step 3 — Service 实现**

```typescript
// service/journal/weekly-ai-service.ts
export async function generateWeeklyDraft(period: DateRange) {
  const stats = await aggregatePeriodStats(period);
  const episodes = await listEpisodesInPeriod(period);
  return llmRunner.run(PROMPT_IDS.JOURNAL_WEEKLY, {
    periodStart: period.start,
    periodEnd: period.end,
    statsJson: JSON.stringify(stats),
    episodesJson: JSON.stringify(episodes),
  });
}
```

**Step 4 — 暴露给 UI**

```typescript
// ServiceContract + preload + IPC
'journal.generateWeeklyDraft': { params: { weekId: string }, result: { draftMarkdown: string } }
```

**Step 5 — 测试**

```typescript
// tests/llm/weekly-ai-service.test.ts
const mock = new MockProvider({ 'journal.weekly-report': fixtureMarkdown });
llmRunner.useProvider(mock);
const result = await generateWeeklyDraft(testPeriod);
expect(result.content).toContain('继续');
```

**Step 6 — 更新 §9 映射表**

---

### 6.6 修改已有提示词

1. 编辑 `src/prompts/{domain}/{name}.prompt.md` 正文或 frontmatter。
2. **`version` 字段 +1**（便于日志区分）。
3. 若变量结构变了，同步改 `llm.schemas.ts` 和调用方。
4. 跑对应单元测试；**无需改** `llmRunner` 或 Provider 代码。

---

### 6.7 错误处理约定

```typescript
import { LlmNotConfiguredError, LlmProviderError } from '../../shared/llm/errors';

try {
  await llmRunner.run(...);
} catch (error) {
  if (error instanceof LlmNotConfiguredError) {
    // 引导用户去设置页
  } else if (error instanceof LlmProviderError) {
    // 网络/上游错误，可重试或降级为「请手动填写」
  }
  throw error;
}
```

UI 层**不向用户展示**原始 OpenRouter 错误 JSON。

---

### 6.8 产品场景速查

| 用户操作                   | 调用链                                  | PromptId                |
| -------------------------- | --------------------------------------- | ----------------------- |
| 复盘页「AI 草稿」          | `reviews.generateAiDraft` → service     | `review.summarize`      |
| 分析页「生成周报」         | `journal.generateWeeklyDraft` → service | `journal.weekly-report` |
| 计划激活前「相关规则提示」 | `plans.suggestChecklist` → service      | `plan.checklist-hints`  |
| CSV 导入「猜列名」         | `import.guessColumns` → service         | `import.column-guess`   |
| `npm run release`          | `scripts/release.mjs` → llmRunner       | `release.notes`         |

---

### 6.9 不要这样用 ❌

```typescript
// ❌ 渲染进程直连 OpenRouter
await fetch('https://openrouter.ai/api/v1/chat/completions', ...);

// ❌ 在业务代码里硬编码 prompt
const system = '你是交易助手，请推荐一只股票...';

// ❌ 把 API Key 存 localStorage / SQLite
localStorage.setItem('openrouter_key', key);

// ❌ 渲染进程调用通用 llm.complete 并传入任意 promptId
await window.desktop.llm.complete({ promptId: 'anything', variables: {} });
```

---

## 7. 配置与密钥

### 7.1 配置优先级

```text
1. prompts/*.prompt.md 中的 model / temperature（任务级）
2. userData/config/llm.json（用户可选覆盖，如关闭 AI 功能）
3. 默认 config/llm.defaults.json（仓库内，模型 fallback 链）
4. 环境变量 OPENROUTER_API_KEY（仅开发 / CI 脚本）
```

### 7.2 密钥存储

| 环境           | 存储位置                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| 桌面应用运行时 | OS 凭据仓库（`keytar` 或 Electron `safeStorage` 封装），key：`llm/openrouter` |
| 本地开发       | `electron-builder.env` 或 `.env.local`（已在 `.gitignore`）                   |
| GitHub Actions | Repository Secrets（仅 `scripts/release` 等 CI 脚本）                         |

**禁止**写入 SQLite、`provider_connections` 或前端 localStorage。

### 7.3 默认模型策略（与发布脚本对齐）

```json
{
  "defaultModel": "~deepseek/deepseek-v4-flash-latest",
  "fallbackModels": ["deepseek/deepseek-v4-flash-0731", "qwen/qwen-plus", "qwen/qwen3-32b"],
  "timeoutMs": 60000,
  "maxRetries": 2
}
```

---

## 8. LlmRunner 行为契约

### 8.1 单次调用流程

```text
run(promptId, variables)
  → PromptLoader.load(promptId)        # 读 frontmatter + 渲染模板
  → validateVariables(schema)          # Zod
  → CredentialStore.getApiKey()        # 无 key 则抛 LlmNotConfiguredError
  → LlmClient.complete(messages, opts) # Provider + fallback + 重试
  → [optional] outputPolicy.check()    # 合规
  → 返回 LlmCompletionResult
```

### 8.2 返回结构

```typescript
interface LlmCompletionResult {
  content: string;
  promptId: PromptId;
  promptVersion: number;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}
```

### 8.3 错误类型

| 错误                      | 含义                   | UI 建议                    |
| ------------------------- | ---------------------- | -------------------------- |
| `LlmNotConfiguredError`   | 未配置 API Key         | 设置页引导配置             |
| `LlmProviderError`        | 上游 4xx/5xx           | 重试 + 降级文案            |
| `LlmValidationError`      | 变量或 JSON 输出不合规 | 开发期暴露，生产期 generic |
| `LlmPolicyViolationError` | 输出含禁语             | 丢弃并提示人工填写         |

### 8.4 日志与隐私

- 日志只记录 `promptId`、`version`、`model`、token 用量、耗时；**默认不记录**完整 user 内容。
- 调试模式（设置页开关）可在本地写 redacted 日志文件，默认关闭。

---

## 9. 与产品功能的映射（首批 Prompt）

| PromptId               | 场景                 | 阶段 | 输入                | 输出              |
| ---------------------- | -------------------- | ---- | ------------------- | ----------------- |
| `release.notes`        | 发布更新说明         | 已有 | git commits         | Markdown 更新日志 |
| `review.summarize`     | 单笔复盘 AI 草稿     | P2   | 回合事实 + 用户五问 | 结构化 Markdown   |
| `journal.weekly-draft` | 周报草稿             | P2   | 周期统计 + 交易列表 | 周报 Markdown     |
| `plan.checklist-hints` | 激活计划前的规则提示 | P2   | 相关 PlaybookRule   | 3–7 条检查项文案  |
| `import.column-guess`  | CSV 列映射猜测       | P1   | 表头 + 样例行       | JSON 映射建议     |

所有面向交易的 prompt 必须引用 `_shared/safety.system`。

---

## 10. 测试策略

```text
tests/llm/
  ├── prompt-loader.test.ts    # 变量渲染、partial、frontmatter 解析
  ├── llm-runner.test.ts       # 注入 MockProvider
  └── fixtures/prompts/        # 最小 prompt 样例
```

- CI **默认不调用** OpenRouter（MockProvider 返回 fixture）。
- 可选 workflow `llm-smoke.yml`：手动触发，用 Secret 跑一条 `release.notes` 冒烟。

---

## 11. 开发检查清单

新增/修改 AI 功能时：

- [ ] 在 `src/prompts/` 新增或更新 `.prompt.md`，`version` 已递增
- [ ] 在 `PROMPT_IDS` 与 Zod schema 注册
- [ ] 业务逻辑在 `service/` 调用 `llmRunner`，不在 renderer 拼 prompt
- [ ] 渲染进程只暴露语义化 ServiceContract 方法
- [ ] 确认未写入买卖建议；必要时加 `output-policy` 关键词检测
- [ ] 单元测试使用 `MockProvider`
- [ ] 更新本文档 §9 映射表

---

## 12. 实施分期（确认后执行）

### Phase 0 — 基础设施（约 2–3 天）

- [x] `service/llm` 模块：`OpenRouterProvider`、`MockProvider`、`LlmRunner`、`PromptLoader`
- [x] `prompts/` 目录与 `_shared/safety.system.md`
- [x] 凭据读写封装（开发 env + userData 文件）
- [x] 迁移 `scripts/release.mjs` 使用 `LlmRunner` + `release.notes` prompt

### Phase 1 — 运行时接入

- [x] `ServiceContract` 增加 `reviews.generateAiDraft` 与 `settings.*`
- [x] 设置页：API Key 配置、测试连接
- [x] 首个业务：`reviews.generateAiDraft`（复盘页 AI 草稿）

### Phase 2 — 体验增强

- [ ] 流式输出 IPC
- [ ] Prompt 调试面板（仅 dev 构建）
- [ ] 用量统计与 token 预算

---

## 14. 为什么不是「一个 Hook / 工具类走天下」？

可以要 Hook 和工具类，但**不能只在渲染进程放一个 `useLlm()` 或 `LlmUtil.call()` 就完事**——这是 Electron 桌面应用的架构约束，不是故意绕远路。

### 14.1 渲染进程里的 Hook / 工具类做不到的事

| 能力                       | 渲染进程 Hook/工具类 | 后台 Service |
| -------------------------- | -------------------- | ------------ |
| 调用 OpenRouter            | ❌ 沙箱无任意网络    | ✅           |
| 读取 API Key               | ❌ 不能碰凭据仓库    | ✅           |
| 访问 SQLite 组上下文       | ❌ 必须 IPC          | ✅           |
| 统一重试 / fallback / 合规 | 若直连则每处重复     | ✅ 一处实现  |

若在 `renderer` 写：

```typescript
// ❌ 架构上不可行
export function useLlm() {
  return useMutation(() => fetch('https://openrouter.ai/...'));
}
```

等于把 Key 和网络打进前端 bundle，**违反**现有安全边界和产品「密钥不进 SQLite / 不进前端」原则。

### 14.2 实际分层：Hook / 工具类放在哪一层

```text
┌─────────────────────────────────────────────────────────┐
│  renderer                                                │
│    useReviewAiDraft()     ← React Hook（你要的 Hook）     │
│    aiClient.generate...() ← 薄工具类，封装 window.desktop │
├─────────────────────────────────────────────────────────┤
│  preload + IPC + ServiceContract                         │
├─────────────────────────────────────────────────────────┤
│  service                                                 │
│    ReviewAiService        ← 业务工具类                    │
│    LlmRunner              ← 通用 AI 工具类（核心）        │
│    OpenRouterProvider                                     │
└─────────────────────────────────────────────────────────┘
```

**结论**

- **`LlmRunner` 本身就是工具类**，只是运行在 Utility Process，不是 React 里那个进程。
- **Hook 应该有**，但只做 UI 状态（loading / error / 重试），底层仍调 `window.desktop.*`。
- **不要**在 renderer 放「万能 `useLlm(promptId)`」；要放 **`useReviewAiDraft(reviewId)`** 这类与页面绑定的 Hook。

### 14.3 推荐的三层使用形态（兼顾方便与安全）

#### A. 后台：`LlmRunner` 工具类（service 内通用）

```typescript
// 任意 service 模块、scripts/release.mjs 都能用
await llmRunner.run(PROMPT_IDS.REVIEW_SUMMARIZE, variables);
```

#### B. 前端：`aiClient` 薄工具类（可选，统一 IPC 调用）

```typescript
// src/renderer/lib/ai/ai-client.ts
export const aiClient = {
  generateReviewDraft(reviewId: string) {
    return window.desktop.reviews.generateAiDraft(reviewId);
  },
  testConnection() {
    return window.desktop.settings.testLlmConnection();
  },
};
```

#### C. 前端：`useXxxAi` Hook（组件里最顺手）

```typescript
// src/renderer/hooks/useReviewAiDraft.ts
export function useReviewAiDraft(reviewId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      return await aiClient.generateReviewDraft(reviewId);
    } catch (e) {
      setError(toAiErrorMessage(e)); // 统一：未配置 Key / 网络失败
      throw e;
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  return { generate, loading, error };
}
```

组件里就变成：

```typescript
const { generate, loading, error } = useReviewAiDraft(reviewId);

<Button loading={loading} onClick={() => void generate()}>AI 草稿</Button>
{error && <Alert type="warning">{error}</Alert>}
```

### 14.4 为什么不提供「通用 `useLlm(promptId, vars)`」？

| 通用 Hook                          | 问题                                                     |
| ---------------------------------- | -------------------------------------------------------- |
| `useLlm('review.summarize', vars)` | UI 可传任意 promptId，难审计、难控 token、易绕过产品合规 |
| 变量从哪来                         | 复盘变量要查 DB，Hook 里写 SQL/IPC 组装会膨胀            |
| 测试                               | 业务 Hook 测 UI 状态；`LlmRunner` 测 AI 逻辑，职责清晰   |

**折中**：内部可以有一个 **dev-only** 的 `useLlmDebug`（仅开发构建），不对生产页面暴露。

### 14.5 与「连接器模式」一致

行情、CSV、AI 都走同一套路：

```text
Connector / LlmRunner  →  管外部 API + 重试 + 密钥
XxxService             →  管领域数据 + 调 Runner
window.desktop.xxx     →  管 IPC 边界
useXxx Hook            →  管 React 状态
```

这样「方便使用」体现在 **Hook + aiClient**，「正确实现」沉淀在 **LlmRunner + prompts/**，两层不冲突。

---

## 15. 待你确认的问题

1. **Prompt 文件格式**：是否同意 `.prompt.md` + YAML frontmatter + `## system` / `## user` 分段？
2. **渲染进程 API**：是否同意**不提供**通用 `llm.complete`，只暴露业务方法（如 `reviews.generateAiDraft`）？
3. **模板引擎**：首版轻量 `{{var}}` + partial 是否够用，还是倾向 Mustache/Handlebars 依赖？
4. **密钥存储**：桌面端优先 `keytar`（跨平台）还是 Electron `safeStorage`（更简单）？
5. **Phase 0 范围**：是否先落地基础设施 + 迁移发布脚本，业务 AI 等功能后续再做？
6. **前端形态**：是否同意采用 **`aiClient` 工具类 + 业务 Hook（如 `useReviewAiDraft`）**，而不是通用 `useLlm(promptId)`？
