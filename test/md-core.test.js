'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { createCore } = require('../src/lib/md-core.js');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const DOMPurify = createDOMPurify(dom.window);
const core = createCore({
  marked,
  DOMPurify,
  DOMParser: dom.window.DOMParser,
});

function makeCore() {
  return createCore({ marked, DOMPurify, DOMParser: dom.window.DOMParser });
}

test('stripFrontmatter removes a leading YAML block', () => {
  const input = '---\ntitle: 测试\ntags: [a, b]\n---\n\n# 正文标题\n\n内容';
  const result = core.stripFrontmatter(input);

  assert.equal(result.body, '# 正文标题\n\n内容');
});

test('stripFrontmatter leaves plain markdown untouched', () => {
  const input = '# 标题\n\n第一段';
  const result = core.stripFrontmatter(input);

  assert.equal(result.body, input);
});

test('slugify keeps CJK text and drops punctuation', () => {
  assert.equal(core.slugify('0.2 进度总表'), '02-进度总表');
});

test('slugify lowercases latin and joins words with dashes', () => {
  assert.equal(core.slugify('Hello, World!'), 'hello-world');
});

test('render gives every heading a unique id', () => {
  const { html } = makeCore().render('# 标题\n\n## 总览\n\n## 总览');

  assert.match(html, /<h1 id="标题">/);
  assert.match(html, /<h2 id="总览">/);
  assert.match(html, /<h2 id="总览-1">/);
});

test('render keeps GFM tables', () => {
  const md = '| # | 需求项 |\n| --- | --- |\n| 1 | 夜间日志 |';
  const { html } = makeCore().render(md);

  assert.match(html, /<table>/);
  assert.match(html, /<td>夜间日志<\/td>/);
});

test('render sanitizes embedded script tags', () => {
  const { html } = makeCore().render('# 标题\n\n<script>window.pwned = true</script>');

  assert.doesNotMatch(html, /<script/);
});

test('render preserves fenced code language class', () => {
  const { html } = makeCore().render('```js\nconst a = 1;\n```');

  assert.match(html, /<code class="language-js">/);
});

test('render turns task list items into disabled checkboxes', () => {
  const { html } = makeCore().render('- [x] 已完成\n- [ ] 未完成');

  assert.match(html, /<input[^>]*type="checkbox"[^>]*>/);
  assert.match(html, /<input[^>]*disabled[^>]*>/);
});

test('render reports the first h1 text as title', () => {
  const { title } = makeCore().render('## 小节\n\n# 主标题\n');

  assert.equal(title, '主标题');
});

test('render returns null title when there is no h1', () => {
  const { title } = makeCore().render('## 只有二级标题');

  assert.equal(title, null);
});

test('render builds a toc from h2 and h3 in document order', () => {
  const { toc } = makeCore().render('# 标题\n\n## 总览\n\n### 关键前提\n\n## 收尾');

  assert.deepEqual(
    toc.map((entry) => [entry.level, entry.text]),
    [
      [2, '总览'],
      [3, '关键前提'],
      [2, '收尾'],
    ],
  );
});

test('toc text drops inline markup', () => {
  const { toc } = makeCore().render('## 带 `代码` 的标题');

  assert.equal(toc[0].text, '带 代码 的标题');
});

test('isMarkdownPath accepts .md and .markdown case-insensitively', () => {
  assert.equal(core.isMarkdownPath('/Users/a/需求.MD'), true);
  assert.equal(core.isMarkdownPath('/Users/a/README.markdown'), true);
  assert.equal(core.isMarkdownPath('/Users/a/notes.txt'), false);
  assert.equal(core.isMarkdownPath('/Users/a/md'), false);
});