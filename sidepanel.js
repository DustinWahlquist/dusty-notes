// ── State ──
let currentStorageKey = null;
let isPreviewMode = true;
let saveTimeout = null;
let slashMenuOpen = false;
let slashFilterStart = -1;    // textarea offset (editor mode)
let slashTextNode = null;     // text node ref (preview mode)
let slashNodeOffset = -1;     // offset within text node where '/' was typed (preview mode)
let slashSource = null;       // 'editor' or 'preview'
let selectedSlashIndex = 0;

// ── DOM refs ──
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const toggleBtn = document.getElementById('toggleMode');
const toggleIcon = document.getElementById('toggleIcon');
const groupLabel = document.getElementById('groupLabel');
const groupDot = document.getElementById('groupDot');
const saveStatus = document.getElementById('saveStatus');
const slashMenu = document.getElementById('slashMenu');

// ── Code block languages ──
const CODE_LANGUAGES = [
  { label: 'Plain text',  value: '' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python',     value: 'python' },
  { label: 'HTML',       value: 'markup' },
  { label: 'CSS',        value: 'css' },
  { label: 'Bash',       value: 'bash' },
  { label: 'JSON',       value: 'json' },
  { label: 'SQL',        value: 'sql' },
  { label: 'Markdown',   value: 'markdown' },
  { label: 'Ruby',       value: 'ruby' },
  { label: 'Go',         value: 'go' },
  { label: 'Java',       value: 'java' },
  { label: 'Rust',       value: 'rust' },
  { label: 'C++',        value: 'cpp' },
  { label: 'C#',         value: 'csharp' },
];

const LANG_ALIASES = {
  'js': 'javascript', 'ts': 'typescript', 'py': 'python',
  'html': 'markup', 'sh': 'bash', 'shell': 'bash', 'md': 'markdown',
};

// ── Slash commands ──
const SLASH_COMMANDS = [
  { name: 'Heading 1',  keyword: 'h1',        icon: 'H1', desc: 'Large heading',           insert: '# '  },
  { name: 'Heading 2',  keyword: 'h2',        icon: 'H2', desc: 'Medium heading',          insert: '## ' },
  { name: 'Heading 3',  keyword: 'h3',        icon: 'H3', desc: 'Small heading',           insert: '### ' },
  { name: 'To-do',      keyword: 'todo',      icon: '\u2610', desc: 'Checkbox item',           insert: '- [ ] ' },
  { name: 'Code Block', keyword: 'code',      icon: '<>', desc: 'Fenced code block',       insert: '```\n\n```',  cursorOffset: 4 },
  { name: 'Table',      keyword: 'table',     icon: '\u2637', desc: 'Markdown table',          insert: '| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| cell     | cell     | cell     |\n' },
  { name: 'Divider',    keyword: 'divider',   icon: '\u2014', desc: 'Horizontal rule',         insert: '\n---\n' },
  { name: 'Clear',      keyword: 'clear',     icon: '\u2715', desc: 'Clear all content',       action: 'clear' },
];

// ── Init ──
async function init() {
  // Start in preview mode
  editor.classList.add('hidden');
  preview.classList.remove('hidden');
  toggleIcon.textContent = '.md';
  toggleBtn.classList.add('active');

  const info = await chrome.runtime.sendMessage({ type: 'get-current-tab' });
  if (info) switchContext(info);
}

// ── Context switching ──
async function switchContext(info) {
  // Save current note before switching
  await saveNow();

  currentStorageKey = info.storageKey;
  groupLabel.textContent = info.label;

  // Update the color dot
  groupDot.className = 'group-dot';
  if (info.color) {
    groupDot.classList.add(`dot-${info.color}`);
  }

  // Load the note
  const result = await chrome.storage.local.get(currentStorageKey);
  const content = result[currentStorageKey] || '';

  editor.value = content;
  preview.innerHTML = markdownToHtml(content);
  bindCheckboxes();
  highlightCodeBlocks();
  autolinkTextNodes(preview);

  saveStatus.textContent = 'Loaded';
}

// ── Saving ──
function scheduleSave() {
  clearTimeout(saveTimeout);
  saveStatus.textContent = 'Typing...';
  saveTimeout = setTimeout(saveNow, 400);
}

async function saveNow() {
  if (!currentStorageKey) return;

  let content;
  if (isPreviewMode) {
    content = htmlToMarkdown(preview);
    editor.value = content; // sync back to editor
  } else {
    content = editor.value;
  }

  await chrome.storage.local.set({ [currentStorageKey]: content });
  saveStatus.textContent = 'Saved';
}

// ── Toggle between edit and preview ──
toggleBtn.addEventListener('click', () => {
  if (isPreviewMode) {
    // Switch to edit mode — convert preview HTML back to markdown
    const md = htmlToMarkdown(preview);
    editor.value = md;
    preview.classList.add('hidden');
    editor.classList.remove('hidden');
    toggleIcon.textContent = 'Preview';
    toggleBtn.classList.remove('active');
    editor.focus();
    dragHandle.classList.add('hidden');
    hoveredBlock = null;
  } else {
    // Switch to preview mode — render markdown
    const html = markdownToHtml(editor.value);
    preview.innerHTML = html;
    bindCheckboxes();
    highlightCodeBlocks();
    autolinkTextNodes(preview);
    editor.classList.add('hidden');
    preview.classList.remove('hidden');
    toggleIcon.textContent = '.md';
    toggleBtn.classList.add('active');
    preview.focus();
  }
  isPreviewMode = !isPreviewMode;
  saveNow();
});

// ── Editor input ──
editor.addEventListener('input', scheduleSave);

// ── Preview input (contenteditable) ──
preview.addEventListener('input', scheduleSave);

// ── Auto-hyperlink URLs in preview mode ──
const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

// Walk text nodes and convert bare URLs to <a> tags, skipping links/code.
function autolinkTextNodes(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest('a, code, pre')) return NodeFilter.FILTER_REJECT;
      URL_REGEX.lastIndex = 0;
      return URL_REGEX.test(node.textContent)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(linkifyTextNode);
}

