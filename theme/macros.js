// TeX macros of a deck, read in theme/mathjax-config.js, hence this file is loaded first. each
// value is a replacement string, or [replacement, number of arguments]
window.beesonMacros = {
  vb: ['\\boldsymbol{#1}', 1],
  // upright d with the spacing of an operator, as in \int f(x) \dd x
  dd: '\\mathop{}\\!\\mathrm{d}',
  R: '\\mathbb{R}',
  // the effective potential U_g + U_c of the notation registry
  Ut: '\\tilde{U}',
  // a libration point, as in \LL{1}
  LL: ['\\mathcal{L}_{#1}', 1],
  // the pulsation factor of the ER3BP, which divides the whole gradient of the effective potential
  ecth: '1 + e\\cos\\theta',
  // the Jacobian of the corrector constraint F with respect to the free variables X
  DXF: '\\boldsymbol{D}_{\\boldsymbol{X}}\\boldsymbol{F}',
  // a definition, with the colon centered on the equals sign, as in mathtools
  coloneqq: '\\mathrel{\\vcenter{:}}=',
};
