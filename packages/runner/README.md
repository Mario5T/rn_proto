# 🚀 RN Bridge

`rn-bridge` is a companion tool for the React Native Playground. It allows you to run your code on a physical iOS Simulator on your Mac, while you write code in the web-based editor.

## Features
- **Automatic Simulator Boot**: Detects and boots an iOS Simulator if one isn't already running.
- **Bi-directional Sync**: Syncs code from the browser editor to a local Expo project instantly.
- **Web-based Console**: Streams native logs directly back to your browser.
- **Remote Control**: Tap and swipe the simulator mirror in your browser to interact with the device.

## Prerequisites
- macOS (required for iOS Simulator)
- Xcode (and `xcrun simctl` command line tools)
- Node.js & npm
- Expo CLI (`npm install -g expo-cli`)

## Getting Started

1. **Install Dependencies**:
   ```bash
   # From source
   cd packages/runner
   npm install
   ```

2. **Configure (Optional)**:
   Create a `.env` file in `packages/runner`:
   ```env
   RUNNER_PORT=3001
   RUNNER_STORAGE_PATH=~/.rn-playground
   NATIVE_APP_PATH=../../apps/native
   ```

3. **Start the Runner**:
   ```bash
   # Using dev mode
   npm run dev
   
   # Or using the built CLI directly
   npm run build
   node dist/index.js --port 3001
   ```

4. **Connect to Playground**:
   - Open your deployed Playground UI.
   - Enter the **Token** shown in your terminal when prompted.

## CLI Usage

If installed globally or via npx:
```bash
rn-bridge --port 8080 --storage ~/my-sessions --native ./my-expo-app
```

| Option | Shortcut | Description | Default |
| :--- | :--- | :--- | :--- |
| `--port` | `-p` | Port to listen on | `3001` |
| `--storage` | `-s` | Custom session storage path | `~/.rn-playground` |
| `--native` | `-n` | Path to your native Expo project | `../../apps/native` |

## Publishing to NPM

To make this available to others via `npx`:
1. Ensure you have an NPM account.
2. Run `npm login`.
3. Update the `name` in `package.json` to something unique if `rn-bridge` is taken.
4. Run `npm publish --access public`.

Now anyone can run it with:
```bash
npx rn-bridge
```

## How it Works
The runner acts as a local bridge. When you click **Run** in the browser, the editor sends your code to this runner. The runner then:
1. Ensures a simulator is booted.
2. Writes the code to a local boilerplate Expo project (`apps/native`).
3. Triggers `expo start --ios` to launch the app.
4. Streams screenshots and logs back to the browser.
