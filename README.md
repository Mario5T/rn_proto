# React Native Web Playground

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A web-based React Native playground similar to Expo Snack that allows developers to write, preview, and share React Native code directly in the browser.

## 🚀 Features

- **Monaco Editor**: Full-featured code editor with TypeScript/JSX syntax highlighting
- **iOS Local Mirror**: Real-time streaming of a physical iOS Simulator to your browser
- **Remote Control**: Interact with the local simulator directly from the web UI (tap/swipe)
- **Automatic Booting**: Automatically starts the iOS Simulator if it's not running
- **Instant Sync**: Syncs your web code to a local Expo project automatically
- **File Explorer**: Multi-file project support with folder structure
- **Console**: Real-time logs and errors streamed from the native device

## 🚀 Getting Started

This project consists of two parts: the **Web UI** and the **Local Runner (Sim Bridge)**.

### 1. The Web UI
The frontend is built with Next.js and can be deployed to Vercel. 
- **Production URL**: [Your Vercel URL Here]

### 2. The Local Runner (Sim Bridge)
To see your code running on a real iOS Simulator, you need to run the bridge on your Mac.

```bash
# Start the bridge instantly via npx
npx sim-bridge
```

Once started, enter the **Token** shown in your terminal into the Web UI "Connect" prompt.

## 📋 Project Status

### ✅ Completed
- Automatic Simulator Boot & Readiness Check
- Resilient Screenshot Mirroring (Mirroring the device to browser)
- Bi-directional sync of playground code to local Expo
- Standalone CLI Tool (`sim-bridge`) published to NPM
- Vercel-ready Deployment configuration

- Next.js 14+ with App Router
- TypeScript with strict mode
- ESLint & Prettier configuration
- Three-panel resizable UI layout
- Monaco editor integration
- Basic component structure

### 🚧 Upcoming Phases
- **Phase 2**: Enhanced editor features and project templates
- **Phase 3**: React Native Web runtime integration
- **Phase 4**: Metro-like bundling system
- **Phase 5**: Native API stubs
- **Phase 6**: Persistence and shareable URLs
- **Phase 7**: Security and sandboxing
- **Phase 8**: Native preview (Android emulator)

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Editor**: Monaco Editor
- **Runtime**: React Native Web (planned)
- **Styling**: Tailwind CSS
- **UI Components**: Lucide Icons, react-resizable-panels

## 📦 Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd playground

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🧪 Development Commands

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Type checking
npm run type-check

# Linting
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check
```

## 📁 Project Structure

```
playground/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Main playground page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── PlaygroundLayout.tsx  # Main layout
│   ├── Editor/            # Monaco editor wrapper
│   ├── Preview/           # Preview iframe
│   ├── FileExplorer/      # File tree
│   └── Console/           # Console panel
├── lib/                   # Core libraries
│   ├── bundler/           # Babel transformer (coming)
│   ├── runtime/           # RN web runtime (coming)
│   └── stubs/             # Native API stubs (coming)
├── docs/                  # Documentation
│   └── vision.md          # Project vision & scope
└── public/                # Static assets
```

## 🎯 Supported React Native APIs

See [docs/vision.md](docs/vision.md) for detailed API support classification:

- **Green List**: Fully supported (View, Text, StyleSheet, etc.)
- **Yellow List**: Partially supported with stubs
- **Red List**: Not supported (native modules)

## 🤝 Contributing

We welcome contributions from the community! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Setting up your development environment
- Our coding standards and commit conventions
- The pull request process

See the [open issues](https://github.com/Gravattack/rn_prototype1/issues) for a list of known issues and planned features.

## 📜 Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## 🔒 Security

If you discover a security vulnerability, please see our [Security Policy](SECURITY.md) for responsible disclosure instructions. **Do not open a public issue for security vulnerabilities.**

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

**Note**: This project is in early development. Many features are planned but not yet implemented.
