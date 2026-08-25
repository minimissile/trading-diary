# 注释规范

本规范适用于 `src/` 下所有 TypeScript / TSX 源码。注释语言统一使用**简体中文**，
格式统一使用 **JSDoc**（`/** */`）。

## 基本原则

1. **注释解释「为什么」和「边界」**，不重复代码字面含义。
2. **类型信息交给 TypeScript**，JSDoc 中不写 `{string}` 等类型标注。
3. **导出符号必须注释**；模块内部私有符号仅在逻辑非显而易见时补充注释。
4. **首句以句号结尾**，语气简洁、陈述事实，避免「该方法用于…」等冗余前缀。

## 函数

块注释放在函数声明正上方，包含一句功能摘要；有参数、返回值或可能抛错时补充对应标签。

```typescript
/**
 * 注册 IPC 处理程序。
 * @param window 主窗口
 * @param service 服务主机
 * @param updater 更新管理器
 * @returns 注销已注册处理程序与订阅的清理函数
 */
export function registerIpcHandlers(window: BrowserWindow, service: ServiceHost, updater: UpdateManager): () => void {
  // ...
}
```

| 标签               | 何时使用                                   |
| ------------------ | ------------------------------------------ |
| `@param 名称 说明` | 每个参数一行；说明描述职责或约束，不写类型 |
| `@returns 说明`    | 返回值含义非函数名所能表达时               |
| `@throws 说明`     | 函数会主动 `throw`，且调用方需要知晓时     |

参数名与函数签名保持一致；无参数时可省略 `@param`，无返回值时可省略 `@returns`。

## 类

类注释说明职责、生命周期或关键约束；公开方法按需补充 `@param` / `@returns`。

```typescript
/**
 * 管理 electron-updater 生命周期，并向 IPC 层提供与框架无关的更新状态。
 * 开发环境或未写入 app-update.yml 的本地包会保持禁用，不会访问网络。
 */
export class UpdateManager {
  /** 启动更新检查与事件监听，重复调用无效。 */
  start(): void {
    // ...
  }
}
```

- 类级注释：多行时每行以 `*` 开头，内容连贯成段。
- 单行即可说清的方法，可用单行块注释 `/** … */`。
- 私有成员仅在实现细节不直观时注释。

## 接口、类型别名与枚举

对外暴露的数据结构需说明语义；字段名已足够清晰时可只注释整体。

```typescript
/** 自动更新模块对渲染进程公开的稳定状态，避免暴露 electron-updater 对象。 */
export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  downloadPercent: number | null;
  message: string | null;
}
```

字段含义不明显时，在字段上方单独注释：

```typescript
export interface HealthResult {
  /** 后台 Utility Process 的进程 ID。 */
  servicePid: number;
  startedAt: string;
}
```

`type` 别名与 `enum` 遵循相同规则。

## React 组件

- **导出组件**：块注释说明页面/组件职责。
- **Props 接口**：接口级注释；个别 prop 含义不直观时补充字段注释。
- 纯展示、名称自解释的组件可省略组件级注释，但 **export 的 Props 接口仍建议保留一句说明**。

```typescript
/** 展示运行时健康状态与资产统计指标。 */
export function MetricsGrid({ health, stats }: MetricsGridProps): React.JSX.Element {
  // ...
}

/** MetricsGrid 所需的后台快照数据。 */
interface MetricsGridProps {
  health: HealthResult;
  stats: AssetStats;
}
```

## 常量与模块级变量

- 魔法数字、协议名、配置键等需注释含义或单位。
- 名称已自解释的常量（如 `START_TIMEOUT_MS`）可省略。

```typescript
/** IPC 请求默认超时（毫秒）。 */
const REQUEST_TIMEOUT_MS = 30_000;
```

## 行内注释

使用 `//`，仅用于：

- 非显而易见的业务规则或安全边界；
- 平台/框架相关的非常规写法及原因；
- 有意为之的妥协（性能、兼容性、Electron 限制等）。

```typescript
// Sharp 会加载原生 .node 模块。在 macOS 上启用此项后，Electron 会选择
// 具备相应签名权限的 Plugin Helper 来运行后台服务。
allowLoadingUnsignedLibraries: process.platform === 'darwin',
```

**不要**用行内注释描述「正在做什么」的每一步操作。

## 不需要注释的情况

- 私有辅助函数，且函数名与实现已足够清晰；
- 测试文件中 Arrange / Act / Assert 等结构性代码；
- 纯 re-export 的 barrel 文件；
- 仅为满足 linter 而写的无信息注释。

## 格式要求

- 块注释使用 `/**` 开头、` */` 结尾，内部每行以 `*` 开头（单行注释除外）。
- `@param`、`@returns`、`@throws` 与摘要之间不空行。
- 注释与下方代码之间保留一个空行（Prettier 默认行为）。

## 参考示例

项目中已有符合本规范的示例：

- `src/main/ipc.ts` — 导出函数与 `@param`
- `src/main/updater/update-manager.ts` — 类级多行注释
- `src/shared/api.types.ts` — 接口单行注释
- `src/main/service-host.ts` — 行内技术说明注释
