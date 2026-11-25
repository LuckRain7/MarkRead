'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MDCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

  function createCore({ marked, DOMPurify, DOMParser }) {
    function stripFrontmatter(text) {
      const source = String(text == null ? '' : text).replace(/^﻿/, '');
      const match = source.match(FRONTMATTER_RE);
      if (!match) {
        return { body: source, frontmatter: null };
      }
      const body = source
        .slice(match[0].length)
        .replace(/^(?:[ \t]*\r?\n)+/, '');
      return { body, frontmatter: match[1] };
    }

    function slugify(text) {
      const base = String(text == null ? '' : text)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}\-_]/gu, '')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '');
      return base || 'section';
    }

    function assignHeadingIds(doc) {
      const used = new Map();
      doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
        const base = slugify(heading.textContent);
        const count = used.get(base) || 0;
        used.set(base, count + 1);
        heading.id = count === 0 ? base : `${base}-${count}`;
      });
    }

    function render(markdownText) {
      const { body } = stripFrontmatter(markdownText);
      const rawHtml = marked.parse(body, { gfm: true, breaks: false });
      const cleanHtml = DOMPurify.sanitize(rawHtml);
      const doc = new DOMParser().parseFromString(cleanHtml, 'text/html');
      assignHeadingIds(doc);

      const toc = Array.from(doc.querySelectorAll('h2, h3')).map((heading) => ({
        level: Number(heading.tagName.charAt(1)),
        text: heading.textContent.trim(),
        id: heading.id,
      }));
      const firstH1 = doc.querySelector('h1');

      return {
        html: doc.body.innerHTML,
        toc,
        title: firstH1 ? firstH1.textContent.trim() : null,
      };
    }

    function isMarkdownPath(pathname) {
      return /\.(?:md|markdown)$/i.test(String(pathname == null ? '' : pathname));
    }

    return { stripFrontmatter, slugify, render, isMarkdownPath };
  }

  return { createCore };
});