function linkifyTextNode(textNode) {
  const text = textNode.textContent;
  const parent = textNode.parentNode;
  if (!parent) return;

  const frag = document.createDocumentFragment();
  let lastIdx = 0;
  let match;
  const re = new RegExp(URL_REGEX.source, 'g');

  while ((match = re.exec(text)) !== null) {
    let url = match[0];
    // Trim trailing punctuation that's probably not part of the URL
    const trailingMatch = url.match(/[.,;:!?)\]}'"]+$/);
    if (trailingMatch) url = url.slice(0, -trailingMatch[0].length);
    if (!url) continue;

    if (match.index > lastIdx) {
      frag.appendChild(document.createTextNode(text.substring(lastIdx, match.index)));
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = url;
    frag.appendChild(a);
    lastIdx = match.index + url.length;
  }

  if (lastIdx === 0) return; // no matches

  if (lastIdx < text.length) {
    frag.appendChild(document.createTextNode(text.substring(lastIdx)));
  }
  parent.replaceChild(frag, textNode);
}

// After typing space/enter, linkify a URL that just ended before the cursor.
function maybeLinkifyBeforeCursor() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;
  if (node.parentElement?.closest('a, code, pre')) return;

  const text = node.textContent;
  const cursorPos = range.startOffset;
  const beforeCursor = text.substring(0, cursorPos);

  // Find a URL that ends just before trailing whitespace at the cursor.
  const match = beforeCursor.match(/(^|\s)(https?:\/\/[^\s]+?)([.,;:!?)\]}'"]*)(\s+)$/);
  if (!match) return;

  const leading = match[1];
  const url = match[2];
  const trailingPunct = match[3];
  const trailingSpace = match[4];
  const urlStart = match.index + leading.length;
  const urlEnd = urlStart + url.length;
  const afterIdx = urlEnd + trailingPunct.length + trailingSpace.length;

  const before = text.substring(0, urlStart);
  const after = text.substring(afterIdx);
  const parent = node.parentNode;
  if (!parent) return;

  if (before) {
    parent.insertBefore(document.createTextNode(before), node);
  }
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = url;
  parent.insertBefore(a, node);

  const tail = trailingPunct + trailingSpace + after;
  const afterNode = document.createTextNode(tail);
  parent.insertBefore(afterNode, node);
  parent.removeChild(node);

  // Place cursor just after the trailing whitespace (where the user was typing).
  const newRange = document.createRange();
  newRange.setStart(afterNode, trailingPunct.length + trailingSpace.length);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

