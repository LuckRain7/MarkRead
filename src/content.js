'use strict';

(function () {
  if (window.__mdReaderMounted) return;
  if (
    !window.MDCore ||
    !window.MDPage ||
    !window.marked ||
    !window.DOMPurify ||
    !document.body
  ) {
    return;
  }
  if (window.location.protocol !== 'file:') return;

  const core = window.MDCore.createCore({
    marked: window.marked,
    DOMPurify: window.DOMPurify,
    DOMParser: window.DOMParser,
  });

  if (!core.isMarkdownPath(window.location.pathname)) return;
  window.__mdReaderMounted = true;

  const storage = {
    get(key) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(key, (items) => {
            if (chrome.runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(items ? items[key] : null);
          });
        } catch (error) {
          resolve(null);
        }
      });
    },
    set(key, value) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.set({ [key]: value }, () => resolve());
        } catch (error) {
          resolve();
        }
      });
    },
  };

  const highlighter = (block) => {
    if (window.hljs) window.hljs.highlightElement(block);
  };

  const page = window.MDPage.createPage({
    document,
    window,
    renderer: core,
    highlighter,
    storage,
  });

  // Chrome can drop manifest-injected CSS when the browser launches straight
  // into a file:// URL while the extension is still loading. Loading the
  // stylesheet ourselves and waiting for it avoids an unstyled first paint.
  function ensureStyles() {
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('src/styles.css');
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      (document.head || document.documentElement).appendChild(link);
    });
  }

  ensureStyles()
    .then(() => page.mount())
    .catch((error) => {
      console.error('[markdown-reader]', error);
    });
})();