export type Style = 'plain' | 'definition' | 'remark';
export type Kind = { title: string; style: Style; counter: string | null };

const usual = (title: string, style: Style): Kind => ({ title, style, counter: null });
export const USUAL: Record<string, Kind> = {
  theorem: usual('Theorem', 'plain'),
  lemma: usual('Lemma', 'plain'),
  proposition: usual('Proposition', 'plain'),
  corollary: usual('Corollary', 'plain'),
  definition: usual('Definition', 'definition'),
  example: usual('Example', 'definition'),
  remark: usual('Remark', 'remark'),
  proof: usual('Proof', 'remark'),
};
export const kindsOf = (theorems: Record<string, Kind>): Record<string, Kind> => ({ ...USUAL, ...theorems });