// If the user typed "- " at the start of a non-list block, turn that block
// into a <ul><li>. Runs after the space has been inserted.
function maybeConvertDashToBullet() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return;

  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;

  // Find the top-level block in preview that contains the cursor.
  let block = node.parentElement;
  while (block && block.parentElement !== preview) {
    block = block.parentElement;
  }
  if (!block || block.parentElement !== preview) return;

  const tag = block.tagName.toLowerCase();
  // Only plain paragraphs/divs/headings — not lists, blockquotes, or code.
  if (!['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return;

  // The cursor must sit right after a literal "- " at the block's start.
  // Walk to the first text node in the block.
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const firstText = walker.nextNode();
  if (!firstText) return;
  if (node !== firstText) return;
  if (range.startOffset !== 2) return;
  if (!firstText.textContent.startsWith('- ')) return;

  // Strip the "- " prefix; if that leaves the li empty, use NBSP so the
  // caret has something to anchor to.
  firstText.textContent = firstText.textContent.slice(2);
  if (block.textContent.length === 0) {
    firstText.textContent = '\u00A0';
  }

  // Wrap the block's remaining children in <ul><li> and swap them in.
  const ul = document.createElement('ul');
  const li = document.createElement('li');
  while (block.firstChild) li.appendChild(block.firstChild);
  ul.appendChild(li);
  block.parentNode.replaceChild(ul, block);

  // Put the caret at the start of the new li's content.
  const liWalker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  const firstLiText = liWalker.nextNode();
  if (firstLiText) {
    const newRange = document.createRange();
    newRange.setStart(firstLiText, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
  scheduleSave();
}

preview.addEventListener('keyup', (e) => {
  if (!isPreviewMode) return;
  if (e.key === ' ') {
    maybeConvertDashToBullet();
    maybeLinkifyBeforeCursor();
  } else if (e.key === 'Enter') {
    maybeLinkifyBeforeCursor();
  }
});

// Linkify URLs in pasted plain text; leave HTML pastes to the browser.
preview.addEventListener('paste', (e) => {
  if (!isPreviewMode) return;
  const cd = e.clipboardData;
  if (!cd) return;
  const hasHtml = Array.from(cd.types || []).includes('text/html');
  if (hasHtml) {
    // Let browser handle rich paste, then linkify any bare URLs it contains.
    setTimeout(() => {
      autolinkTextNodes(preview);
      scheduleSave();
    }, 0);
    return;
  }

  const text = cd.getData('text/plain');
  if (!text) return;
  URL_REGEX.lastIndex = 0;
  if (!URL_REGEX.test(text)) return;

  e.preventDefault();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();

  // Build a fragment with text and <a> nodes
  const frag = document.createDocumentFragment();
  const re = new RegExp(URL_REGEX.source, 'g');
  let lastIdx = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    let url = m[0];
    const trailingMatch = url.match(/[.,;:!?)\]}'"]+$/);
    if (trailingMatch) url = url.slice(0, -trailingMatch[0].length);
    if (!url) continue;
    if (m.index > lastIdx) {
      frag.appendChild(document.createTextNode(text.substring(lastIdx, m.index)));
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = url;
    frag.appendChild(a);
    lastIdx = m.index + url.length;
  }
  if (lastIdx < text.length) {
    frag.appendChild(document.createTextNode(text.substring(lastIdx)));
  }

  // Track the last inserted node so we can place the cursor after it
  const lastNode = frag.lastChild;
  range.insertNode(frag);
  if (lastNode) {
    const newRange = document.createRange();
    newRange.setStartAfter(lastNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
  scheduleSave();
});

// Make links clickable in preview (contenteditable swallows link navigation).
preview.addEventListener('click', (e) => {
  const a = e.target.closest?.('a');
  if (!a || !a.href) return;
  // Ignore clicks while dragging blocks
  if (isDragging) return;
  e.preventDefault();
  try {
    chrome.tabs.create({ url: a.href });
  } catch (_) {
    window.open(a.href, '_blank', 'noopener,noreferrer');
  }
});

// ── Strikethrough shortcut (Cmd+Shift+S / Ctrl+Shift+S) ──
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();

    if (isPreviewMode) {
      // Wrap selection in <del> in the contenteditable preview
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);

      // Check if the selection is entirely inside an existing <del>/<s>
      const startContainer = range.startContainer;
      const endContainer = range.endContainer;
      const startEl = startContainer.nodeType === Node.ELEMENT_NODE
        ? startContainer : startContainer.parentElement;
      const endEl = endContainer.nodeType === Node.ELEMENT_NODE
        ? endContainer : endContainer.parentElement;
      const startDel = startEl?.closest('del, s');
      const endDel = endEl?.closest('del, s');

      if (startDel && startDel === endDel) {
        // Unwrap: preserve inline formatting inside the del
        const parent = startDel.parentNode;
        const first = startDel.firstChild;
        const last = startDel.lastChild;
        while (startDel.firstChild) {
          parent.insertBefore(startDel.firstChild, startDel);
        }
        parent.removeChild(startDel);
        if (first && last) {
          const newRange = document.createRange();
          newRange.setStartBefore(first);
          newRange.setEndAfter(last);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      } else {
        // Wrap selection in <del>. extractContents handles cross-boundary selections
        // that range.surroundContents cannot.
        try {
          const fragment = range.extractContents();
          const del = document.createElement('del');
          del.appendChild(fragment);
          range.insertNode(del);
          const newRange = document.createRange();
          newRange.selectNodeContents(del);
          sel.removeAllRanges();
          sel.addRange(newRange);
        } catch (err) {
          console.error('Strikethrough failed:', err);
        }
      }
      scheduleSave();
    } else {
      // Wrap selection in ~~ in the textarea
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      if (start === end) return;

      const text = editor.value;
      const selected = text.substring(start, end);

      // Check if already wrapped in ~~
      if (start >= 2 && text.substring(start - 2, start) === '~~' &&
          text.substring(end, end + 2) === '~~') {
        // Unwrap
        editor.value = text.substring(0, start - 2) + selected + text.substring(end + 2);
        editor.selectionStart = start - 2;
        editor.selectionEnd = end - 2;
      } else {
        // Wrap
        editor.value = text.substring(0, start) + '~~' + selected + '~~' + text.substring(end);
        editor.selectionStart = start + 2;
        editor.selectionEnd = end + 2;
      }
      scheduleSave();
    }
  }
});

// ── Checkbox click handling in preview ──
function bindCheckboxes() {
  preview.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.disabled = false;
    cb.addEventListener('change', () => {
      const li = cb.closest('li');
      if (!li) return;

      if (cb.checked) {
        // Add strikethrough to the text content
        if (!li.querySelector('.checked-text')) {
          const wrapper = document.createElement('del');
          wrapper.className = 'checked-text';
          // Move all nodes after the checkbox into the <del>
          const nodes = [];
          let sibling = cb.nextSibling;
          while (sibling) {
            nodes.push(sibling);
            sibling = sibling.nextSibling;
          }
          nodes.forEach(n => wrapper.appendChild(n));
          li.appendChild(wrapper);
        }
      } else {
        // Remove strikethrough
        const del = li.querySelector('.checked-text');
        if (del) {
          while (del.firstChild) {
            li.appendChild(del.firstChild);
          }
          del.remove();
        }
      }
      scheduleSave();
    });
  });
}

