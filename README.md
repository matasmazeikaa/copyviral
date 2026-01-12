## Overview

CopyViral is an AI-powered video editor that helps you copy viral video styles and recreate trending content. Built with Next.js, Remotion for real-time preview, and FFmpeg (WebAssembly) for high-quality rendering.

## Features

- 🤖 AI Reference Copy: Analyze viral videos and automatically copy their cuts, pacing, and style
- 🎞️ Real-time Preview: See immediate previews of edits
- 🧰 Render with FFmpeg: High-quality export up to 1080p
- 🕹️ Interactive Timeline Editor: Precisely arrange, trim, and control media
- ✂️ Element Utilities: Easily split, duplicate, and manage media layers
- 🖼️ Flexible Media Support: Import videos, audio, images, and text seamlessly
- 🛠️ Advanced Controls: Adjust position, opacity, z-index, and volume per element
- ⌨️ Keyboard Shortcuts: Quick actions for play, mute, split, duplicate, etc.

![Alt Text](/images/image.png)

## Installation

Clone the repo, install dependencies:

```bash
npm install
```
Then run the development server:
```bash
npm run dev
```
Or build and start in production mode:

```bash
npm run build
npm start
```

Alternatively, use Docker:

```bash
# Build the Docker image
docker build -t copyviral .

# Run the container
docker run -p 3000:3000 copyviral
```
Then navigate to [http://localhost:3000](http://localhost:3000)

## TODOs

Prioritized tasks are listed in [TODO.md](./TODO.md). 

contributions are welcomed!
