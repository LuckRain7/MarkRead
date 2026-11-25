'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { createCore } = require('../src/lib/md-core.js');
const { createPage, pickActiveId } = require('../src/page.js');

const SAMPLE = [
  '<pre># 标题',
  '',
  '## 总览',
  '',
  '正文内容',
  '',
  '### 关键前提',
  '',
  '更多内容</pre>',
].join('\n');

function setup({
  html = SAMPLE,
  url = 'file:///Users/a/doc.md',
  storedTheme = null,
  clipboard = null,
} = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head><title>doc.md</title></head><body>${html}</body></html>`,
    { url },
  );
  const DOMPurify = createDOMPurify(dom.window);
  const renderer = createCore({
    marked,
    DOMPurify,
    DOMParser: dom.window.DOMParser,
  });
  const store = new Map();
  if (storedTheme) store.set('theme', storedTheme);
  const storage = {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value) {
      store.set(key, value);
    },
  };
  const highlighted = [];
  const highlighter = (element) => {
    highlighted.push(element);
    element.classList.add('hljs');
  };
  const page = createPage({
    document: dom.window.document,
    window: dom.window,
    renderer,
    highlighter,
    storage,
    clipboard,
  });
  return { dom, page, store, highlighted };
}

test('mount replaces the raw text view with rendered content', async () => {
  const { dom, page } = setup();

  await page.mount();

  const doc = dom.window.document;
  assert.equal(doc.querySelector('.md-content h1').textContent, '标题');
  assert.equal(doc.querySelector('.md-content h1').id, '标题');
});

test('mount builds toc links pointing at heading ids', async () => {
  const { dom, page } = setup();

  await page.mount();

  const links = Array.from(dom.window.document.querySelectorAll('.md-toc a'));
  assert.deepEqual(
    links.map((link) => link.textContent),
    ['总览', '关键前提'],
  );
  assert.equal(links[0].getAttribute('href'), '#总览');
});

test('mount marks nesting level on toc links', async () => {
  const { dom, page } = setup();

  await page.mount();

  const doc = dom.window.document;
  assert.ok(doc.querySelector('.md-toc a.md-toc-level-2'));
  assert.ok(doc.querySelector('.md-toc a.md-toc-level-3'));
});

test('mount uses the first h1 as document title', async () => {
  const { dom, page } = setup();

  await page.mount();

  assert.equal(dom.window.document.title, '标题');
});

test('mount falls back to the file name when there is no h1', async () => {
  const { dom, page } = setup({ html: '<pre>## 只有小节</pre>' });

  await page.mount();

  assert.equal(dom.window.document.title, 'doc');
});

test('mount decodes percent-encoded file names for the fallback title', async () => {
  const { dom, page } = setup({
    html: '<pre>## 只有小节</pre>',
    url: 'file:///Users/a/%E9%9C%80%E6%B1%82.md',
  });

  await page.mount();

  assert.equal(dom.window.document.title, '需求');
});

test('mount defaults to the light theme', async () => {
  const { dom, page } = setup();

  await page.mount();

  assert.ok(dom.window.document.documentElement.classList.contains('theme-light'));
});

test('mount restores the stored paper theme', async () => {
  const { dom, page } = setup({ storedTheme: 'paper' });

  await page.mount();

  assert.ok(dom.window.document.documentElement.classList.contains('theme-paper'));
});

test('theme toggle switches theme and persists the choice', async () => {
  const { dom, page, store } = setup();
  await page.mount();
  const doc = dom.window.document;

  doc.querySelector('.md-theme-toggle').dispatchEvent(
    new dom.window.Event('click', { bubbles: true }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(doc.documentElement.classList.contains('theme-paper'));
  assert.equal(store.get('theme'), 'paper');

  doc.querySelector('.md-theme-toggle').dispatchEvent(
    new dom.window.Event('click', { bubbles: true }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(doc.documentElement.classList.contains('theme-light'));
  assert.equal(store.get('theme'), 'light');
});

test('source toggle shows the raw markdown and switches back', async () => {
  const { dom, page } = setup();
  await page.mount();
  const doc = dom.window.document;
  const source = doc.querySelector('.md-source');

  assert.equal(source.hidden, true);

  doc.querySelector('.md-source-toggle').dispatchEvent(
    new dom.window.Event('click', { bubbles: true }),
  );
  assert.equal(source.hidden, false);
  assert.match(source.textContent, /# 标题/);
  assert.equal(doc.querySelector('.md-reader').hidden, true);

  doc.querySelector('.md-source-toggle').dispatchEvent(
    new dom.window.Event('click', { bubbles: true }),
  );
  assert.equal(source.hidden, true);
  assert.equal(doc.querySelector('.md-reader').hidden, false);
});

test('mount sends every code block through the highlighter', async () => {
  const { highlighted, dom, page } = setup({
    html: '<pre># 标题\n\n```js\nconst a = 1;\n```</pre>',
  });

  await page.mount();

  assert.equal(highlighted.length, 1);
  assert.equal(highlighted[0].tagName, 'CODE');
  assert.ok(dom.window.document.querySelector('code.hljs'));
});

test('mount flags documents without a toc', async () => {
  const { dom, page } = setup({ html: '<pre># 只有标题</pre>' });

  await page.mount();

  assert.ok(
    dom.window.document
      .querySelector('.md-reader')
      .classList.contains('md-reader--no-toc'),
  );
});

test('mount wraps tables so wide ones can scroll sideways', async () => {
  const { dom, page } = setup({
    html: '<pre># 标题\n\n| # | 需求项 |\n| --- | --- |\n| 1 | 夜间日志 |</pre>',
  });

  await page.mount();

  const wrap = dom.window.document.querySelector('.md-table-wrap');
  assert.ok(wrap);
  assert.equal(wrap.querySelector('table').tagName, 'TABLE');
});

test('each code block exposes a copy button that copies its source', async () => {
  const copied = [];
  const clipboard = {
    async writeText(text) {
      copied.push(text);
    },
  };
  const { dom, page } = setup({
    html: '<pre># 标题\n\n```js\nconst a = 1;\n```</pre>',
    clipboard,
  });
  await page.mount();
  const doc = dom.window.document;

  const button = doc.querySelector('.md-code-block .md-copy-button');
  assert.ok(button);
  button.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(copied, ['const a = 1;\n']);
});

test('pickActiveId returns the last heading above the reading line', () => {
  const entries = [
    { id: 'a', top: 0 },
    { id: 'b', top: 500 },
    { id: 'c', top: 1000 },
  ];

  assert.equal(pickActiveId(entries, 0), 'a');
  assert.equal(pickActiveId(entries, 450), 'b');
  assert.equal(pickActiveId(entries, 5000), 'c');
});

test('pickActiveId returns null for an empty toc', () => {
  assert.equal(pickActiveId([], 0), null);
});