'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MDPage = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const THEMES = ['light', 'paper'];
  const THEME_CLASS = { light: 'theme-light', paper: 'theme-paper' };
  const READ_LINE_OFFSET = 120;

  function pickActiveId(entries, scrollTop, offset = READ_LINE_OFFSET) {
    if (!entries.length) return null;
    let active = entries[0].id;
    for (const entry of entries) {
      if (entry.top <= scrollTop + offset) {
        active = entry.id;
      } else {
        break;
      }
    }
    return active;
  }

  function createPage({ document, window, renderer, highlighter, storage, clipboard }) {
    let currentTheme = 'light';
    let showingSource = false;
    let toc = [];
    let navEl = null;

    function applyTheme(theme) {
      const next = THEMES.includes(theme) ? theme : 'light';
      currentTheme = next;
      document.documentElement.classList.remove('theme-light', 'theme-paper');
      document.documentElement.classList.add(THEME_CLASS[next]);
      const themeButton = document.querySelector('.md-theme-toggle');
      if (themeButton) {
        themeButton.textContent = next === 'light' ? '纸张' : '浅色';
        themeButton.setAttribute('aria-label', `切换到${next === 'light' ? '纸张' : '浅色'}主题`);
      }
    }

    async function setTheme(theme) {
      applyTheme(theme);
      if (storage) await storage.set('theme', currentTheme);
    }

    function makeButton(className, label) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      return button;
    }

    function buildToc(nav) {
      toc.forEach((entry) => {
        const link = document.createElement('a');
        link.className = `md-toc-link md-toc-level-${entry.level}`;
        link.textContent = entry.text;
        link.setAttribute('href', `#${entry.id}`);
        link.dataset.target = entry.id;
        nav.appendChild(link);
      });
    }

    function headingTop(id) {
      const heading = document.getElementById(id);
      if (!heading) return Infinity;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      return heading.getBoundingClientRect().top + scrollY;
    }

    function updateActive() {
      if (!navEl) return;
      const entries = toc.map((entry) => ({ id: entry.id, top: headingTop(entry.id) }));
      const active = pickActiveId(entries, window.scrollY || 0);
      Array.from(navEl.querySelectorAll('a')).forEach((link) => {
        link.classList.toggle('is-active', link.dataset.target === active);
      });
    }

    function listenForScroll() {
      let queued = false;
      window.addEventListener(
        'scroll',
        () => {
          if (queued) return;
          queued = true;
          const run = () => {
            queued = false;
            updateActive();
          };
          if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(run);
          } else {
            setTimeout(run, 50);
          }
        },
        { passive: true },
      );
    }

    function decorateTables(article) {
      article.querySelectorAll('table').forEach((table) => {
        const wrap = document.createElement('div');
        wrap.className = 'md-table-wrap';
        table.replaceWith(wrap);
        wrap.appendChild(table);
      });
    }

    function decorateCodeBlocks(article) {
      const clipboardApi =
        clipboard || (window.navigator && window.navigator.clipboard);
      article.querySelectorAll('pre').forEach((pre) => {
        const wrap = document.createElement('div');
        wrap.className = 'md-code-block';
        pre.replaceWith(wrap);
        wrap.appendChild(pre);

        const button = makeButton('md-copy-button', '复制');
        button.addEventListener('click', async () => {
          try {
            if (!clipboardApi) throw new Error('clipboard unavailable');
            await clipboardApi.writeText(pre.textContent);
            button.textContent = '已复制';
            setTimeout(() => {
              button.textContent = '复制';
            }, 1500);
          } catch (error) {
            button.textContent = '复制失败';
            setTimeout(() => {
              button.textContent = '复制';
            }, 1500);
          }
        });
        wrap.appendChild(button);
      });
    }

    function showSource(sourceText, sourceEl, readerEl, button) {
      showingSource = !showingSource;
      sourceEl.hidden = !showingSource;
      readerEl.hidden = showingSource;
      button.textContent = showingSource ? '渲染' : '原文';
      button.setAttribute('aria-label', showingSource ? '返回渲染视图' : '查看原始文本');
    }

    async function mount() {
      const sourceText = document.body.textContent || '';
      const result = renderer.render(sourceText);
      toc = result.toc;
      let fileName = document.location && document.location.pathname
        ? document.location.pathname.split('/').pop()
        : '';
      try {
        fileName = decodeURIComponent(fileName);
      } catch (error) {
        // Keep the raw name if it is not valid percent-encoding.
      }
      fileName = fileName.replace(/\.(?:md|markdown)$/i, '');
      const title = result.title || fileName || 'Markdown';

      const shell = document.createElement('div');
      shell.className = 'md-reader-shell';

      const toolbar = document.createElement('div');
      toolbar.className = 'md-toolbar';
      const themeButton = makeButton('md-theme-toggle', '纸张');
      const sourceButton = makeButton('md-source-toggle', '原文');
      toolbar.append(themeButton, sourceButton);

      const reader = document.createElement('div');
      reader.className = 'md-reader';
      if (!toc.length) reader.classList.add('md-reader--no-toc');

      const sidebar = document.createElement('aside');
      sidebar.className = 'md-sidebar';
      const titleEl = document.createElement('div');
      titleEl.className = 'md-doc-title';
      titleEl.textContent = title;
      sidebar.appendChild(titleEl);

      navEl = document.createElement('nav');
      navEl.className = 'md-toc';
      buildToc(navEl);
      sidebar.appendChild(navEl);

      const main = document.createElement('main');
      main.className = 'md-main';
      const article = document.createElement('article');
      article.className = 'md-content';
      article.innerHTML = result.html;
      decorateTables(article);
      decorateCodeBlocks(article);
      main.appendChild(article);
      reader.append(sidebar, main);

      const sourceEl = document.createElement('pre');
      sourceEl.className = 'md-source';
      sourceEl.hidden = true;
      sourceEl.textContent = sourceText;

      shell.append(toolbar, reader, sourceEl);
      document.body.replaceChildren(shell);
      document.title = title;

      if (typeof highlighter === 'function') {
        article.querySelectorAll('pre code').forEach((block) => {
          try {
            highlighter(block);
          } catch (error) {
            // Highlighting is cosmetic; a failed language must not break the page.
          }
        });
      }

      let storedTheme = null;
      if (storage) {
        try {
          storedTheme = await storage.get('theme');
        } catch (error) {
          storedTheme = null;
        }
      }
      applyTheme(storedTheme);

      themeButton.addEventListener('click', () => {
        setTheme(currentTheme === 'light' ? 'paper' : 'light');
      });
      sourceButton.addEventListener('click', () => {
        showSource(sourceText, sourceEl, reader, sourceButton);
      });
      listenForScroll();
      updateActive();

      return {
        setTheme,
        getTheme: () => currentTheme,
        toggleSource: () => showSource(sourceText, sourceEl, reader, sourceButton),
        updateActive,
      };
    }

    return { mount };
  }

  return { createPage, pickActiveId };
});