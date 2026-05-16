# Momo API / Sync Skeleton

这是路线图 BE-02 / BE-03 前的最小 TypeScript 服务骨架，用于把共享 sync contract 接到可测试的服务层。

当前范围：

- 不启动 HTTP server。
- 不接 OIDC、PostgreSQL、Redis、WebSocket 或生产环境。
- 只提供纯函数式 `createSyncApi()` 与 `createInMemorySyncStore()`，方便先验证 delta push / pull 语义。
- 后续接真实 API/Gateway 时，应保持 contract 不变，替换存储与认证边界。

验证：

```bash
.\apps\desktop\node_modules\.bin\tsc.cmd -p apps\api\tsconfig.json
```
