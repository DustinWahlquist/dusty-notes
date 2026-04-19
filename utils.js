// Pure utility functions shared between sidepanel.js and the test suite.
// In the browser these become globals (loaded before sidepanel.js).
// In Node.js (Jest) they are exported via CommonJS.

const LANG_ALIASES = {
  'js': 'javascript', 'ts': 'typescript', 'py': 'python',
  'html': 'markup', 'sh': 'bash', 'shell': 'bash', 'md': 'markdown',
};

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

const SLASH_COMMANDS = [
  { name: 'Heading 1',  keyword: 'h1',      icon: 'H1',       desc: 'Large heading',       insert: '# '  },
  { name: 'Heading 2',  keyword: 'h2',      icon: 'H2',       desc: 'Medium heading',      insert: '## ' },
  { name: 'Heading 3',  keyword: 'h3',      icon: 'H3',       desc: 'Small heading',       insert: '### ' },
  { name: 'To-do',      keyword: 'todo',    icon: '\u2610',   desc: 'Checkbox item',       insert: '- [ ] ' },
  { name: 'Code Block', keyword: 'code',    icon: '<>',       desc: 'Fenced code block',   insert: '```\n\n```', cursorOffset: 4 },
  { name: 'Table',      keyword: 'table',   icon: '\u2637',   desc: 'Markdown table',      insert: '| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| cell     | cell     | cell     |\n' },
  { name: 'Divider',    keyword: 'divider', icon: '\u2014',   desc: 'Horizontal rule',     insert: '\n---\n' },
  { name: 'Clear',      keyword: 'clear',   icon: '\u2715',   desc: 'Clear all content',   action: 'clear' },
];

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineMarkdown(text) {
  // Stash code spans first so their content is never touched by later regexes.
  const codeSpans = [];
  text = text.replace(/`([^`]+)`/g, (_, content) => {
    codeSpans.push(`<code>${content}</code>`);
    return `\x00CODE${codeSpans.length - 1}\x00`;
  });

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

  // Restore code spans
  text = text.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeSpans[parseInt(i)]);

  return text;
}

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

if (typeof module !== 'undefined') {
  module.exports = {
    escapeHtml,
    inlineMarkdown,
    markdownToHtml,
    htmlToMarkdown,
    nodeToMarkdown,
    liContent,
    LANG_ALIASES,
    CODE_LANGUAGES,
    SLASH_COMMANDS,
  };
}