// Re-bind checkboxes whenever preview content changes
const previewObserver = new MutationObserver(() => {
  // Debounce to avoid binding during rapid edits
  clearTimeout(previewObserver._timeout);
  previewObserver._timeout = setTimeout(() => bindCheckboxes(), 100);
});
previewObserver.observe(preview, { childList: true, subtree: true });

// ── Shared slash menu keyboard handler ──
function handleSlashKeydown(e) {
  if (!slashMenuOpen) return false;

  const filtered = getFilteredCommands();
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedSlashIndex = (selectedSlashIndex + 1) % filtered.length;
    renderSlashMenu(filtered);
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedSlashIndex = (selectedSlashIndex - 1 + filtered.length) % filtered.length;
    renderSlashMenu(filtered);
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    if (filtered.length > 0) {
      executeSlashCommand(filtered[selectedSlashIndex]);
    }
    return true;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSlashMenu();
    return true;
  }
  return false;
}

// ── Editor keydown ──
editor.addEventListener('keydown', (e) => {
  if (handleSlashKeydown(e)) return;

  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
    scheduleSave();
  }

  if (e.key === 'Enter') {
    const pos = editor.selectionStart;
    const text = editor.value;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const line = text.substring(lineStart, pos);
    if (/^- \[[ xX]\] /.test(line)) {
      e.preventDefault();
      const todoText = line.replace(/^- \[[ xX]\] /, '');
      if (todoText === '') {
        // Empty todo — exit the list
        editor.value = text.substring(0, lineStart) + text.substring(pos);
        editor.selectionStart = editor.selectionEnd = lineStart;
      } else {
        const insert = '\n- [ ] ';
        editor.value = text.substring(0, pos) + insert + text.substring(pos);
        editor.selectionStart = editor.selectionEnd = pos + insert.length;
      }
      scheduleSave();
    }
  }
});

// ── Preview keydown ──
preview.addEventListener('keydown', (e) => {
  if (handleSlashKeydown(e)) return;

  if (e.key === 'Tab') {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const node = sel.getRangeAt(0).startContainer;
    const li = node.nodeType === Node.TEXT_NODE
      ? node.parentElement?.closest('li')
      : node.closest?.('li');
    if (li) {
      e.preventDefault();
      if (e.shiftKey) {
        // Unindent: move li out of nested ul to parent level
        const parentUl = li.parentElement;
        const grandparentLi = parentUl.parentElement;
        if (grandparentLi && grandparentLi.tagName.toLowerCase() === 'li') {
          grandparentLi.parentElement.insertBefore(li, grandparentLi.nextSibling);
          if (parentUl.children.length === 0) parentUl.remove();
        }
      } else {
        // Indent: move li into a nested ul inside the previous sibling li
        const prevLi = li.previousElementSibling;
        if (prevLi) {
          let nestedUl = prevLi.querySelector(':scope > ul');
          if (!nestedUl) {
            nestedUl = document.createElement('ul');
            prevLi.appendChild(nestedUl);
          }
          nestedUl.appendChild(li);
        }
      }
      placeCursorAtEnd(li);
      scheduleSave();
    }
  }

  if (e.key === 'Enter') {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const node = sel.getRangeAt(0).startContainer;
    const li = node.nodeType === Node.TEXT_NODE
      ? node.parentElement?.closest('li')
      : node.closest?.('li');
    if (li && li.querySelector('input[type="checkbox"]')) {
      e.preventDefault();
      const textContent = li.textContent.trim();
      if (textContent === '') {
        // Empty todo — exit the list
        const ul = li.closest('ul');
        const newP = document.createElement('p');
        newP.innerHTML = '<br>';
        ul.parentNode.insertBefore(newP, ul.nextSibling);
        li.remove();
        if (ul.children.length === 0) ul.remove();
        placeCursorAtEnd(newP);
      } else {
        const newLi = document.createElement('li');
        const newCb = document.createElement('input');
        newCb.type = 'checkbox';
        newLi.appendChild(newCb);
        // NBSP (not ASCII space) so the caret has a visible anchor in an
        // empty todo. .trim() still strips it during markdown serialization.
        newLi.appendChild(document.createTextNode('\u00A0'));
        li.parentNode.insertBefore(newLi, li.nextSibling);
        placeCursorAtEnd(newLi);
      }
      scheduleSave();
    }
  }
});

// ── Editor slash detection ──
editor.addEventListener('input', (e) => {
  const pos = editor.selectionStart;
  const text = editor.value;

  if (slashMenuOpen && slashSource === 'editor') {
    const typed = text.substring(slashFilterStart, pos);
    if (!typed.startsWith('/') || typed.includes(' ') || typed.includes('\n')) {
      closeSlashMenu();
    } else {
      selectedSlashIndex = 0;
      const filtered = getFilteredCommands();
      if (filtered.length === 0) {
        closeSlashMenu();
      } else {
        renderSlashMenu(filtered);
      }
    }
  } else if (!slashMenuOpen) {
    if (pos > 0 && text[pos - 1] === '/') {
      const lineStart = text.lastIndexOf('\n', pos - 2) + 1;
      const beforeSlash = text.substring(lineStart, pos - 1).trim();
      if (beforeSlash === '') {
        slashFilterStart = pos - 1;
        slashSource = 'editor';
        openSlashMenu();
      }
    }
  }
});

