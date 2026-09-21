# Birthday Interactive

一个纯前端、浏览器本地处理的生日主题摄像头手势互动体验。

## 运行

```bash
npm install
npm run dev
```

然后打开 `http://127.0.0.1:5173`。如果你的系统能正常解析 localhost，也可以打开 `http://localhost:5173`。浏览器需要在 `localhost` 或 HTTPS 环境下，才能申请摄像头和麦克风权限。第一次点击 `Begin` 后才会请求权限。手势识别模型随项目本地打包，WASM 运行库从 MediaPipe 官方 CDN 加载。

## 手机远程访问

如果手机和电脑不在同一个 Wi-Fi，可在电脑项目目录启动临时 HTTPS 隧道：

```bash
cloudflared tunnel --url http://localhost:5173
```

终端会显示一个 `https://……trycloudflare.com` 地址，用手机 Safari 打开这个地址即可。电脑上的 `npm run dev` 和隧道终端都要保持运行；这个地址是临时的，隧道关闭后会失效。摄像头和麦克风仍由手机浏览器本地处理，不会上传到网页代码中。

## 互动

- 伸出食指、收起其他手指，进入 Point 手势一次，会以指尖位置为实际锚点生成一个气球或几条短缎带；每个区域有容量限制，连续触发会逐步填充画面而不是堆在指尖。
- 已出现的气球与缎带会持续留在画面中，直到重置体验；庆祝阶段气球被吹爆后才会离场。
- 两手同时出现，从靠近状态向左右拉开并保持，会在掌心中点出现蛋糕。
- 蛋糕出现后等待约 2 秒，再对着麦克风持续吹气，火焰会先弯曲反馈，达到阈值后熄灭并触发 Celebration。

开发调试：打开 `http://localhost:5173/?debug=true`。

- `P`：模拟 Point
- `C`：模拟 Cake Gesture
- `B`：模拟 Blow
- `R`：重置

调试面板还会显示 active zones、各区域 density、最近一次 cluster template 与 cluster count。

## 参数

主要阈值集中在 `src/config/interactionConfig.ts`：点按冷却、双手距离、拉开保持时间、吹气 RMS / 高频比例与持续时间均可从这里调整。

## 目录

- `src/tracking/`：MediaPipe Hand Landmarker 与手势稳定器
- `src/audio/`：Web Audio API 吹气检测
- `src/effects/`：Canvas 气球、彩带、蛋糕、蜡烛与银色镜面圆片
- `src/state/`：生日状态机
- `src/components/`：摄像头视图与调试面板
