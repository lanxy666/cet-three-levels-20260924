# 三档词汇 PWA

中文输入 → 日常版 / 四级版 / 六级版英文表达。

- `index.html`：应用主页面
- `data.js`：离线三档词库与反查索引
- `app.js`：查询、语音、朗读、收藏和历史
- `sw.js`：离线缓存
- `manifest.webmanifest`：主屏幕安装信息

部署时必须保持这些文件在同一目录，并让 `index.html` 位于网站根目录。
