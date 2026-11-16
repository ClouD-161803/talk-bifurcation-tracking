// the modules of src/ that the scripts read, e.g. the readers of TeX. they are TypeScript, which
// Node reads without a flag from version 22.18 on. under an older Node they are bundled by esbuild,
// which is installed by npm ci
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The exports of the modules src/<name>.ts, merged into one object. */
export async function sources(names) {
  try {
    return Object.assign({}, ...(await Promise.all(names.map((name) => import(`../src/${name}.ts`)))));
  } catch (error) {
    if (error?.code !== 'ERR_UNKNOWN_FILE_EXTENSION') throw error;
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { buildSync } = await import('esbuild').catch(() => {
    throw new Error('this script needs Node 22.18 or later, or the packages that npm ci installs');
  });
  const built = buildSync({
    stdin: { contents: names.map((name) => `export * from './src/${name}.ts';`).join('\n'), resolveDir: root },
    bundle: true,
    format: 'esm',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}
