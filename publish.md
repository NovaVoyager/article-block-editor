# npm 发布与更新

## npm 发布

本包以 `@nova_voyager/article-block-editor` 公开发布到 npm，许可证为 MIT。首次发布时使用有该包发布权限的账号。

```bash
npm test
npm run test:package
npm pack --dry-run
npm login
npm publish --access public
```

`npm publish` 会触发 `prepublishOnly`，运行组件测试和独立项目安装验证。`prepack` 会重新构建组件库及类型声明。发布包包含 `dist/`、`docs/`、README、LICENSE 和包清单。

## npm 更新流程

### 维护者发布新版本

在编辑器仓库根目录提交本次改动，确认 Git 工作区干净。安装锁定的依赖，再核对本地版本和 npm 上的 `latest` 版本。

```bash
npm ci
npm pkg get version
npm view @nova_voyager/article-block-editor@latest version --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
```

使用有发布权限的 npm 账号。若 `npm whoami` 提示未登录，先运行 `npm login --registry=https://registry.npmjs.org`。

按改动选择一个尚未发布的版本号。修复问题用 `patch`，新增兼容功能用 `minor`，不兼容变更用 `major`。下面以新增卡片功能为例，`npm version minor` 会更新 `package.json` 和 `package-lock.json`，并默认创建版本提交和 Git 标签。[npm version 文档](https://docs.npmjs.com/cli/v11/commands/npm-version/)

```bash
npm version minor
npm publish --access public
```

发布成功后，核对 `latest` 与刚生成的版本号一致，再将版本提交和标签推送到远端。

```bash
npm view @nova_voyager/article-block-editor@latest version --registry=https://registry.npmjs.org
git push --follow-tags
```

### 业务项目升级依赖

在使用编辑器的项目根目录执行下列命令。`npm ls` 显示该项目实际安装的版本。

```bash
npm install @nova_voyager/article-block-editor@latest
npm ls @nova_voyager/article-block-editor --depth=0
```

运行该项目的测试和构建，再提交更新后的依赖清单和锁文件。如果项目需要固定版本，将 `@latest` 替换为已发布的具体版本号，并添加 `--save-exact`。[npm install 文档](https://docs.npmjs.com/cli/v11/commands/npm-install/)