// ── Preview slash detection ──
preview.addEventListener('input', (e) => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const node = range.startContainer;

  if (node.nodeType !== Node.TEXT_NODE) return;

  const text = node.textContent;
  const cursorPos = range.startOffset;

  if (slashMenuOpen && slashSource === 'preview') {
    // Verify we're still in the same text node
    if (node !== slashTextNode) {
      closeSlashMenu();
      return;
    }
    const typed = text.substring(slashNodeOffset, cursorPos);
    if (!typed.startsWith('/') || typed.includes(' ') || typed.includes('\n')) {
      closeSlashMenu();
    } else {
      selectedSlashIndex = 0;
      const filtered = getFilteredCommands();
      if (filtered.length === 0) {
        closeSlashMenu();
      } else {
        renderSlashMenu(filtered);
      }
    }
  } else if (!slashMenuOpen) {
    if (cursorPos > 0 && text[cursorPos - 1] === '/') {
      // Check if '/' is at the start of a block or after only whitespace
      const textBefore = text.substring(0, cursorPos - 1).trim();
      const isStartOfBlock = textBefore === '' && isAtBlockStart(node);
      if (isStartOfBlock || textBefore === '') {
        slashTextNode = node;
        slashNodeOffset = cursorPos - 1;
        slashSource = 'preview';
        openSlashMenu();
      }
    }
  }
});

// Check if a text node is at the start of a block-level element
function isAtBlockStart(textNode) {
  let parent = textNode.parentElement;
  while (parent && parent !== preview) {
    const tag = parent.tagName.toLowerCase();
    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tag)) {
      return true;
    }
    parent = parent.parentElement;
  }
  return true; // direct child of preview is fine
}

// ── Slash menu functions ──
function getSlashQuery() {
  if (slashSource === 'editor') {
    const text = editor.value;
    const pos = editor.selectionStart;
    return text.substring(slashFilterStart + 1, pos).toLowerCase();
  } else {
    // preview mode
    if (!slashTextNode) return '';
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    const cursorPos = sel.getRangeAt(0).startOffset;
    return slashTextNode.textContent.substring(slashNodeOffset + 1, cursorPos).toLowerCase();
  }
}

function getFilteredCommands() {
  const query = getSlashQuery();
  return SLASH_COMMANDS.filter(cmd =>
    cmd.keyword.includes(query) || cmd.name.toLowerCase().includes(query)
  );
}

function openSlashMenu() {
  slashMenuOpen = true;
  selectedSlashIndex = 0;
  renderSlashMenu(getFilteredCommands());
  slashMenu.classList.remove('hidden');
}

function closeSlashMenu() {
  slashMenuOpen = false;
  slashFilterStart = -1;
  slashTextNode = null;
  slashNodeOffset = -1;
  slashSource = null;
  slashMenu.classList.add('hidden');
}

function renderSlashMenu(filtered) {
  let html = '<div class="slash-menu-header">Commands</div>';
  filtered.forEach((cmd, i) => {
    const sel = i === selectedSlashIndex ? ' selected' : '';
    html += `<div class="slash-item${sel}" data-index="${i}">
      <div class="slash-item-icon">${cmd.icon}</div>
      <div class="slash-item-text">
        <span class="slash-item-name">${cmd.name}</span>
        <span class="slash-item-desc">${cmd.desc}</span>
      </div>
    </div>`;
  });
  slashMenu.innerHTML = html;

  // Click handlers
  slashMenu.querySelectorAll('.slash-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent blur
      const idx = parseInt(el.dataset.index);
      executeSlashCommand(filtered[idx]);
    });
  });

  // Scroll selected into view
  const selectedEl = slashMenu.querySelector('.slash-item.selected');
  if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
}

function executeSlashCommand(cmd) {
  if (slashSource === 'editor') {
    executeSlashInEditor(cmd);
  } else {
    executeSlashInPreview(cmd);
  }
  closeSlashMenu();
  scheduleSave();
}

function executeSlashInEditor(cmd) {
  const pos = editor.selectionStart;
  const before = editor.value.substring(0, slashFilterStart);
  const after = editor.value.substring(pos);

  if (cmd.action === 'clear') {
    if (confirm('Clear all content in this notepad?')) {
      editor.value = '';
      editor.focus();
    }
  } else {
    const insert = cmd.insert;
    editor.value = before + insert + after;
    const cursorPos = cmd.cursorOffset
      ? before.length + insert.length - cmd.cursorOffset
      : before.length + insert.length;
    editor.selectionStart = editor.selectionEnd = cursorPos;
    editor.focus();
  }
}

// HTML templates for slash commands in preview mode
const PREVIEW_HTML = {
  'h1':        (sel) => { replaceSlashTextWithBlock('h1', '', sel); },
  'h2':        (sel) => { replaceSlashTextWithBlock('h2', '', sel); },
  'h3':        (sel) => { replaceSlashTextWithBlock('h3', '', sel); },
  'todo':      (sel) => { insertHtmlAtSlash('<ul><li><input type="checkbox">&nbsp;</li></ul>', sel); },
  'code':      (sel) => { insertHtmlAtSlash('<pre><code>\n</code></pre>', sel); },
  'table':     (sel) => { insertHtmlAtSlash('<table><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr><tr><td>cell</td><td>cell</td><td>cell</td></tr></table>', sel); },
  'divider':   (sel) => { insertHtmlAtSlash('<hr>', sel); },
};

