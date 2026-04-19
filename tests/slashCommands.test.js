const { SLASH_COMMANDS } = require('../utils');

function filterCommands(query) {
  return SLASH_COMMANDS.filter(cmd =>
    cmd.keyword.includes(query) || cmd.name.toLowerCase().includes(query)
  );
}

// ── Command data integrity ───────────────────────────────────────────────────

describe('SLASH_COMMANDS data', () => {
  test('every command has a name, keyword, icon, and desc', () => {
    SLASH_COMMANDS.forEach(cmd => {
      expect(cmd.name).toBeTruthy();
      expect(cmd.keyword).toBeTruthy();
      expect(cmd.icon).toBeTruthy();
      expect(cmd.desc).toBeTruthy();
    });
  });

  test('non-clear commands have an insert string', () => {
    SLASH_COMMANDS.filter(c => c.action !== 'clear').forEach(cmd => {
      expect(typeof cmd.insert).toBe('string');
    });
  });

  test('clear command has action "clear" and no insert', () => {
    const clear = SLASH_COMMANDS.find(c => c.keyword === 'clear');
    expect(clear.action).toBe('clear');
    expect(clear.insert).toBeUndefined();
  });

  test('code block has cursorOffset 4 (positions cursor inside the fences)', () => {
    const code = SLASH_COMMANDS.find(c => c.keyword === 'code');
    expect(code.cursorOffset).toBe(4);
  });

  test('heading inserts start with the correct # prefix', () => {
    expect(SLASH_COMMANDS.find(c => c.keyword === 'h1').insert).toBe('# ');
    expect(SLASH_COMMANDS.find(c => c.keyword === 'h2').insert).toBe('## ');
    expect(SLASH_COMMANDS.find(c => c.keyword === 'h3').insert).toBe('### ');
  });

  test('todo insert is a markdown checkbox prefix', () => {
    const todo = SLASH_COMMANDS.find(c => c.keyword === 'todo');
    expect(todo.insert).toBe('- [ ] ');
  });
});

// ── Filtering ────────────────────────────────────────────────────────────────

describe('slash command filtering', () => {
  test('empty query returns all commands', () => {
    expect(filterCommands('')).toHaveLength(SLASH_COMMANDS.length);
  });

  test('exact keyword match', () => {
    expect(filterCommands('h1')).toHaveLength(1);
    expect(filterCommands('h1')[0].name).toBe('Heading 1');
  });

  test('"h" matches all three headings (and nothing else)', () => {
    const results = filterCommands('h');
    const headings = results.filter(r => r.name.startsWith('Heading'));
    expect(headings).toHaveLength(3);
  });

  test('partial keyword match', () => {
    expect(filterCommands('div').some(c => c.keyword === 'divider')).toBe(true);
  });

  test('name-based match (case insensitive)', () => {
    expect(filterCommands('heading').length).toBeGreaterThanOrEqual(3);
  });

  test('no match returns empty array', () => {
    expect(filterCommands('xyzzy')).toHaveLength(0);
  });

  test('"todo" matches exactly the todo command', () => {
    const results = filterCommands('todo');
    expect(results.some(c => c.keyword === 'todo')).toBe(true);
  });

  test('"code" matches code block', () => {
    expect(filterCommands('code').some(c => c.keyword === 'code')).toBe(true);
  });

  test('"clear" matches clear command', () => {
    expect(filterCommands('clear').some(c => c.keyword === 'clear')).toBe(true);
  });
});
