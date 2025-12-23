# tidyf

AI-powered file organizer CLI using [opencode.ai](https://opencode.ai)

```
┌   tidyf
│
◆  Scanning ~/Downloads...
│    Found 12 files
│
◇  Analyzing files with AI...
│
◆  Organization proposal:
│    📄 report-2024.pdf → Documents/Work
│    🖼️  screenshot.png → Images/Screenshots
│    📦 project.zip → Archives
│
◆  What would you like to do?
│  ● Apply all
│  ○ Select individually
│  ○ Cancel
└
```

## Features

- **AI-powered organization** - Uses AI to intelligently categorize files based on name, type, and content
- **Smart categories** - Documents, Images, Videos, Audio, Archives, Code, Applications, and more
- **Watch mode** - Monitor folders and auto-organize new files
- **Interactive CLI** - Beautiful terminal UI with confirmation prompts
- **Customizable rules** - Edit `~/.tidy/rules.md` to customize organization rules
- **Conflict handling** - Smart handling of duplicate files
- **Multiple aliases** - Use `tidyf` or `td`

## Installation

### Prerequisites

- Node.js >= 18.0.0
- [OpenCode](https://opencode.ai) installed and authenticated

#### Install OpenCode

```bash
# npm
npm install -g opencode

# or brew
brew install sst/tap/opencode
```

Then authenticate:

```bash
opencode auth
```

### Install tidyf

```bash
# bun (recommended)
bun install -g tidyfiles

# npm
npm install -g tidyfiles

# pnpm
pnpm install -g tidyfiles

# yarn
yarn global add tidyfiles
```

## Usage

### Organize Files

```bash
# Organize Downloads folder (default)
tidyf

# Organize specific folder
tidyf ~/Desktop

# Dry run (preview only)
tidyf -d

# Skip confirmation prompts
tidyf -y

# Recursive scan
tidyf -r

# Specify target directory
tidyf --target ~/Sorted
```

### Watch Mode

```bash
# Watch configured folders
tidyf watch

# Watch specific folder
tidyf watch ~/Downloads

# Auto-apply without confirmation
tidyf watch --auto

# Queue files for batch review
tidyf watch --queue

# Custom delay before processing (ms)
tidyf watch --delay 5000
```

### Configure

```bash
# Interactive configuration
tidyf config
```

## Configuration

On first run, tidyf creates `~/.tidy/` directory with configuration files:

### `~/.tidy/settings.json` - Settings

```json
{
  "organizer": { "provider": "opencode", "model": "claude-sonnet-4-5" },
  "defaultSource": "~/Downloads",
  "defaultTarget": "~/Documents/Organized",
  "watchEnabled": false,
  "folders": [
    { "sources": ["~/Downloads"], "target": "~/Documents/Organized", "watch": false }
  ],
  "ignore": [".DS_Store", "*.tmp", "*.partial", "*.crdownload"]
}
```

### `~/.tidy/rules.md` - Organization Rules

Controls how AI categorizes files. Default includes:

- **Documents** - PDFs, Word docs, text files, spreadsheets
- **Images** - Photos, screenshots, graphics, icons
- **Videos** - MP4, MOV, AVI, MKV, WEBM
- **Audio** - MP3, WAV, FLAC, AAC
- **Archives** - ZIP, RAR, 7Z, TAR
- **Code** - Source files, project archives
- **Applications** - DMG, PKG, EXE, installers

Edit this file to customize AI behavior for your workflow.

## Commands

| Command | Description |
|---------|-------------|
| `tidyf [path]` | Organize files in path (default: ~/Downloads) |
| `tidyf watch [paths...]` | Watch folders for new files |
| `tidyf config` | Configure models and settings |

## Options

### Organize Options

| Option | Description |
|--------|-------------|
| `-d, --dry-run` | Preview changes without moving files |
| `-y, --yes` | Skip confirmation prompts |
| `-r, --recursive` | Scan subdirectories |
| `-s, --source <path>` | Source directory to organize |
| `-t, --target <path>` | Specify target directory |
| `-m, --model <id>` | Override AI model |
| `-V, --version` | Show version number |
| `-h, --help` | Show help |

### Watch Options

| Option | Description |
|--------|-------------|
| `--auto` | Auto-apply without confirmation |
| `--queue` | Queue files for batch review |
| `--delay <ms>` | Debounce delay (default: 3000) |

## How It Works

1. **Scans directory** - Reads file metadata (name, type, size, modified date)
2. **Analyzes with AI** - Sends file info to AI with your configured rules
3. **Proposes organization** - Shows categorization with confidence levels
4. **Confirms with you** - Presents interactive UI for approval
5. **Moves files** - Organizes files into target directory structure

## Examples

### Basic Organization

```bash
$ tidyf ~/Downloads
┌   tidyf
│
◆  Scanning ~/Downloads...
│    Found 5 files
│
◇  Analyzing files with AI...
│
◆  Organization proposal:
│    📄 invoice-2024.pdf → Documents/Receipts
│    🖼️  vacation-photo.jpg → Images/Photos
│    📦 backup.zip → Archives
│    🎵 podcast.mp3 → Audio/Podcasts
│    💻 installer.dmg → Applications/Installers
│
◆  Apply these changes?
│  ● Yes
└
```

### Watch Mode

```bash
$ tidyf watch ~/Downloads --auto
┌   tidyf watch
│
◇  Watching directories:
│    ~/Downloads
│
◇  Target: ~/Documents/Organized
│
⚠  Auto mode: Files will be moved without confirmation
│
◇  Watcher ready
│    Press Ctrl+C to stop watching
│
│  + 2 new file(s) detected
│    📄 document.pdf → Documents
│    🖼️  screenshot.png → Images/Screenshots
│
◇  Moved 2 files
```

## Troubleshooting

### "OpenCode CLI is not installed"

Install OpenCode first:

```bash
npm install -g opencode
# or
brew install sst/tap/opencode
```

### "Not authenticated with OpenCode"

Run authentication:

```bash
opencode auth
```

### "Permission denied"

Make sure you have write access to both source and target directories.

### Files not being detected

Check if the file matches an ignore pattern in `~/.tidy/settings.json`.

## Development

```bash
# Clone the repo
git clone https://github.com/yafyx/tidy.git
cd tidy

# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for production
bun run build

# Type check
bun run typecheck
```

## License

MIT

## Links

- [OpenCode](https://opencode.ai) - AI coding assistant
- [OpenCode Docs](https://opencode.ai/docs) - Documentation
