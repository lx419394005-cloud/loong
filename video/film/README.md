# 小方块 · 演绎视频（成片工程）

按 `../concept.md` 的最终方案，用代码生成的 22.5 秒竖版演绎视频（+1 秒片尾停留）：

- `src/cube.js`：three.js 做的 3D 小方块（切角磨砂外壳、内部 LED 透光、闪粉款、USB-C 线上的光脉冲）
- `src/main.js`：12 小节的全部画面，`renderAt(t)` 按时间直接算出每一帧
- `music.py`：128 BPM 配乐和音效，全部用 numpy 合成，和画面逐拍对齐
- `render.mjs`：用无头 Chromium 逐帧截图
- `build.sh`：一键出片，输出 `out/xiaofangkuai.mp4`

```bash
./build.sh                       # 完整出片
node render.mjs --stills 5,9.5   # 只渲染几帧静帧检查
```

依赖：Node 22、Playwright 自带的 Chromium、Python 3（numpy、scipy）、ffmpeg。

界面里的微信、小红书、Claude、Codex 都是简化重绘的示意界面，头像统一模糊处理，笔记标题和数据是虚构的。
