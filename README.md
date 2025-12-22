# Stream Deck Krisp Toggle Plugin

Control Discord Krisp noise suppression directly from your Elgato Stream Deck.

![Stream Deck Krisp Toggle](https://img.shields.io/badge/Stream%20Deck-Plugin-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)

## Features

- 🎛️ **One-Click Toggle**: Turn Krisp on/off with a single button press
- 🔄 **Live Status Updates**: Button reflects current Krisp state in real-time
- ⚡ **Fast Response**: Sub-200ms toggle time with optimistic UI updates
- 🛡️ **Spam Protection**: Intelligent debouncing prevents accidental double-toggles
- 📊 **Status Indicators**: Live Discord connection and plugin status in settings

## Preview

[Add screenshots here of your Stream Deck button in both states]

## Requirements

### Prerequisites
1. **Elgato Stream Deck** (any model)
2. **Discord Desktop** with [Vencord](https://vencord.dev/) installed
3. **Vencord Krisp Toggle Plugin** - [Get it here](https://github.com/CaviarTheCatgirl/vencord-krisp-toggle)

## Installation

### Method 1: Direct Download (Recommended)

1. Download the latest `.streamDeckPlugin` file from [Releases](https://github.com/CaviarTheCatgirl/streamdeck-krisp-toggle/releases)
2. Double-click the downloaded file
3. Stream Deck software will automatically install the plugin
4. The "Krisp Toggle" action will appear in your Stream Deck actions list

### Method 2: Manual Installation

1. Download and extract the latest release
2. Copy the `com.caviarthecatgirl.krisp-toggle.sdPlugin` folder to:
   - **Windows**: `%APPDATA%\Elgato\StreamDeck\Plugins\`
   - **macOS**: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
3. Restart Stream Deck software

## Setup

1. **Install Vencord Plugin First**:
   - Follow the [Vencord Krisp Toggle setup guide](https://github.com/CaviarTheCatgirl/vencord-krisp-toggle)
   - Make sure Discord is running and the plugin is enabled

2. **Add to Stream Deck**:
   - Drag "Krisp Toggle" from the actions list to a button
   - The button will automatically connect to Discord

3. **Verify Connection**:
   - Right-click the button → Edit
   - Check the status indicators:
     - ✅ Discord Online + Plugin Installed = Ready to use!
     - ⚠️ If showing offline, ensure Discord is running

## Usage

### Basic Operation
- **Press once**: Toggle Krisp on/off
- **Button states**:
  - 🟢 **State 1** (Green): Krisp is ON
  - 🔴 **State 0** (Red): Krisp is OFF

### Button Behavior
- Optimistic updates: Button responds instantly, even before Discord confirms
- Auto-sync: Polls Discord every 2 seconds to stay in sync
- Spam protection: Rapid presses are intelligently handled (150ms debounce)

## Troubleshooting

### Button shows alert when pressed
**Cause**: Discord is not running or Vencord plugin is not installed

**Solutions**:
1. Make sure Discord is running
2. Verify Vencord Krisp Toggle plugin is installed and enabled
3. Check plugin settings (right-click button → Edit) for status

### Button state is incorrect
**Cause**: Temporary desync between Stream Deck and Discord

**Solution**: Wait 2-3 seconds for auto-sync, or press the button to force a sync

### Button doesn't respond
**Cause**: HTTP server not running or port blocked

**Solutions**:
1. Restart Discord
2. Check Windows Firewall isn't blocking localhost:37320
3. Verify Stream Deck integration is enabled in Vencord plugin settings

### "Plugin Not Found" in settings
**Cause**: Vencord Krisp Toggle plugin not installed in Discord

**Solution**: Install the [Vencord plugin](https://github.com/CaviarTheCatgirl/vencord-krisp-toggle) first

## Development

### Prerequisites
- Node.js 18+ and npm
- Stream Deck SDK knowledge

### Setup
```bash
# Clone the repository
git clone https://github.com/CaviarTheCatgirl/streamdeck-krisp-toggle.git
cd streamdeck-krisp-toggle

# Install dependencies
npm install

# Build the plugin
npm run build

# Watch for changes (development)
npm run watch
```

### Building Distribution Package
```bash
# Build and create .streamDeckPlugin file
npm run build

# Use Stream Deck Distribution Tool
streamdeck pack ./com.caviarthecatgirl.krisp-toggle.sdPlugin
```

### Project Structure

com.caviarthecatgirl.krisp-toggle/\n
- ├── src/
- │   └── plugin.ts          # Main plugin logic
- ├── manifest.json          # Plugin metadata
- ├── imgs/                  # Button icons
- ├── property-inspector.html # Settings UI
- └── package.json

## Technical Details

### Communication
- **Protocol**: HTTP REST API
- **Port**: 37320 (localhost only)
- **Endpoints**:
  - `GET /health` - Discord online check
  - `GET /plugin-check` - Verify Vencord plugin
  - `POST /toggle` - Toggle Krisp state

### State Management
- Optimistic UI updates for instant feedback
- 2-second polling for state synchronization
- 2.5-second grace period after toggle to prevent flicker
- Automatic state correction on mismatch

### Performance
- Response time: <150ms average
- Debounce: 150ms between toggles
- Polling: 2-second intervals
- State file: Temporary directory, minimal I/O

## API Reference

The plugin communicates with the Vencord plugin via HTTP:
```typescript
// Check Discord is online
GET http://localhost:37320/health
Response: { status: "ok", port: 37320 }

// Check Vencord plugin installed
GET http://localhost:37320/plugin-check
Response: { installed: true }

// Toggle Krisp
POST http://localhost:37320/toggle
Response: { success: true, state: "Krisp" | "None" }
```

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

GPL-3.0-or-later

## Credits

**Created by**: CaviarTheCatgirl

**Related Projects**:
- [Vencord Krisp Toggle](https://github.com/CaviarTheCatgirl/vencord-krisp-toggle) - Required Discord plugin

**Built with**:
- [Elgato Stream Deck SDK](https://developer.elgato.com/documentation/stream-deck/)
- TypeScript
- Node.js

## Support

- 🐛 **Bug Reports**: [Open an issue](https://github.com/CaviarTheCatgirl/streamdeck-krisp-toggle/issues)
- 💡 **Feature Requests**: [Open an issue](https://github.com/CaviarTheCatgirl/streamdeck-krisp-toggle/issues)
- 📖 **Documentation**: [Wiki](https://github.com/CaviarTheCatgirl/streamdeck-krisp-toggle/wiki) (coming soon)

## Changelog

### v1.0.0 (Initial Release)
- ✨ One-click Krisp toggle
- 🔄 Real-time state synchronization
- 🛡️ Smart spam protection with 150ms debounce
- 📊 Live status indicators
- ⚡ Optimistic UI updates
- 🎯 2.5s grace period for stable transitions
