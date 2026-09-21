# Birthday Interactive

一个纯前端、浏览器本地处理的生日主题摄像头手势互动体验。

## 公网访问

当前版本通过 GitHub Pages 自动发布：

`https://bonniechantt.github.io/cv_happy_birthday/`

每次推送到 `main` 分支后，GitHub Actions 会自动构建并更新网页。

## 运行

```bash
npm install
npm run dev
```

然后打开 `http://127.0.0.1:5173`。如果你的系统能正常解析 localhost，也可以打开 `http://localhost:5173`。浏览器需要在 `localhost` 或 HTTPS 环境下，才能申请摄像头权限。第一次点击 `Begin` 后才会请求权限。手势识别使用 MediaPipe 官方 Gesture Recognizer，模型和 WASM 运行库都随项目本地打包。

## 手机远程访问

如果手机和电脑不在同一个 Wi-Fi，可在电脑项目目录启动临时 HTTPS 隧道：

```bash
cloudflared tunnel --url http://localhost:5173
```

终端会显示一个 `https://……trycloudflare.com` 地址，用手机 Safari 打开这个地址即可。电脑上的 `npm run dev` 和隧道终端都要保持运行；这个地址是临时的，隧道关闭后会失效。摄像头和麦克风仍由手机浏览器本地处理，不会上传到网页代码中。

## 互动

- 同一只手先让食指尖和拇指尖靠近，再把两根手指张开。只有检测到“靠近 → 明显张开”的变化时，才会生成一个新的长方形蛋糕图案。
- 张开保持期间，蛋糕会跟随食指尖和拇指尖移动、旋转和缩放；手势消失后，蛋糕停留在最后位置。
- 再次把两根手指靠近并张开，会生成下一个蛋糕；按 `R` 可清空全部蛋糕。
- 蛋糕手势优先级高于 Point Up：蛋糕生成或拖拽期间不会生成气球；蛋糕手势结束后，Point Up 需要重新持续 300ms 才会重新生效。
- 做出严格的 `Pointing_Up`（食指明显朝上、其他手指收起）并持续 300ms 后，会在食指尖位置生成一只随机大小的完整气球。手指保持指向时，每隔 1 秒最多生成一只；已生成的气球不会跟随手指移动，但会在原地做轻微自然浮动，也不会带独立长绳。
- 左手保持 `Open_Palm`，沿真实世界方向连续向右滑动约 200ms，会隐藏所有蛋糕蜡烛火焰，同时让当前气球碎片向四周发散 500ms，再匀速带弧度下坠 1500ms，最后渐隐 600ms 后消失；向左滑动约 200ms，会重新显示火焰，但不会恢复已经消失的气球。Open Palm 允许短暂识别丢帧；一次滑动只触发一次，手掌收回后才能再次触发。
- 本次气球爆破进入最后的渐隐阶段后，画面上方居中会自动淡入用户提供的原图 `HAPPY BIRTHDAY` 字样。文字在爆破开始渐隐 100ms 后出现；网页加载时会抠除原图深灰背景并保留粉色立体高光，抠图结果会缓存复用；按 `R` 重置时一并清除。

开发调试默认关闭：正常打开 `http://localhost:5173/` 不显示手部骨架和调试面板；在地址后加 `?debug=true` 可开启调试。调试面板会显示 `idle / closed / open` 阶段，方便确认是否先完成了捏合。

- `C`：模拟生成一个蛋糕
- `B`：模拟生成一只气球
- `R`：重置

调试面板还会显示手势是否 active、已生成蛋糕数量与 MediaPipe 模型标签。

## 参数

主要阈值集中在 `src/config/interactionConfig.ts`：点按冷却、手势稳定、手部追踪频率等参数均可从这里调整。

## 目录

- `src/tracking/`：MediaPipe Gesture Recognizer 与交互手势稳定器
- `src/effects/`：Canvas 蛋糕照片与气球绘制
- `public/assets/pink-ribbon-cake-cutout.png`：透明底立体蛋糕素材
- `src/state/`：生日状态机
- `src/components/`：摄像头视图与调试面板
