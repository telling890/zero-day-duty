/* 自动化剧本解释器的无浏览器单元测试。
 * 运行：node tests/zscript.test.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

require(`${root}/js/core/zscript.js`);

const Z = globalThis.ZDD.ZScript;
const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

function run(source, host, options) {
  const program = Z.compile(source);
  const events = [];
  const controller = Z.run(program, host || {}, options || { maxSteps: 600, maxActions: 20 });
  for (const event of controller) events.push(event);
  return events;
}

function mockHost(overrides) {
  const output = [];
  const base = {
    output: (text) => output.push(text),
    alerts: () => [],
    devices: () => [],
    events: () => [],
    find: () => null,
    status: () => ({ turn: 1, clock: '22:00', ap: 6 }),
    action: () => ({ ok: true, message: 'ok' }),
  };
  return Object.assign(base, overrides || {}, { messages: output });
}

function expectError(source, pattern, host, options) {
  assert.throws(
    () => {
      const program = Z.compile(source);
      for (const event of Z.run(program, host || {}, options || { maxSteps: 100 })) {
        void event;
      }
    },
    (error) => {
      assert.ok(error instanceof Z.ScriptError, `应该是 ScriptError，实际是 ${error}`);
      if (pattern) assert.match(error.message, pattern);
      return true;
    },
  );
}

test('print / 变量 / 四则运算', () => {
  const host = mockHost();
  run(`
x = 2
y = 3
print(x + y, x * y, x - y, 6 / 3)
`, host);
  assert.deepEqual(host.messages, ['5 6 -1 2']);
});

test('if / elif / else', () => {
  const host = mockHost();
  run(`
x = 3
if x == 1:
    print("one")
elif x == 2:
    print("two")
elif x == 3:
    print("three")
else:
    print("other")
`, host);
  assert.deepEqual(host.messages, ['three']);
});

test('for / range / 列表', () => {
  const host = mockHost();
  run(`
total = 0
for i in range(4):
    total = total + i
print(total)
for name in ["a", "b"]:
    print(name)
`, host);
  assert.deepEqual(host.messages, ['6', 'a', 'b']);
});

test('while / break / continue', () => {
  const host = mockHost();
  run(`
i = 0
while i < 6:
    i = i + 1
    if i == 2:
        continue
    if i == 5:
        break
    print(i)
`, host);
  assert.deepEqual(host.messages, ['1', '3', '4']);
});

test('列表索引 / len / in / 字符串', () => {
  const host = mockHost();
  run(`
xs = [1, 2, 3]
print(xs[0], xs[-1], len(xs), 2 in xs, 9 not in xs)
s = "abc"
print(s[1], len(s), "b" in s)
print("夜班" + "开始")
`, host);
  assert.deepEqual(host.messages, ['1 3 3 True True', 'b 3 True', '夜班开始']);
});

test('and / or / not / 链式比较', () => {
  const host = mockHost();
  run(`
print(1 < 2 < 3, 1 < 2 > 3)
print(not False, True and 3, False or "x")
`, host);
  assert.deepEqual(host.messages, ['True False', 'True 3 x']);
});

test('注释与空行不影响行号/执行', () => {
  const host = mockHost();
  run(`
# 注释

print("ok")  # 行尾注释
`, host);
  assert.deepEqual(host.messages, ['ok']);
});

test('属性访问：包裹的告警对象', () => {
  const alert = Z.wrap('alert', { alertId: 'A-01', title: '钓鱼', displayLevel: '高危', targetId: 'PC-01' }, {
    investigated: () => false,
    title: () => '钓鱼',
    display_level: () => '高危',
    device: () => Z.wrap('device', { deviceId: 'PC-01' }, { id: () => 'PC-01' }),
  });
  const host = mockHost({ alerts: () => [alert] });
  run(`
for a in alerts():
    print(a.title, a.display_level, a.device.id, a.investigated)
`, host);
  assert.deepEqual(host.messages, ['钓鱼 高危 PC-01 False']);
});

test('操作调用：产生 action 事件并返回布尔值', () => {
  const calls = [];
  const alert = Z.wrap('alert', { alertId: 'A-01' }, { investigated: () => false });
  const host = mockHost({
    alerts: () => [alert],
    action: (name, target) => {
      calls.push([name, target && target.value ? target.value.alertId : null]);
      return { ok: true, message: '已调查', target: 'A-01', label: '调查告警' };
    },
  });
  const events = run(`
if scan(alerts()[0]):
    print("ok")
`, host);
  assert.deepEqual(calls, [['scan', 'A-01']]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'action');
  assert.equal(events[0].label, '调查告警');
  assert.equal(events[0].target, 'A-01');
  assert.deepEqual(host.messages, ['ok']);
});

test('操作失败时返回 False，脚本可以继续', () => {
  const host = mockHost({ action: () => ({ ok: false, message: '行动点不足' }) });
  run(`
x = scan("PC-01")
print("结果", x)
`, host);
  assert.deepEqual(host.messages, ['结果 False']);
});

test('maxActions 限制', () => {
  const host = mockHost();
  expectError(`
for i in range(5):
    scan("PC-01")
`, /最多执行 2 个操作/, host, { maxSteps: 100, maxActions: 2 });
});

test('步数上限防止死循环', () => {
  expectError('while True:\n    pass\n', /步数超过上限/, mockHost(), { maxSteps: 40 });
});

test('语法错误：缺少冒号，带原始行号', () => {
  assert.throws(
    () => Z.compile('# 注释\n\nif x\n    print(1)\n'),
    (error) => {
      assert.ok(error instanceof Z.ScriptError);
      assert.equal(error.line, 3);
      assert.match(error.message, /冒号/);
      return true;
    },
  );
});

test('缩进不一致会报错', () => {
  assert.throws(
    () => run('if True:\n    print(1)\n  print(2)\n', mockHost()),
    (error) => error instanceof Z.ScriptError && /缩进/.test(error.message),
  );
});

test('未知函数给出提示', () => {
  expectError('foo(1)\n', /未知函数/);
});

test('不支持的 def / return 给出明确提示', () => {
  expectError('def f():\n    pass\n', /暂不支持「def」/);
  expectError('return 1\n', /暂不支持「return」/);
});

test('status() / find() 内置查询', () => {
  const host = mockHost({
    find: (token) => (token === 'PC-01' ? Z.wrap('device', { deviceId: 'PC-01' }, { id: () => 'PC-01' }) : null),
    status: () => ({ turn: 2, ap: 5 }),
  });
  run(`
d = find("PC-01")
if d:
    print(d.id)
print(status().turn, status().ap)
`, host);
  assert.deepEqual(host.messages, ['PC-01', '2 5']);
});

test('字符串转义', () => {
  const host = mockHost();
  run('print("a\\n\\"b\\"")\n', host);
  assert.deepEqual(host.messages, ['a\n"b"']);
});

test('host.action 抛错会带上脚本行号', () => {
  const host = mockHost({
    action: () => {
      throw new Error('游戏状态异常');
    },
  });
  assert.throws(
    () => run('\nscan("PC-01")\n', host),
    (error) => error instanceof Z.ScriptError && error.line === 2 && /游戏状态异常/.test(error.message),
  );
});

test('next() 无目标调用', () => {
  let received = null;
  const host = mockHost({
    action: (name, target) => {
      received = [name, target];
      return { ok: true, message: '已推进', target: '回合', label: '推进回合' };
    },
  });
  run('next()\n', host);
  assert.deepEqual(received, ['next', null]);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error && error.stack ? error.stack : error}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} 通过`);
process.exit(failed > 0 ? 1 : 0);
