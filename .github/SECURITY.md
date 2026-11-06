# 密钥与问题反馈

- 高德 Key 由每位用户自行填写。EXE 保存在本机用户配置中；源码版使用 `.env` 或服务器环境变量。公开源码、安装包与示例配置均不包含作者的 Key。
- 不把 `.env`、`.dev.vars`、截图中的 Key、完整供应商请求 URL 或调试日志提交到仓库。
- 发布使用白名单扫描和打包命令。`.gitignore` 只保护未跟踪文件，不能从历史提交中撤回已经泄漏的秘密。
- 不向项目维护者提交自己的 Key。反馈错误时提供脱敏的错误码、操作步骤、Node 版本和运行方式即可。
- 本项目没有账户和完备的公众服务防滥用机制；部署者承担自己服务器和 Key 的额度管理。
- 发现密钥已经公开时，先在供应商控制台撤销/更换，然后按 [GitHub 敏感信息清理指南](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) 清理文件及历史。

若仓库启用了 GitHub 的私有漏洞报告功能，可用其报告安全问题；否则先私下联系仓库维护者。不要在公开 Issue 中发布可用的 Key 或漏洞利用所需的敏感数据。
