# Dusty Tab Notes

A sidebar notepad for Chrome that saves separate notes per tab group, with markdown editing, slash commands, and auto-save.

## Install

1. Download or clone this folder to your computer
2. Open Chrome and go to `chrome://extensions`
3. Turn on **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `chrome-tab-notepad` folder
6. The Dusty Tab Notes icon will appear in your Chrome toolbar

## Usage

Click the extension icon in the toolbar to open the sidebar notepad.

### Tab Groups
- Each **tab group** gets its own notepad — switch groups, and the notes switch automatically
- **Ungrouped tabs** each get their own individual notepad
- When you drag an ungrouped tab into a group, its notes are automatically appended to that group's notepad

### Markdown
- Opens in preview mode by default — start typing right away
- Click **Edit** to switch to raw markdown editing
- Click **Preview** to see rendered output
- Both modes are fully editable

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| Cmd+Shift+S | Toggle strikethrough on selected text |

### Slash Commands
Type `/` at the start of a line (works in both edit and preview mode) to open the command menu:

| Command | What it does |
|---------|-------------|
| `/h1` `/h2` `/h3` | Insert a heading |
| `/todo` | Insert a checkbox item |
| `/checklist` | Insert multiple checkbox items |
| `/code` | Insert a fenced code block |
| `/table` | Insert a markdown table |
| `/divider` | Insert a horizontal rule |
| `/clear` | Clear all content |

- Arrow keys to navigate the menu, **Enter** or **Tab** to select, **Escape** to dismiss
- Type to filter (e.g. `/ta` narrows to Table)

### Interactive Checklists
- Checkboxes in preview mode are clickable
- Checking a box applies strikethrough to the item text
- Unchecking removes the strikethrough

### Auto-Save
Notes save automatically as you type. The status bar at the bottom shows save state.

## Publishing to Chrome Web Store

See `store-listing.md` for the store description and `privacy-policy.md` for the privacy policy.
