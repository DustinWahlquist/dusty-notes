const { htmlToMarkdown } = require('../utils');

function el(tag, ...children) {
  const node = document.createElement(tag);
  children.forEach(c => {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
  return node;
}

function wrap(...children) {
  return el('div', ...children);
}

// ── Block elements ──────────────────────────────────────────────────────────

describe('headings', () => {
  test.each([
    ['h1', '# Title'],
    ['h2', '## Title'],
    ['h3', '### Title'],
    ['h4', '#### Title'],
    ['h5', '##### Title'],
    ['h6', '###### Title'],
  ])('%s', (tag, expected) => {
    expect(htmlToMarkdown(wrap(el(tag, 'Title')))).toBe(expected);
  });
});

describe('paragraph', () => {
  test('plain text', () => {
    expect(htmlToMarkdown(wrap(el('p', 'Hello')))).toBe('Hello');
  });
});

describe('horizontal rule', () => {
  test('<hr>', () => {
    expect(htmlToMarkdown(wrap(document.createElement('hr')))).toBe('---');
  });
});

describe('blockquote', () => {
  test('single line', () => {
    const bq = el('blockquote', el('p', 'quoted'));
    expect(htmlToMarkdown(wrap(bq))).toContain('> quoted');
  });
});

// ── Inline elements ─────────────────────────────────────────────────────────

describe('inline formatting', () => {
  test('strong → **', () => expect(htmlToMarkdown(wrap(el('strong', 'bold')))).toBe('**bold**'));
  test('b → **',      () => expect(htmlToMarkdown(wrap(el('b', 'bold')))).toBe('**bold**'));
  test('em → *',      () => expect(htmlToMarkdown(wrap(el('em', 'italic')))).toBe('*italic*'));
  test('i → *',       () => expect(htmlToMarkdown(wrap(el('i', 'italic')))).toBe('*italic*'));
  test('del → ~~',    () => expect(htmlToMarkdown(wrap(el('del', 'strike')))).toBe('~~strike~~'));
  test('s → ~~',      () => expect(htmlToMarkdown(wrap(el('s', 'strike')))).toBe('~~strike~~'));
  test('inline code', () => expect(htmlToMarkdown(wrap(el('code', 'x = 1')))).toBe('`x = 1`'));
});

// ── Links ───────────────────────────────────────────────────────────────────

describe('links', () => {
  test('named link → [text](href)', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com';
    a.textContent = 'Example';
    expect(htmlToMarkdown(wrap(a))).toBe('[Example](https://example.com)');
  });

  test('bare URL link (text === href) → plain URL', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com';
    a.textContent = 'https://example.com';
    expect(htmlToMarkdown(wrap(a))).toBe('https://example.com');
  });
});

// ── Lists ───────────────────────────────────────────────────────────────────

describe('unordered list', () => {
  test('two items', () => {
    const ul = document.createElement('ul');
    ul.innerHTML = '<li>one</li><li>two</li>';
    const result = htmlToMarkdown(wrap(ul));
    expect(result).toContain('- one');
    expect(result).toContain('- two');
  });
});

describe('ordered list', () => {
  test('two items', () => {
    const ol = document.createElement('ol');
    ol.innerHTML = '<li>first</li><li>second</li>';
    const result = htmlToMarkdown(wrap(ol));
    expect(result).toContain('1. first');
    expect(result).toContain('2. second');
  });
});

// ── Checkboxes ──────────────────────────────────────────────────────────────

describe('todo checkboxes', () => {
  function makeTodoLi(checked, labelText) {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    li.appendChild(cb);
    li.appendChild(document.createTextNode(labelText));
    ul.appendChild(li);
    return ul;
  }

  test('unchecked → - [ ]', () => {
    const result = htmlToMarkdown(wrap(makeTodoLi(false, 'task')));
    expect(result).toContain('- [ ]');
    expect(result).toContain('task');
  });

  test('checked → - [x]', () => {
    const result = htmlToMarkdown(wrap(makeTodoLi(true, 'done')));
    expect(result).toContain('- [x]');
    expect(result).toContain('done');
  });
});

// ── Code blocks ─────────────────────────────────────────────────────────────

describe('code blocks', () => {
  function makeCodeBlock(lang, code) {
    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    if (lang) codeEl.className = `language-${lang}`;
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    return pre;
  }

  test('no language → ```\\ncode\\n```', () => {
    const result = htmlToMarkdown(wrap(makeCodeBlock('', 'const x = 1;')));
    expect(result).toBe('```\nconst x = 1;\n```');
  });

  test('with language → ```lang\\ncode\\n```', () => {
    const result = htmlToMarkdown(wrap(makeCodeBlock('javascript', 'const x = 1;')));
    expect(result).toBe('```javascript\nconst x = 1;\n```');
  });
});

// ── Round-trip fidelity ──────────────────────────────────────────────────────

describe('round-trip: markdownToHtml → htmlToMarkdown', () => {
  const { markdownToHtml } = require('../utils');

  function roundTrip(md) {
    const container = document.createElement('div');
    container.innerHTML = markdownToHtml(md);
    return htmlToMarkdown(container);
  }

  test('heading round-trips', () => expect(roundTrip('# My Title')).toBe('# My Title'));
  test('paragraph round-trips', () => expect(roundTrip('Hello world')).toBe('Hello world'));
  test('bold round-trips', () => expect(roundTrip('**bold**')).toBe('**bold**'));
  test('unordered list round-trips', () => {
    const result = roundTrip('- alpha\n- beta');
    expect(result).toContain('- alpha');
    expect(result).toContain('- beta');
  });
  test('unchecked todo round-trips', () => {
    expect(roundTrip('- [ ] task')).toContain('- [ ]');
  });
  test('checked todo round-trips', () => {
    expect(roundTrip('- [x] done')).toContain('- [x]');
  });
  test('code block round-trips', () => {
    const result = roundTrip('```javascript\nconst x = 1;\n```');
    expect(result).toContain('```javascript');
    expect(result).toContain('const x = 1;');
  });
  test('horizontal rule round-trips', () => {
    expect(roundTrip('---')).toBe('---');
  });
});