function executeSlashInPreview(cmd) {
  if (cmd.action === 'clear') {
    if (confirm('Clear all content in this notepad?')) {
      preview.innerHTML = '';
      preview.focus();
    }
    return;
  }

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const handler = PREVIEW_HTML[cmd.keyword];
  if (handler) {
    handler(sel);
    preview.focus();
  }
}

// Replace the slash text and convert the containing block into a heading
function replaceSlashTextWithBlock(tag, placeholder, sel) {
  if (!slashTextNode || !slashTextNode.parentNode) return;

  const text = slashTextNode.textContent;
  const cursorPos = sel.getRangeAt(0).startOffset;
  const before = text.substring(0, slashNodeOffset);
  const after = text.substring(cursorPos);

  // Find the closest block parent
  let blockParent = slashTextNode.parentElement;
  while (blockParent && blockParent !== preview) {
    const t = blockParent.tagName.toLowerCase();
    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(t)) break;
    blockParent = blockParent.parentElement;
  }

  const content = before + placeholder + after;

  if (!blockParent || blockParent === preview) {
    // Text is a direct child of preview — wrap it
    const newEl = document.createElement(tag);
    newEl.innerHTML = content || '<br>';
    slashTextNode.parentNode.replaceChild(newEl, slashTextNode);
    placeCursorInBlock(newEl, content);
  } else {
    // Replace the block tag
    const newEl = document.createElement(tag);
    newEl.innerHTML = content || '<br>';
    blockParent.parentNode.replaceChild(newEl, blockParent);
    placeCursorInBlock(newEl, content);
  }
}

// Insert arbitrary HTML at the slash position, removing the /query text
function insertHtmlAtSlash(htmlStr, sel) {
  if (!slashTextNode || !slashTextNode.parentNode) return;

  const text = slashTextNode.textContent;
  const cursorPos = sel.getRangeAt(0).startOffset;
  const before = text.substring(0, slashNodeOffset);
  const after = text.substring(cursorPos);

  // Create a temp container to parse the HTML
  const temp = document.createElement('div');
  temp.innerHTML = htmlStr;

  // Find the block parent that contains the slash text
  let blockParent = slashTextNode.parentElement;
  while (blockParent && blockParent !== preview) {
    const t = blockParent.tagName.toLowerCase();
    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(t)) break;
    blockParent = blockParent.parentElement;
  }

  const insertTarget = (blockParent && blockParent !== preview) ? blockParent : slashTextNode;

  // If there's text before the slash, keep it in a text node
  if (before.trim()) {
    const beforeNode = document.createTextNode(before);
    insertTarget.parentNode.insertBefore(beforeNode, insertTarget);
  }

  // Insert the new elements
  let lastInserted = null;
  while (temp.firstChild) {
    lastInserted = temp.firstChild;
    insertTarget.parentNode.insertBefore(temp.firstChild, insertTarget);
  }

  // If there's text after, keep it
  if (after.trim()) {
    const afterNode = document.createTextNode(after);
    insertTarget.parentNode.insertBefore(afterNode, insertTarget);
  }

  // Remove the original block/text node that had the slash
  insertTarget.parentNode.removeChild(insertTarget);

  // Place cursor in the last inserted element
  if (lastInserted) {
    placeCursorAtEnd(lastInserted);
  }
}

// For newly created block elements: if empty use setStart for reliable cursor placement,
// otherwise fall back to placeCursorAtEnd.
function placeCursorInBlock(el, content) {
  if (!content) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    placeCursorAtEnd(el);
  }
}

function placeCursorAtEnd(el) {
  const sel = window.getSelection();
  const range = document.createRange();
  // Find deepest last text-containing node
  let target = el;
  while (target.lastChild) {
    target = target.lastChild;
  }
  if (target.nodeType === Node.TEXT_NODE) {
    range.setStart(target, target.textContent.length);
  } else {
    range.selectNodeContents(target);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

// ── Listen for tab changes from background ──
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'tab-changed') {
    switchContext(message);
  }
});

