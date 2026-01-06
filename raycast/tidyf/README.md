# tidyf

AI-powered file organizer that uses OpenCode to intelligently categorize and organize your files.

## Features

- **Organize Files** - Select any folder, let AI analyze the contents, review proposals before applying
- **Quick Tidy Downloads** - One-click organization of your Downloads folder with high-confidence moves (>80%)
- **View History** - Browse past operations and undo changes with a single action

## Requirements

This extension requires the [OpenCode](https://opencode.ai) AI coding assistant to be available. The extension will:

1. Attempt to connect to an existing OpenCode server on `localhost:4096`
2. If unavailable, automatically spawn a new server instance

Ensure you have OpenCode installed and accessible in your PATH.

## Commands

| Command | Description |
|---------|-------------|
| Organize Files | Interactive folder picker with AI-powered categorization. Review each proposed move before applying. |
| Quick Tidy Downloads | Instantly organizes `~/Downloads` by applying moves with confidence above 80%. |
| View Organization History | Browse recent file operations with the ability to undo any action. |

## How It Works

1. **Scan** - Collects file metadata (name, extension, size, MIME type)
2. **Analyze** - Sends metadata to AI with your organization rules
3. **Propose** - Presents categorized moves for your review
4. **Apply** - Moves files to category-based subfolders

## Configuration

Access settings through Raycast to configure:

- Default AI model (provider/model format)
- Source and target directories
- Custom organization rules

## Related

- [tidyf CLI](https://github.com/yafyx/tidyf) - The command-line tool this extension is built on
