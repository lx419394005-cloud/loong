# 小方块 · 演绎视频（成片工程）

按 `../concept.md` 的最终方案生成的 22.5 秒竖版演绎视频（+1 秒片尾停留）。

画面分三类，最后由 `comp.py` 合成：

| 层 | 怎么做 | 代码 |
|---|---|---|
| 小方块特写、亮灯、片尾 | Blender Cycles 渲染：磨砂透光外壳、内部电路板和 LED、USB-C 线、木纹桌面、景深 | `blender/lib.py` `blender/shots.py` |
| 笔记本 / 手机 | Blender 渲染两张底片，界面按透视贴进屏幕，再做推拉镜头 | `blender/plates.py` + `comp.py` |
| 界面、字幕、Agent 浮窗 | 网页逐帧截图（微信、小红书、调研报告、锁屏等） | `src/main.js` `render.mjs` |
| 配乐和音效 | numpy 合成，128 BPM，逐拍对齐画面 | `music.py` |

```bash
./build.sh                                  # 完整出片 → out/xiaofangkuai.mp4
node render.mjs --mode desk --stills 1,3    # 只看某一层的几张静帧
python3 blender/shots.py end --pct 40 --samples 8 --only 690   # Blender 单帧试渲
```

依赖：Node 22、Playwright 自带的 Chromium、Python 3.13（bpy 5.2、numpy、scipy、opencv-python-headless）、ffmpeg。

`node render.mjs --mode full` 还能渲出早期的 three.js 粗版分镜，用来对节奏。

界面里的微信、小红书、Claude、Codex 都是简化重绘的示意界面，头像统一模糊处理，笔记标题和数据是虚构的。
