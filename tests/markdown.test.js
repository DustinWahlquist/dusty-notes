const { escapeHtml, inlineMarkdown, markdownToHtml } = require('../utils');

// ── escapeHtml ──────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  test('escapes &', () => expect(escapeHtml('a & b')).toBe('a &amp; b'));
  test('escapes <', () => expect(escapeHtml('<tag>')).toBe('&lt;tag&gt;'));
  test('escapes >', () => expect(escapeHtml('a > b')).toBe('a &gt; b'));
  test('escapes "', () => expect(escapeHtml('"hi"')).toBe('&quot;hi&quot;'));
  test('escapes multiple special chars', () => {
    expect(escapeHtml('<a & b>')).toBe('&lt;a &amp; b&gt;');
  });
  test('plain text passes through unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

// ── inlineMarkdown ──────────────────────────────────────────────────────────

describe('inlineMarkdown', () => {
  test('bold **', () => expect(inlineMarkdown('**bold**')).toBe('<strong>bold</strong>'));
  test('bold __', () => expect(inlineMarkdown('__bold__')).toBe('<strong>bold</strong>'));
  test('italic *', () => expect(inlineMarkdown('*italic*')).toBe('<em>italic</em>'));
  test('italic _', () => expect(inlineMarkdown('_italic_')).toBe('<em>italic</em>'));
  test('bold+italic ***', () => {
    expect(inlineMarkdown('***both***')).toBe('<strong><em>both</em></strong>');
  });
  test('bold+italic ___', () => {
    expect(inlineMarkdown('___both___')).toBe('<strong><em>both</em></strong>');
  });
  test('strikethrough', () => expect(inlineMarkdown('~~strike~~')).toBe('<del>strike</del>'));
  test('inline code', () => expect(inlineMarkdown('`code`')).toBe('<code>code</code>'));
  test('inline code protects its content from further processing', () => {
    expect(inlineMarkdown('`**not bold**`')).toBe('<code>**not bold**</code>');
  });
  test('link', () => {
    expect(inlineMarkdown('[text](https://example.com)')).toBe('<a href="https://example.com">text</a>');
  });
  test('image', () => {
    expect(inlineMarkdown('![alt text](image.png)')).toBe('<img alt="alt text" src="image.png">');
  });
  test('plain text passes through', () => expect(inlineMarkdown('hello')).toBe('hello'));
  test('mixed bold and italic in one string', () => {
    const result = inlineMarkdown('**bold** and *italic*');
    expect(result).toBe('<strong>bold</strong> and <em>italic</em>');
  });
});

// ── markdownToHtml ──────────────────────────────────────────────────────────

describe('markdownToHtml', () => {
  test('empty string returns empty string', () => {
    expect(markdownToHtml('')).toBe('');
  });
  test('null/falsy returns empty string', () => {
    expect(markdownToHtml(null)).toBe('');
    expect(markdownToHtml(undefined)).toBe('');
  });

  describe('headings', () => {
    test.each([
      ['# H1',       '<h1>H1</h1>'],
      ['## H2',      '<h2>H2</h2>'],
      ['### H3',     '<h3>H3</h3>'],
      ['#### H4',    '<h4>H4</h4>'],
      ['##### H5',   '<h5>H5</h5>'],
      ['###### H6',  '<h6>H6</h6>'],
    ])('%s', (input, expected) => {
      expect(markdownToHtml(input)).toContain(expected);
    });

    test('inline formatting inside heading', () => {
      expect(markdownToHtml('# **Bold** title')).toContain('<h1><strong>Bold</strong> title</h1>');
    });
  });

  describe('paragraphs', () => {
    test('plain text becomes a paragraph', () => {
      expect(markdownToHtml('Hello world')).toContain('<p>Hello world</p>');
    });
    test('inline bold inside paragraph', () => {
      expect(markdownToHtml('**bold**')).toContain('<p><strong>bold</strong></p>');
    });
    test('inline link inside paragraph', () => {
      expect(markdownToHtml('[click](https://x.com)')).toContain('<a href="https://x.com">click</a>');
    });
  });

  describe('horizontal rule', () => {
    test('---', () => expect(markdownToHtml('---')).toContain('<hr>'));
    test('***', () => expect(markdownToHtml('***')).toContain('<hr>'));
    test('___', () => expect(markdownToHtml('___')).toContain('<hr>'));
    test('---- (4+ dashes)', () => expect(markdownToHtml('----')).toContain('<hr>'));
  });

  describe('blockquote', () => {
    test('wraps content in blockquote', () => {
      const html = markdownToHtml('> quoted text');
      expect(html).toContain('<blockquote>');
      expect(html).toContain('<p>quoted text</p>');
      expect(html).toContain('</blockquote>');
    });
    test('blockquote with inline formatting', () => {
      expect(markdownToHtml('> **important**')).toContain('<strong>important</strong>');
    });
  });

  describe('unordered lists', () => {
    test('- bullet', () => {
      const html = markdownToHtml('- alpha\n- beta');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>alpha</li>');
      expect(html).toContain('<li>beta</li>');
      expect(html).toContain('</ul>');
    });
    test('* bullet', () => expect(markdownToHtml('* item')).toContain('<li>item</li>'));
    test('+ bullet', () => expect(markdownToHtml('+ item')).toContain('<li>item</li>'));
    test('inline formatting in list item', () => {
      expect(markdownToHtml('- **bold item**')).toContain('<strong>bold item</strong>');
    });
  });

  describe('ordered lists', () => {
    test('numbered list', () => {
      const html = markdownToHtml('1. first\n2. second\n3. third');
      expect(html).toContain('<ol>');
      expect(html).toContain('<li>first</li>');
      expect(html).toContain('<li>second</li>');
      expect(html).toContain('<li>third</li>');
      expect(html).toContain('</ol>');
    });
  });

  describe('todo checkboxes', () => {
    test('unchecked [ ]', () => {
      const html = markdownToHtml('- [ ] task');
      expect(html).toContain('<input type="checkbox">');
      expect(html).toContain('task');
      expect(html).not.toContain('checked');
    });
    test('checked [x]', () => {
      const html = markdownToHtml('- [x] done');
      expect(html).toContain('<input type="checkbox" checked>');
      expect(html).toContain('<del class="checked-text">done</del>');
    });
    test('checked [X] uppercase', () => {
      expect(markdownToHtml('- [X] done')).toContain('<input type="checkbox" checked>');
    });
  });

  describe('fenced code blocks', () => {
    test('no language', () => {
      const html = markdownToHtml('```\nhello\n```');
      expect(html).toContain('<pre>');
      expect(html).toContain('<code');
      expect(html).toContain('hello');
    });
    test('with language class', () => {
      const html = markdownToHtml('```javascript\nconst x = 1;\n```');
      expect(html).toContain('class="language-javascript"');
      expect(html).toContain('const x = 1;');
    });
    test('HTML inside code block is escaped', () => {
      const html = markdownToHtml('```\n<div>hi</div>\n```');
      expect(html).toContain('&lt;div&gt;');
      expect(html).not.toContain('<div>');
    });
    test('& inside code block is escaped', () => {
      const html = markdownToHtml('```\na & b\n```');
      expect(html).toContain('&amp;');
    });
  });

  describe('CRLF normalization', () => {
    test('converts \\r\\n to \\n before processing', () => {
      expect(markdownToHtml('# Title\r\n\r\nParagraph')).toContain('<h1>Title</h1>');
    });
  });
});
