/* ZDD Script：游戏内置的自动化剧本解释器。
 *
 * 这是一个刻意缩小、没有 eval / Function 的 Python 风格子集：
 *   - 变量、列表、字符串、数字、True/False/None
 *   - if / elif / else、for / while、break / continue / pass
 *   - 比较、and / or / not、in、索引、属性访问
 *   - 内置查询与处置函数（alerts / devices / events / find / status /
 *     scan / isolate / clean / release ...）
 *
 * 脚本只能通过 host.action() 调用游戏操作，不会接触浏览器、网络或真实系统。
 * 解释器与界面无关，方便在 Node 里做单元测试。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  const ACTIONS = [
    'scan', 'isolate', 'release', 'clean', 'patch', 'shutdown',
    'start', 'restore', 'mail', 'passwd', 'block', 'protect', 'next',
  ];

  const BUILTINS = [
    'print', 'log', 'len', 'range', 'str', 'int', 'float', 'bool', 'help',
    'alerts', 'devices', 'events', 'find', 'status',
  ];

  const HELP_TEXT = [
    '可用函数：',
    '  查询：alerts() devices() events() find("PC-01") status()',
    '  处置：scan(x) isolate(x) release(x) clean(x) patch(x) block(x)',
    '        mail(x) passwd(x) shutdown(x) start(x) restore(x) protect(x) next()',
    '  其他：print(...) len(x) range(n) str(x) int(x) float(x) bool(x)',
    '  对象：a.title a.level a.device a.investigated；d.status d.patched d.controlled',
    '  控制：if / elif / else、for x in alerts():、while、break、continue',
  ].join('\n');

  class ScriptError extends Error {
    constructor(message, line, column) {
      super(message);
      this.name = 'ScriptError';
      this.line = Number(line) || 0;
      this.column = Number(column) || 0;
    }

    get display() {
      const place = this.line
        ? `第 ${this.line} 行${this.column ? `，第 ${this.column} 列` : ''}：`
        : '';
      return `${place}${this.message}`;
    }
  }

  function fail(line, column, message) {
    throw new ScriptError(message, line, column);
  }

  function wrap(kind, value, props) {
    return { __zdd: true, kind, value, props: props || {} };
  }

  function isWrapped(value) {
    return Boolean(value && value.__zdd);
  }

  function unwrap(value) {
    return isWrapped(value) ? value.value : value;
  }

  function stringify(value) {
    if (value === null || value === undefined) return 'None';
    if (value === true) return 'True';
    if (value === false) return 'False';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : String(value);
    }
    if (Array.isArray(value)) return `[${value.map((item) => stringify(item)).join(', ')}]`;
    if (isWrapped(value)) {
      if (value.kind === 'alert') {
        const alert = value.value;
        return `alert#${alert.alertId}(${alert.displayLevel} ${alert.title})`;
      }
      if (value.kind === 'device') {
        const device = value.value;
        return `device#${device.deviceId}(${device.status})`;
      }
      if (value.kind === 'event') {
        const event = value.value;
        return `event#${event.eventId}(${event.name} ${event.statusText})`;
      }
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value)
        .map(([key, item]) => `${key}: ${stringify(item)}`);
      return `{${entries.join(', ')}}`;
    }
    return String(value);
  }

  // ------------------------------------------------------------------
  // 源码预处理：按行、缩进、注释
  // ------------------------------------------------------------------
  function stripComment(text) {
    let quote = null;
    for (let index = 0; index < text.length; index += 1) {
      const ch = text[index];
      if (quote) {
        if (ch === '\\') {
          index += 1;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '#') return text.slice(0, index);
    }
    return text;
  }

  function prepareLines(source) {
    const rawLines = String(source === undefined || source === null ? '' : source)
      .replace(/\r\n?/g, '\n')
      .split('\n');
    const lines = [];
    rawLines.forEach((raw, index) => {
      let indent = 0;
      let cursor = 0;
      while (cursor < raw.length) {
        if (raw[cursor] === ' ') indent += 1;
        else if (raw[cursor] === '\t') indent += 2;
        else break;
        cursor += 1;
      }
      const text = stripComment(raw.slice(cursor)).replace(/\s+$/, '');
      if (!text.trim()) return;
      lines.push({ indent, text: text.trim(), number: index + 1 });
    });
    return lines;
  }

  // ------------------------------------------------------------------
  // 表达式词法
  // ------------------------------------------------------------------
  const OPERATORS = ['==', '!=', '<=', '>=', '+', '-', '*', '/', '%',
    '(', ')', '[', ']', ',', '.', '<', '>', '='];

  class Lexer {
    constructor(text, line) {
      this.text = String(text);
      this.line = line;
      this.index = 0;
      this.tokens = [];
    }

    error(column, message) {
      fail(this.line, column, message);
    }

    tokenize() {
      while (this.index < this.text.length) {
        const ch = this.text[this.index];
        if (/\s/.test(ch)) {
          this.index += 1;
          continue;
        }
        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(this.text[this.index + 1] || ''))) {
          this.readNumber();
          continue;
        }
        if (ch === '"' || ch === "'") {
          this.readString(ch);
          continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
          this.readName();
          continue;
        }
        const operator = OPERATORS.find((item) => this.text.startsWith(item, this.index));
        if (operator) {
          this.tokens.push({
            type: 'op', value: operator, line: this.line, column: this.index + 1,
          });
          this.index += operator.length;
          continue;
        }
        this.error(this.index + 1, `无法识别的字符「${ch}」`);
      }
      this.tokens.push({ type: 'eof', value: '', line: this.line, column: this.index + 1 });
      return this.tokens;
    }

    readNumber() {
      const start = this.index;
      while (/[0-9]/.test(this.text[this.index] || '')) this.index += 1;
      if (this.text[this.index] === '.') {
        this.index += 1;
        while (/[0-9]/.test(this.text[this.index] || '')) this.index += 1;
      }
      const raw = this.text.slice(start, this.index);
      const value = Number(raw);
      if (!Number.isFinite(value)) this.error(start + 1, `数字格式不对：${raw}`);
      this.tokens.push({
        type: 'num', value, raw, line: this.line, column: start + 1,
      });
    }

    readString(quote) {
      const start = this.index;
      this.index += 1;
      let value = '';
      while (this.index < this.text.length) {
        const ch = this.text[this.index];
        if (ch === '\\') {
          const next = this.text[this.index + 1];
          if (next === undefined) this.error(this.index + 1, '字符串没有结束');
          if (next === 'n') value += '\n';
          else if (next === 't') value += '\t';
          else if (next === '\\') value += '\\';
          else if (next === quote) value += quote;
          else value += next;
          this.index += 2;
          continue;
        }
        if (ch === quote) {
          this.index += 1;
          this.tokens.push({
            type: 'str', value, line: this.line, column: start + 1,
          });
          return;
        }
        value += ch;
        this.index += 1;
      }
      this.error(start + 1, '字符串没有结束');
    }

    readName() {
      const start = this.index;
      while (/[A-Za-z0-9_]/.test(this.text[this.index] || '')) this.index += 1;
      const raw = this.text.slice(start, this.index);
      this.tokens.push({
        type: 'name', value: raw, line: this.line, column: start + 1,
      });
    }
  }

  // ------------------------------------------------------------------
  // 表达式语法
  // ------------------------------------------------------------------
  class ExprParser {
    constructor(tokens, line) {
      this.tokens = tokens;
      this.line = line;
      this.pos = 0;
    }

    peek(offset) {
      return this.tokens[this.pos + (offset || 0)] || this.tokens[this.tokens.length - 1];
    }

    next() {
      const token = this.peek();
      this.pos += 1;
      return token;
    }

    matchOp(value) {
      const token = this.peek();
      if (token.type === 'op' && token.value === value) {
        this.pos += 1;
        return true;
      }
      return false;
    }

    isName(value) {
      const token = this.peek();
      return token.type === 'name' && token.value === value;
    }

    expectEof() {
      if (this.peek().type !== 'eof') {
        const token = this.peek();
        fail(this.line, token.column, `表达式后有多余内容「${token.value || token.type}」`);
      }
    }

    parseExpression() {
      return this.parseOr();
    }

    parseOr() {
      let node = this.parseAnd();
      while (this.isName('or')) {
        const token = this.next();
        node = { type: 'binary', op: 'or', left: node, right: this.parseAnd(), line: this.line, column: token.column };
      }
      return node;
    }

    parseAnd() {
      let node = this.parseNot();
      while (this.isName('and')) {
        const token = this.next();
        node = { type: 'binary', op: 'and', left: node, right: this.parseNot(), line: this.line, column: token.column };
      }
      return node;
    }

    parseNot() {
      if (this.isName('not')) {
        const token = this.next();
        return { type: 'unary', op: 'not', operand: this.parseNot(), line: this.line, column: token.column };
      }
      return this.parseComparison();
    }

    parseComparison() {
      const left = this.parseAdditive();
      const ops = [];
      const rights = [];
      let node = left;
      for (;;) {
        const token = this.peek();
        if (token.type === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(token.value)) {
          ops.push(token.value);
          this.next();
          rights.push(this.parseAdditive());
          continue;
        }
        if (token.type === 'name' && token.value === 'in') {
          ops.push('in');
          this.next();
          rights.push(this.parseAdditive());
          continue;
        }
        if (
          token.type === 'name' && token.value === 'not'
          && this.peek(1).type === 'name' && this.peek(1).value === 'in'
        ) {
          ops.push('not in');
          this.next();
          this.next();
          rights.push(this.parseAdditive());
          continue;
        }
        break;
      }
      if (!ops.length) return node;
      return { type: 'compare', left, ops, rights, line: this.line };
    }

    parseAdditive() {
      let node = this.parseMultiplicative();
      while (this.peek().type === 'op' && ['+', '-'].includes(this.peek().value)) {
        const token = this.next();
        node = {
          type: 'binary', op: token.value, left: node, right: this.parseMultiplicative(), line: this.line, column: token.column,
        };
      }
      return node;
    }

    parseMultiplicative() {
      let node = this.parseUnary();
      while (this.peek().type === 'op' && ['*', '/', '%'].includes(this.peek().value)) {
        const token = this.next();
        node = {
          type: 'binary', op: token.value, left: node, right: this.parseUnary(), line: this.line, column: token.column,
        };
      }
      return node;
    }

    parseUnary() {
      if (this.peek().type === 'op' && ['-', '+'].includes(this.peek().value)) {
        const token = this.next();
        return { type: 'unary', op: token.value, operand: this.parseUnary(), line: this.line, column: token.column };
      }
      return this.parsePostfix();
    }

    parsePostfix() {
      let node = this.parsePrimary();
      for (;;) {
        if (this.matchOp('.')) {
          const name = this.next();
          if (name.type !== 'name') fail(this.line, name.column, '「.」后面需要属性名');
          node = { type: 'attr', object: node, name: name.value, line: this.line };
          continue;
        }
        if (this.matchOp('[')) {
          const index = this.parseExpression();
          if (!this.matchOp(']')) fail(this.line, this.peek().column, '缺少「]」');
          node = { type: 'index', object: node, index, line: this.line };
          continue;
        }
        if (this.matchOp('(')) {
          const args = [];
          if (!this.matchOp(')')) {
            for (;;) {
              args.push(this.parseExpression());
              if (this.matchOp(',')) {
                if (this.matchOp(')')) break;
                continue;
              }
              if (this.matchOp(')')) break;
              fail(this.line, this.peek().column, '函数参数缺少「,」或「)」');
            }
          }
          node = { type: 'call', callee: node, args, line: this.line };
          continue;
        }
        break;
      }
      return node;
    }

    parsePrimary() {
      const token = this.next();
      if (token.type === 'num') return { type: 'literal', value: token.value, line: this.line };
      if (token.type === 'str') return { type: 'literal', value: token.value, line: this.line };
      if (token.type === 'name') {
        if (token.value === 'True') return { type: 'literal', value: true, line: this.line };
        if (token.value === 'False') return { type: 'literal', value: false, line: this.line };
        if (token.value === 'None') return { type: 'literal', value: null, line: this.line };
        return { type: 'name', name: token.value, line: this.line, column: token.column };
      }
      if (token.type === 'op' && token.value === '(') {
        const expression = this.parseExpression();
        if (!this.matchOp(')')) fail(this.line, token.column, '缺少「)」');
        return expression;
      }
      if (token.type === 'op' && token.value === '[') {
        const items = [];
        if (!this.matchOp(']')) {
          for (;;) {
            items.push(this.parseExpression());
            if (this.matchOp(',')) {
              if (this.matchOp(']')) break;
              continue;
            }
            if (this.matchOp(']')) break;
            fail(this.line, this.peek().column, '列表缺少「,」或「]」');
          }
        }
        return { type: 'list', items, line: this.line };
      }
      fail(this.line, token.column, `这里需要一个值，而不是「${token.value || token.type}」`);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // 语句语法
  // ------------------------------------------------------------------
  const UNSUPPORTED = ['def', 'return', 'import', 'from', 'try', 'except', 'finally', 'class', 'with', 'lambda'];

  class Parser {
    constructor(lines) {
      this.lines = lines;
      this.index = 0;
    }

    error(line, message) {
      fail(line, 1, message);
    }

    parse() {
      if (!this.lines.length) {
        return { type: 'program', body: [] };
      }
      const body = this.parseBlock(0);
      if (this.index < this.lines.length) {
        const line = this.lines[this.index];
        this.error(line.number, '缩进不一致：这一行没有对应的代码块');
      }
      return { type: 'program', body };
    }

    parseBlock(indent) {
      const body = [];
      while (this.index < this.lines.length && this.lines[this.index].indent >= indent) {
        const line = this.lines[this.index];
        if (line.indent > indent) {
          this.error(line.number, '缩进不一致：这一行比同一代码块里的其他行更深');
        }
        this.index += 1;
        body.push(this.parseStatement(line));
      }
      return body;
    }

    parseChildBlock(parent) {
      if (this.index >= this.lines.length) return [];
      const next = this.lines[this.index];
      if (next.indent <= parent.indent) return [];
      return this.parseBlock(next.indent);
    }

    parseCondition(text, line, keywordLength) {
      const rest = text.slice(keywordLength).trim();
      if (!rest.endsWith(':')) {
        this.error(line.number, '条件后面缺少冒号「:」');
      }
      const expressionText = rest.slice(0, -1).trim();
      if (!expressionText) this.error(line.number, '条件不能为空');
      const parser = new ExprParser(new Lexer(expressionText, line.number).tokenize(), line.number);
      const expression = parser.parseExpression();
      parser.expectEof();
      return expression;
    }

    parseStatement(line) {
      const text = line.text;
      const firstWord = text.split(/\s+/)[0];
      if (UNSUPPORTED.includes(firstWord)) {
        this.error(line.number, `暂不支持「${firstWord}」；可以先用 for / if 和内置函数`);
      }
      if (text === 'pass') return { type: 'pass', line: line.number };
      if (text === 'break') return { type: 'break', line: line.number };
      if (text === 'continue') return { type: 'continue', line: line.number };
      if (text.startsWith('if ')) return this.parseIf(line);
      if (text.startsWith('elif ') || text === 'else:' || text.startsWith('else ')) {
        this.error(line.number, 'elif / else 没有匹配的 if');
      }
      if (text.startsWith('for ')) return this.parseFor(line);
      if (text.startsWith('while ')) return this.parseWhile(line);
      return this.parseSimple(line);
    }

    parseIf(line) {
      const branches = [];
      let condition = this.parseCondition(line.text, line, 2);
      let body = this.parseChildBlock(line);
      branches.push({ condition, body });

      let elseBody = null;
      while (this.index < this.lines.length && this.lines[this.index].indent === line.indent) {
        const next = this.lines[this.index];
        if (next.text.startsWith('elif ')) {
          this.index += 1;
          condition = this.parseCondition(next.text, next, 4);
          body = this.parseChildBlock(next);
          branches.push({ condition, body });
          continue;
        }
        if (next.text === 'else:' || next.text.startsWith('else:')) {
          this.index += 1;
          elseBody = this.parseChildBlock(next);
          break;
        }
        break;
      }
      return { type: 'if', line: line.number, branches, elseBody };
    }

    parseFor(line) {
      let rest = line.text.slice(3).trim();
      if (!rest.endsWith(':')) this.error(line.number, 'for 后面缺少冒号「:」');
      rest = rest.slice(0, -1).trim();
      const match = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/);
      if (!match) this.error(line.number, 'for 的写法是：for 变量 in 列表:');
      const parser = new ExprParser(new Lexer(match[2], line.number).tokenize(), line.number);
      const iterable = parser.parseExpression();
      parser.expectEof();
      const body = this.parseChildBlock(line);
      return { type: 'for', line: line.number, name: match[1], iterable, body };
    }

    parseWhile(line) {
      const condition = this.parseCondition(line.text, line, 5);
      const body = this.parseChildBlock(line);
      return { type: 'while', line: line.number, condition, body };
    }

    parseSimple(line) {
      const parser = new ExprParser(new Lexer(line.text, line.number).tokenize(), line.number);
      const first = parser.parseExpression();
      if (parser.matchOp('=')) {
        if (first.type !== 'name') this.error(line.number, '只能给变量赋值，例如 x = 1');
        const value = parser.parseExpression();
        parser.expectEof();
        return { type: 'assign', line: line.number, name: first.name, value };
      }
      parser.expectEof();
      return { type: 'expr', line: line.number, expr: first };
    }
  }

  // ------------------------------------------------------------------
  // 运行时
  // ------------------------------------------------------------------
  function isTruthy(value) {
    if (value === null || value === undefined || value === false) return false;
    if (value === 0 || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  function equals(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => equals(item, b[index]));
    }
    if (isWrapped(a) || isWrapped(b)) return unwrap(a) === unwrap(b);
    return a === b;
  }

  function toIterable(value, line) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return Array.from(value);
    if (value === null || value === undefined) return [];
    fail(line, 1, `不能遍历 ${stringify(value)}`);
    return [];
  }

  function getAttr(object, name, line) {
    if (object === null || object === undefined) {
      fail(line, 1, `None 没有属性「${name}」`);
    }
    if (isWrapped(object)) {
      const props = object.props || {};
      if (Object.prototype.hasOwnProperty.call(props, name)) {
        const prop = props[name];
        return typeof prop === 'function' ? prop() : prop;
      }
      fail(line, 1, `对象没有属性「${name}」`);
    }
    if (typeof object === 'string' && name === 'length') return object.length;
    if (Array.isArray(object) && name === 'length') return object.length;
    if (typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, name)) {
      return object[name];
    }
    fail(line, 1, `对象没有属性「${name}」`);
    return null;
  }

  function getIndex(object, index, line) {
    if (Array.isArray(object)) {
      const position = index < 0 ? object.length + index : index;
      if (position < 0 || position >= object.length) fail(line, 1, `列表下标越界：${index}`);
      return object[position];
    }
    if (typeof object === 'string') {
      const position = index < 0 ? object.length + index : index;
      if (position < 0 || position >= object.length) fail(line, 1, `字符串下标越界：${index}`);
      return object[position];
    }
    fail(line, 1, '只有列表和字符串可以取下标');
    return null;
  }

  function evalExpr(node, state, host) {
    if (!node) return null;
    switch (node.type) {
      case 'literal':
        return node.value;
      case 'name':
        if (!state.env.has(node.name)) {
          fail(node.line, node.column || 1, `变量「${node.name}」还没有赋值`);
        }
        return state.env.get(node.name);
      case 'list':
        return node.items.map((item) => evalExpr(item, state, host));
      case 'unary': {
        const value = evalExpr(node.operand, state, host);
        if (node.op === 'not') return !isTruthy(value);
        if (node.op === '-') {
          if (typeof value !== 'number') fail(node.line, 1, '一元「-」需要数字');
          return -value;
        }
        if (node.op === '+') {
          if (typeof value !== 'number') fail(node.line, 1, '一元「+」需要数字');
          return value;
        }
        fail(node.line, 1, `未知运算符：${node.op}`);
        return null;
      }
      case 'binary': {
        if (node.op === 'and') {
          const left = evalExpr(node.left, state, host);
          return isTruthy(left) ? evalExpr(node.right, state, host) : left;
        }
        if (node.op === 'or') {
          const left = evalExpr(node.left, state, host);
          return isTruthy(left) ? left : evalExpr(node.right, state, host);
        }
        const left = evalExpr(node.left, state, host);
        const right = evalExpr(node.right, state, host);
        if (node.op === '+') {
          if (typeof left === 'number' && typeof right === 'number') return left + right;
          if (typeof left === 'string' || typeof right === 'string') {
            return `${stringify(left)}${stringify(right)}`;
          }
          if (Array.isArray(left) && Array.isArray(right)) return left.concat(right);
          fail(node.line, 1, '「+」需要两个数字或两个字符串');
        }
        if (!['-', '*', '/', '%'].includes(node.op)) fail(node.line, 1, `未知运算符：${node.op}`);
        if (typeof left !== 'number' || typeof right !== 'number') {
          fail(node.line, 1, `「${node.op}」需要两个数字`);
        }
        if (node.op === '-' ) return left - right;
        if (node.op === '*') return left * right;
        if (node.op === '/') {
          if (right === 0) fail(node.line, 1, '不能除以 0');
          return left / right;
        }
        if (right === 0) fail(node.line, 1, '不能对 0 取余');
        return left % right;
      }
      case 'compare': {
        let left = evalExpr(node.left, state, host);
        for (let index = 0; index < node.ops.length; index += 1) {
          const right = evalExpr(node.rights[index], state, host);
          const op = node.ops[index];
          let ok = false;
          if (op === '==') ok = equals(left, right);
          else if (op === '!=') ok = !equals(left, right);
          else if (op === 'in' || op === 'not in') {
            if (typeof right === 'string') ok = right.includes(stringify(left));
            else if (Array.isArray(right)) ok = right.some((item) => equals(item, left));
            else fail(node.line, 1, '「in」右边需要字符串或列表');
            if (op === 'not in') ok = !ok;
          } else {
            if (typeof left !== typeof right || (typeof left !== 'number' && typeof left !== 'string')) {
              fail(node.line, 1, '比较需要两个数字或两个字符串');
            }
            if (op === '<') ok = left < right;
            else if (op === '<=') ok = left <= right;
            else if (op === '>') ok = left > right;
            else if (op === '>=') ok = left >= right;
          }
          if (!ok) return false;
          left = right;
        }
        return true;
      }
      case 'attr':
        return getAttr(evalExpr(node.object, state, host), node.name, node.line);
      case 'index':
        return getIndex(
          evalExpr(node.object, state, host),
          evalExpr(node.index, state, host),
          node.line,
        );
      case 'call':
        return evalCall(node, state, host);
      default:
        fail(node.line, 1, `未知表达式：${node.type}`);
        return null;
    }
  }

  function evalCall(node, state, host) {
    if (node.callee.type !== 'name') {
      fail(node.line, 1, '只支持直接调用内置函数，例如 scan(a)');
    }
    const name = node.callee.name;
    const args = node.args.map((arg) => evalExpr(arg, state, host));

    if (ACTIONS.includes(name)) {
      if (state.actions >= state.maxActions) {
        fail(node.line, 1, `本次脚本最多执行 ${state.maxActions} 个操作，已停止`);
      }
      state.actions += 1;
      const target = args.length ? args[0] : null;
      let result;
      try {
        result = host.action(name, target, node.line) || {};
      } catch (error) {
        if (error instanceof ScriptError) throw error;
        throw new ScriptError(error && error.message ? error.message : String(error), node.line);
      }
      state.events.push({
        type: 'action',
        line: node.line,
        name,
        label: result.label || name,
        target: result.target || stringify(target),
        ok: Boolean(result.ok),
        message: result.message || '',
        stop: result.stop || null,
      });
      return Boolean(result.ok);
    }

    if (name === 'print' || name === 'log') {
      const text = args.map((arg) => stringify(arg)).join(' ');
      if (host.output) host.output(text, name === 'log' ? 'log' : 'print');
      return null;
    }

    if (name === 'len') {
      if (args.length !== 1) fail(node.line, 1, 'len 只需要一个参数');
      const value = args[0];
      if (typeof value === 'string' || Array.isArray(value)) return value.length;
      fail(node.line, 1, 'len 需要字符串或列表');
    }

    if (name === 'range') {
      if (!args.length) return [];
      let start = 0;
      let end = args[0];
      if (args.length >= 2) {
        start = args[0];
        end = args[1];
      }
      if (typeof start !== 'number' || typeof end !== 'number') {
        fail(node.line, 1, 'range 需要数字');
      }
      const result = [];
      for (let value = start; value < end && result.length < 200; value += 1) result.push(value);
      return result;
    }

    if (name === 'str') return stringify(args[0]);
    if (name === 'int') {
      const value = Number(args[0]);
      if (!Number.isFinite(value)) fail(node.line, 1, 'int() 无法转换');
      return Math.trunc(value);
    }
    if (name === 'float') {
      const value = Number(args[0]);
      if (!Number.isFinite(value)) fail(node.line, 1, 'float() 无法转换');
      return value;
    }
    if (name === 'bool') return isTruthy(args[0]);
    if (name === 'help') {
      if (host.output) host.output(HELP_TEXT, 'dim');
      return null;
    }

    const query = {
      alerts: 'alerts',
      devices: 'devices',
      events: 'events',
      find: 'find',
      status: 'status',
    }[name];
    if (query) {
      if (typeof host[query] !== 'function') fail(node.line, 1, `当前环境不支持 ${name}()`);
      return host[query](...(args || []));
    }

    fail(node.line, 1, `未知函数：${name}（输入 help() 查看可用函数）`);
    return null;
  }

  function checkSteps(state, line) {
    state.steps += 1;
    if (state.steps > state.maxSteps) {
      fail(line, 1, `脚本执行步数超过上限 ${state.maxSteps}，可能有死循环`);
    }
  }

  function* drainEvents(state) {
    while (state.events.length) yield state.events.shift();
  }

  function* execBlock(statements, state, host) {
    for (const statement of statements) {
      const signal = yield* execStatement(statement, state, host);
      if (signal === 'break' || signal === 'continue') return signal;
    }
    return null;
  }

  function* execStatement(statement, state, host) {
    checkSteps(state, statement.line);
    state.line = statement.line;
    switch (statement.type) {
      case 'pass':
        return null;
      case 'break':
        return 'break';
      case 'continue':
        return 'continue';
      case 'assign':
        state.env.set(statement.name, evalExpr(statement.value, state, host));
        yield* drainEvents(state);
        return null;
      case 'expr':
        evalExpr(statement.expr, state, host);
        yield* drainEvents(state);
        return null;
      case 'if': {
        for (const branch of statement.branches) {
          if (isTruthy(evalExpr(branch.condition, state, host))) {
            return yield* execBlock(branch.body, state, host);
          }
        }
        if (statement.elseBody) return yield* execBlock(statement.elseBody, state, host);
        return null;
      }
      case 'for': {
        const items = toIterable(evalExpr(statement.iterable, state, host), statement.line);
        for (const item of items) {
          checkSteps(state, statement.line);
          state.env.set(statement.name, item);
          const signal = yield* execBlock(statement.body, state, host);
          if (signal === 'break') break;
          if (signal === 'continue') continue;
        }
        return null;
      }
      case 'while': {
        while (isTruthy(evalExpr(statement.condition, state, host))) {
          checkSteps(state, statement.line);
          const signal = yield* execBlock(statement.body, state, host);
          if (signal === 'break') break;
          if (signal === 'continue') continue;
        }
        return null;
      }
      default:
        fail(statement.line, 1, `未知语句：${statement.type}`);
        return null;
    }
  }

  function compile(source) {
    const lines = prepareLines(source);
    return new Parser(lines).parse();
  }

  function run(program, host, options) {
    const opts = options || {};
    const state = {
      env: new Map(),
      steps: 0,
      actions: 0,
      line: 0,
      events: [],
      maxSteps: Number(opts.maxSteps) > 0 ? Number(opts.maxSteps) : 1500,
      maxActions: Number(opts.maxActions) > 0 ? Number(opts.maxActions) : 24,
    };
    return execute(program, host || {}, state);
  }

  function* execute(program, host, state) {
    yield* execBlock(program.body, state, host);
  }

  ZDD.ZScript = {
    ACTIONS,
    BUILTINS,
    ScriptError,
    compile,
    run,
    wrap,
    isWrapped,
    unwrap,
    stringify,
    HELP_TEXT,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
