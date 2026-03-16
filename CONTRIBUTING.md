# Contributing to React Native Web Playground

First off, thank you for considering contributing! 🎉 Every contribution — whether it's a bug fix, a new feature, documentation improvement, or even a typo fix — is appreciated.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Commit Conventions](#commit-conventions)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Style Guide](#style-guide)
- [Community](#community)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behaviour to the project maintainers.

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.0.0
- **npm** (comes with Node.js)
- **macOS** (required for the iOS Simulator bridge)
- **Xcode** with iOS Simulator (for running the sim-bridge)

### Fork & Clone

```bash
# 1. Fork the repo on GitHub

# 2. Clone your fork
git clone https://github.com/<your-username>/rn_prototype1.git
cd rn_prototype1

# 3. Add the upstream remote
git remote add upstream https://github.com/Gravattack/rn_prototype1.git

# 4. Install dependencies
npm install
```

### Running Locally

```bash
# Start the Next.js dev server (Web UI)
npm run dev

# In a separate terminal — start the sim-bridge (requires macOS + Xcode)
cd packages/runner
npm run dev
```

The web UI will be available at [*](*).

## Project Structure

```
playground/
├── app/                  # Next.js App Router pages & API routes
├── apps/
│   └── native/           # Expo/React Native project (synced from web)
├── components/           # React components (Editor, Preview, Console, etc.)
├── lib/                  # Core libraries
│   ├── bundler/          # Babel transformer
│   ├── native/           # Native device management
│   ├── persistence/      # Share / URL persistence
│   ├── runtime/          # RN web runtime & executor
│   ├── state/            # State management
│   ├── stubs/            # Native API stubs
│   └── templates/        # Default project templates
├── packages/
│   └── runner/           # sim-bridge CLI (published to npm)
├── docs/                 # Project documentation
├── public/               # Static assets
└── scripts/              # Build & sync scripts
```

## Development Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
   Use prefixes: `feature/`, `fix/`, `docs/`, `refactor/`, `chore/`.

2. **Make your changes** — keep commits small and focused.

3. **Run the linter and formatter** before committing:
   ```bash
   npm run lint
   npm run format:check
   ```

4. **Type-check** your code:
   ```bash
   npm run type-check
   ```

5. **Test** your changes locally by running the dev server and verifying in the browser.

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

**Examples**:
```
feat(editor): add multi-file tab support
fix(sim-bridge): handle simulator crash gracefully
docs(readme): update installation instructions
```

## Submitting a Pull Request

1. **Push** your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** against the `main` branch of the upstream repo.

3. **Fill out the PR template** — describe your changes, link any related issues.

4. **Wait for review** — a maintainer will review your PR. Be responsive to feedback.

### PR Checklist

- [ ] My code follows the code style of this project
- [ ] I have run `npm run lint` and `npm run format:check` with no errors
- [ ] I have run `npm run type-check` with no errors
- [ ] I have updated documentation if needed
- [ ] My changes don't introduce any new warnings

## Reporting Bugs

Use the [Bug Report](https://github.com/Gravattack/rn_prototype1/issues/new?template=bug_report.md) issue template. Include:

- Steps to reproduce
- Expected vs. actual behaviour
- Environment details (OS, Node version, browser)
- Screenshots or logs if applicable

## Requesting Features

Use the [Feature Request](https://github.com/Gravattack/rn_prototype1/issues/new?template=feature_request.md) issue template. Describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Style Guide

- **Formatter**: [Prettier](https://prettier.io/) — config in `prettier.config.js`
- **Linter**: [ESLint](https://eslint.org/) — config in `eslint.config.mjs`
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS
- **Imports**: Use absolute paths from the project root when possible

Run `npm run format` to auto-format your code before committing.

## Community

- 💬 Open a [Discussion](https://github.com/Gravattack/rn_prototype1/discussions) for questions or ideas
- 🐛 File an [Issue](https://github.com/Gravattack/rn_prototype1/issues) for bugs or feature requests
- ⭐ Star the repo if you find it useful!

---

Thank you for helping make React Native Web Playground better! 🚀