// ── Markdown → HTML ──
function markdownToHtml(md) {
  if (!md) return '';

  let html = md;

  // Normalize line endings
  html = html.replace(/\r\n/g, '\n');

  // Fenced code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = escapeHtml(code.trimEnd());
    return `<pre><code class="language-${lang}">${escaped}</code></pre>`;
  });

  // Split into lines for block-level processing
  const lines = html.split('\n');
  const output = [];
  let inList = false;
  let listType = null;
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip lines that are part of code blocks (already handled)
    if (line.startsWith('<pre>')) {
      // Find end of pre block
      let block = line;
      while (!line.includes('</pre>') && i + 1 < lines.length) {
        i++;
        line = lines[i];
        block += '\n' + line;
      }
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      if (inBlockquote) { output.push('</blockquote>'); inBlockquote = false; }
      output.push(block);
      continue;
    }

    // Horizontal rules
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      if (inBlockquote) { output.push('</blockquote>'); inBlockquote = false; }
      output.push('<hr>');
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      if (inBlockquote) { output.push('</blockquote>'); inBlockquote = false; }
      const level = headingMatch[1].length;
      output.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquotes
    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) {
      if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      if (!inBlockquote) { output.push('<blockquote>'); inBlockquote = true; }
      output.push(`<p>${inlineMarkdown(bqMatch[1])}</p>`);
      continue;
    } else if (inBlockquote) {
      output.push('</blockquote>');
      inBlockquote = false;
    }

    // Unordered lists
    const ulMatch = line.match(/^(\s*)[*\-+]\s+(.*)/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
        output.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      // Checkbox support
      let content = ulMatch[2];
      const cbMatch = content.match(/^\[([ xX])\]\s*(.*)/);
      if (cbMatch) {
        const isChecked = cbMatch[1] !== ' ';
        const checked = isChecked ? ' checked' : '';
        const text = inlineMarkdown(cbMatch[2]);
        // NBSP between checkbox and text so an empty todo still has a
        // visible caret anchor (a trailing ASCII space collapses in CSS).
        content = isChecked
          ? `<input type="checkbox"${checked}>&nbsp;<del class="checked-text">${text}</del>`
          : `<input type="checkbox"${checked}>&nbsp;${text}`;
      } else {
        content = inlineMarkdown(content);
      }
      output.push(`<li>${content}</li>`);
      continue;
    }

    // Ordered lists
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
        output.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${inlineMarkdown(olMatch[2])}</li>`);
      continue;
    }

    // Close list if we hit a non-list line
    if (inList && line.trim() === '') {
      output.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    // Empty line
    if (line.trim() === '') {
      output.push('');
      continue;
    }

    // Paragraph
    if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
  if (inBlockquote) output.push('</blockquote>');

  return output.join('\n');
}

// Inline markdown processing
function inlineMarkdown(text) {
  // Inline code (must come first to protect content inside backticks)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Images
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

  return text;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── HTML → Markdown (from contenteditable preview) ──
function htmlToMarkdown(container) {
  return nodeToMarkdown(container).trim();
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const tag = node.tagName.toLowerCase();
  const childContent = () => Array.from(node.childNodes).map(nodeToMarkdown).join('');

  switch (tag) {
    case 'h1': return `# ${childContent().trim()}\n\n`;
    case 'h2': return `## ${childContent().trim()}\n\n`;
    case 'h3': return `### ${childContent().trim()}\n\n`;
    case 'h4': return `#### ${childContent().trim()}\n\n`;
    case 'h5': return `##### ${childContent().trim()}\n\n`;
    case 'h6': return `###### ${childContent().trim()}\n\n`;

    case 'p': return `${childContent()}\n\n`;

    case 'strong':
    case 'b':
      return `**${childContent()}**`;

    case 'em':
    case 'i':
      return `*${childContent()}*`;

    case 'del':
    case 's':
      return `~~${childContent()}~~`;

    case 'a': {
      const href = node.getAttribute('href') || '';
      const text = childContent();
      // If the link text matches its href, store as a bare URL (auto-linking
      // will re-apply on render).
      if (href && href === text && /^https?:\/\//i.test(href)) {
        return href;
      }
      return `[${text}](${href})`;
    }

    case 'img':
      return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;

    case 'code':
      if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
        return node.textContent;
      }
      return `\`${node.textContent}\``;

    case 'pre': {
      const codeEl = node.querySelector('code');
      const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || '';
      const code = codeEl ? codeEl.textContent : node.textContent;
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }

    case 'blockquote': {
      const lines = childContent().trim().split('\n');
      return lines.map(l => `> ${l}`).join('\n') + '\n\n';
    }

    case 'ul': {
      let md = '';
      node.querySelectorAll(':scope > li').forEach(li => {
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox) {
          const checked = checkbox.checked ? 'x' : ' ';
          const text = li.textContent.trim();
          md += `- [${checked}] ${text}\n`;
        } else {
          md += `- ${liContent(li)}\n`;
        }
      });
      return md + '\n';
    }

    case 'ol': {
      let md = '';
      let num = 1;
      node.querySelectorAll(':scope > li').forEach(li => {
        md += `${num}. ${liContent(li)}\n`;
        num++;
      });
      return md + '\n';
    }

    case 'li':
      return childContent();

    case 'hr':
      return '---\n\n';

    case 'br':
      return '\n';

    case 'div':
      if (node.classList.contains('code-block-wrapper')) {
        const pre = node.querySelector('pre');
        return pre ? nodeToMarkdown(pre) : '';
      }
      if (node.classList.contains('code-lang-picker')) return '';
      // contenteditable often wraps new lines in divs
      return `${childContent()}\n`;

    default:
      return childContent();
  }
}

function liContent(li) {
  return Array.from(li.childNodes)
    .filter(n => !(n.nodeType === Node.ELEMENT_NODE && n.tagName === 'INPUT'))
    .map(nodeToMarkdown)
    .join('')
    .trim();
}

// ── Drag to reorder blocks (preview mode) ──
const editorContainer = document.querySelector('.editor-container');

const dragHandle = document.createElement('div');
dragHandle.className = 'drag-handle hidden';
dragHandle.textContent = '⠿';
editorContainer.appendChild(dragHandle);

