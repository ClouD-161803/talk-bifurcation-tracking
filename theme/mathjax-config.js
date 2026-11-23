{
const files = window.beesonFiles;
const theme = files ? new URL('theme/', document.baseURI).href : document.currentScript.src;
const deck = new URL('.', document.baseURI).href;
const load = (url) => new Promise((done, fail) => {
  const script = document.createElement('script');
  script.src = files[url.startsWith(deck) ? decodeURIComponent(url.slice(deck.length)) : url] ?? url;
  script.onload = done;
  script.onerror = () => fail(new Error(`${url} is not in this single web page`));
  document.head.append(script);
});
window.MathJax = {
  loader: {
    paths: { mathjax: new URL('vendor/mathjax', theme).href, fonts: new URL('vendor/mathjax', theme).href },
    ...(files ? { require: load } : {}),
    load: (window.beesonTex?.packages ?? []).map((name) => `[tex]/${name}`),
  },
  tex: {
    inlineMath: [['\\(', '\\)']],
    displayMath: [['\\[', '\\]']],
    packages: { '[+]': window.beesonTex?.packages ?? [] },
    macros: { ensuremath: ['#1', 1], xspace: '', bm: ['\\boldsymbol{#1}', 1], ...(window.beesonTex?.macros ?? window.beesonMacros) },
    environments: { ...window.beesonTex?.environments },
  },
  output: {
    font: 'mathjax-tex',
    fontPath: new URL('vendor/mathjax/mathjax-tex-font', theme).href,
    linebreaks: { inline: false },
  },
  options: {
    ignoreHtmlClass: 'mathjax_ignore|label',
    menuOptions: { settings: { enrich: false, speech: false, braille: false } },
  },
  svg: {
    fontCache: 'global',
  },
};
}
