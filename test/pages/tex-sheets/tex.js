// written from preamble.tex and references.bib by npm run tex and by a save in the editor.
// change the two sources, since this file is written again from them
window.beesonTex = {
  "macros": {
    "dist": "\\operatorname{dist}",
    "half": "\\frac{1}{2}",
    "vb": ["\\boldsymbol{#1}",1],
  },
  "environments": {},
  "packages": ["physics"],
  "theorems": {
    "theorem": {"title":"Theorem","style":"plain","counter":"theorem"},
  },
  "references": {
    "gomez2004": {"authors":"G\u00f3mez et al.","title":"Connecting orbits and invariant manifolds in the spatial restricted three-body problem","venue":"Nonlinearity","volume":"17","year":"2004"},
    "koon2000": {"authors":"Koon et al.","title":"Heteroclinic connections between periodic orbits and resonance transitions in celestial mechanics","venue":"Chaos","volume":"10","year":"2000","doi":"10.1063/1.166509"},
  },
};
