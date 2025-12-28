/**
 * Built-in profile presets for common use cases
 */

import type { Profile } from "../types/profile.ts";

export interface PresetDefinition {
  name: string;
  description: string;
  profile: Omit<Profile, "name" | "createdAt" | "modifiedAt">;
  rules: string;
}

export const PRESET_DEFINITIONS: PresetDefinition[] = [
  {
    name: "developer",
    description: "Organize source code, configs, and project files",
    profile: {
      description: "Developer-focused organization for code and configs",
      defaultTarget: "~/Documents/Dev",
    },
    rules: `# Developer Profile Rules

You are organizing files for a software developer. Focus on project structure and code organization.

## Categories

### Code
- Source files: .ts, .tsx, .js, .jsx, .py, .go, .rs, .java, .c, .cpp, .swift, .kt
- Subcategorize by language family: JavaScript, Python, Go, Rust, Swift, etc.

### Config
- Configuration files: .json, .yaml, .yml, .toml, .env, .ini
- Subcategorize: Project Config, Editor Config, CI/CD

### Documentation
- README, CHANGELOG, LICENSE, .md files
- API docs, design docs

### Data
- Database files, SQL scripts, seed data
- JSON/CSV data files

### Scripts
- Shell scripts, batch files, automation scripts
- Build scripts, deployment scripts

## Strategy

1. **Group by project** - If filename contains project identifiers, keep files together
2. **Separate configs from code** - Configs go to their own folder
3. **Archive old files** - Anything with "old", "backup", or date suffixes

## Output Format

Return JSON:
\`\`\`json
{
  "proposals": [{ "file": "name", "destination": "Code/JavaScript/project", "category": {...} }],
  "strategy": "...",
  "uncategorized": []
}
\`\`\`
`,
  },
  {
    name: "creative",
    description: "Organize images, videos, design files, and media",
    profile: {
      description: "Creative workflow for designers and content creators",
      defaultTarget: "~/Documents/Creative",
    },
    rules: `# Creative Profile Rules

You are organizing files for a designer or content creator. Focus on visual assets and media organization.

## Categories

### Images
- Photos: .jpg, .jpeg, .png, .heic, .raw, .cr2, .nef
- Graphics: .svg, .webp, .gif
- Subcategorize: Photos, Screenshots, Icons, Illustrations

### Design
- Figma exports, Sketch files, PSD, AI
- Subcategorize by project or client name if detectable

### Video
- .mp4, .mov, .avi, .mkv, .webm
- Subcategorize: Raw Footage, Exports, Clips

### Audio
- .mp3, .wav, .aiff, .flac, .m4a
- Subcategorize: Music, SFX, Voiceover

### Fonts
- .ttf, .otf, .woff, .woff2
- Keep in centralized Fonts folder

### 3D
- .obj, .fbx, .blend, .gltf
- 3D models and assets

## Strategy

1. **Date-based for photos** - Organize photos by YYYY/MM if dates detected in filename
2. **Project-based for design** - Group by client or project name
3. **Keep exports together** - Files with "export", "final", "v2" stay in same project folder

## Output Format

Return JSON:
\`\`\`json
{
  "proposals": [{ "file": "name", "destination": "Images/Photos/2024/January", "category": {...} }],
  "strategy": "...",
  "uncategorized": []
}
\`\`\`
`,
  },
  {
    name: "student",
    description: "Organize documents, notes, and academic materials",
    profile: {
      description: "Academic organization for students and researchers",
      defaultTarget: "~/Documents/School",
    },
    rules: `# Student Profile Rules

You are organizing files for a student. Focus on academic organization and study materials.

## Categories

### Notes
- Text files, markdown notes, OneNote exports
- Subcategorize by subject if detectable

### Documents
- PDFs, Word docs, essays, reports
- Subcategorize: Assignments, Readings, Submissions

### Slides
- PowerPoint, Keynote, Google Slides exports
- Lecture slides, presentations

### Spreadsheets
- Excel, CSV, data analysis files
- Lab data, calculations

### Textbooks
- E-books: .epub, .mobi, .pdf (large PDFs)
- Reference materials

### Research
- Papers, citations, bibliography files
- Research data and notes

## Strategy

1. **Subject detection** - Look for subject names in filenames (math, history, physics, etc.)
2. **Semester organization** - Group by term if dates/semesters detected
3. **Assignment priority** - Files with "assignment", "hw", "lab" get special handling

## Output Format

Return JSON:
\`\`\`json
{
  "proposals": [{ "file": "name", "destination": "Notes/Physics/Chapter1", "category": {...} }],
  "strategy": "...",
  "uncategorized": []
}
\`\`\`
`,
  },
  {
    name: "downloads",
    description: "Aggressive cleanup for messy Downloads folders",
    profile: {
      description: "Fast cleanup for Downloads folder chaos",
      defaultSource: "~/Downloads",
      defaultTarget: "~/Documents/Organized",
    },
    rules: `# Downloads Cleanup Profile

You are aggressively cleaning a messy Downloads folder. Be decisive and organize everything.

## Categories

### Installers
- DMG, PKG, EXE, MSI, APP, DEB, RPM
- Move to Installers folder, suggest deletion after install

### Archives
- ZIP, RAR, 7Z, TAR.GZ
- Keep in Archives, note if should be extracted

### Documents
- PDF, DOCX, XLSX, PPTX, TXT
- Subcategorize: Receipts, Manuals, Forms, Other

### Images
- All image formats
- Screenshots go to Screenshots subfolder

### Videos
- All video formats
- Downloads, Clips, Tutorials

### Audio
- All audio formats
- Music, Podcasts, Recordings

### Code
- Source files, scripts, configs
- Move to Development folder

### Temporary
- .tmp, .part, .crdownload, incomplete downloads
- Flag for deletion

## Strategy

1. **Be aggressive** - Everything gets categorized, nothing stays in Downloads
2. **Detect duplicates** - Files like "file (1).pdf" are duplicates
3. **Date cleanup** - Old files (>30 days) can go to Archive
4. **Installers cleanup** - Suggest keeping only latest versions

## Output Format

Return JSON:
\`\`\`json
{
  "proposals": [{ "file": "name", "destination": "Documents/Receipts", "category": {...} }],
  "strategy": "...",
  "uncategorized": []
}
\`\`\`
`,
  },
];

export function getPresetNames(): string[] {
  return PRESET_DEFINITIONS.map((p) => p.name);
}

export function getPreset(name: string): PresetDefinition | undefined {
  return PRESET_DEFINITIONS.find((p) => p.name === name);
}

export function listPresets(): { name: string; description: string }[] {
  return PRESET_DEFINITIONS.map((p) => ({
    name: p.name,
    description: p.description,
  }));
}