const dropIndicator = document.createElement('div');
dropIndicator.className = 'drop-indicator hidden';
editorContainer.appendChild(dropIndicator);

let hoveredBlock = null;
let draggedBlock = null;
let isDragging = false;

function getTopLevelBlock(el) {
  if (!el || el === preview) return null;
  while (el.parentElement && el.parentElement !== preview) {
    el = el.parentElement;
  }
  return el.parentElement === preview ? el : null;
}

function positionDragHandle(block) {
  const containerRect = editorContainer.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  dragHandle.style.top = (blockRect.top - containerRect.top + blockRect.height / 2 - 10) + 'px';
  dragHandle.classList.remove('hidden');
}

preview.addEventListener('mousemove', (e) => {
  if (isDragging) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const block = getTopLevelBlock(el);
  if (block) {
    hoveredBlock = block;
    positionDragHandle(block);
  }
});

preview.addEventListener('mouseleave', () => {
  if (isDragging) return;
  setTimeout(() => {
    if (!dragHandle.matches(':hover')) {
      dragHandle.classList.add('hidden');
      hoveredBlock = null;
    }
  }, 100);
});

preview.addEventListener('scroll', () => {
  if (!isDragging) dragHandle.classList.add('hidden');
});

dragHandle.addEventListener('mouseleave', () => {
  if (!isDragging && !preview.matches(':hover')) {
    dragHandle.classList.add('hidden');
    hoveredBlock = null;
  }
});

dragHandle.addEventListener('mousedown', (e) => {
  if (!hoveredBlock) return;
  e.preventDefault();
  isDragging = true;
  draggedBlock = hoveredBlock;
  draggedBlock.classList.add('dragging');
  dragHandle.classList.add('hidden');
  dropIndicator.classList.remove('hidden');
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
});

function getDropPosition(y) {
  const children = Array.from(preview.children).filter(el => el !== draggedBlock);
  const containerRect = editorContainer.getBoundingClientRect();
  for (const child of children) {
    const rect = child.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      return { insertBefore: child, indicatorY: rect.top - containerRect.top };
    }
  }
  const last = children[children.length - 1];
  const indicatorY = last ? last.getBoundingClientRect().bottom - containerRect.top : 0;
  return { insertBefore: null, indicatorY };
}

function onDragMove(e) {
  const { indicatorY } = getDropPosition(e.clientY);
  dropIndicator.style.top = indicatorY + 'px';
}

function onDragEnd(e) {
  isDragging = false;
  draggedBlock.classList.remove('dragging');
  dropIndicator.classList.add('hidden');

  const { insertBefore } = getDropPosition(e.clientY);
  if (insertBefore) {
    preview.insertBefore(draggedBlock, insertBefore);
  } else {
    preview.appendChild(draggedBlock);
  }

  draggedBlock = null;
  hoveredBlock = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  scheduleSave();
}

// ── Syntax highlighting ──
function highlightCodeBlocks() {
  preview.querySelectorAll('pre:not(.code-block-wrapped)').forEach(addCodeBlockUI);
}

function addCodeBlockUI(pre) {
  const codeEl = pre.querySelector('code');
  if (!codeEl) return;

  // Normalize language alias (e.g. 'js' -> 'javascript')
  const rawLang = (codeEl.className.match(/language-(\w+)/) || [])[1] || '';
  const lang = LANG_ALIASES[rawLang] || rawLang;
  codeEl.className = lang ? `language-${lang}` : '';
  pre.className = `line-numbers code-block-wrapped${lang ? ` language-${lang}` : ''}`;

  // Wrap in container
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block-wrapper';
  pre.parentNode.insertBefore(wrapper, pre);
  wrapper.appendChild(pre);

  // pre is non-editable; code element is an editable island inside it
  pre.setAttribute('contenteditable', 'false');
  codeEl.setAttribute('contenteditable', 'true');

  // When focused, strip Prism spans so the user edits plain text
  codeEl.addEventListener('focus', () => {
    codeEl.textContent = codeEl.textContent;
  });

  // Re-highlight on blur
  codeEl.addEventListener('blur', () => {
    const currentLang = (codeEl.className.match(/language-(\w+)/) || [])[1] || '';
    if (currentLang && window.Prism) Prism.highlightElement(codeEl);
  });

  codeEl.addEventListener('input', scheduleSave);

  // Language picker
  const pickerDiv = document.createElement('div');
  pickerDiv.className = 'code-lang-picker';
  pickerDiv.setAttribute('contenteditable', 'false');

  const select = document.createElement('select');
  CODE_LANGUAGES.forEach(({ label, value }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === lang) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    const newLang = select.value;
    const rawCode = codeEl.textContent;
    codeEl.className = newLang ? `language-${newLang}` : '';
    pre.className = `line-numbers code-block-wrapped${newLang ? ` language-${newLang}` : ''}`;
    codeEl.textContent = rawCode;
    if (newLang && window.Prism) Prism.highlightElement(codeEl);
    scheduleSave();
  });

  pickerDiv.appendChild(select);
  wrapper.appendChild(pickerDiv);

  // Initial highlight
  if (lang && window.Prism) Prism.highlightElement(codeEl);
}

// ── Start ──
init();
