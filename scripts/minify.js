import { minify } from 'terser';
import * as fs from 'fs';

const options = {
  ecma: 2020,
  module: true,
  compress: {
    booleans_as_integers: true,
    defaults: true,
    module: true,
    passes: 4,
    pure_getters: true,
    toplevel: true,
    unsafe: true,
    unsafe_arrows: true,
  },
  mangle: false,
};

async function main() {
  if (process.argv.length != 6) {
    console.error(
      'Usage: minify.js <input.js> <input.map> <output.js> <output.map>',
    );
    process.exit(1);
  }
  const [injs, inmap, outjs, outmap] = process.argv.slice(2);
  try {
    const jsdata = await fs.promises.readFile(injs, 'utf8');
    const mapdata = await fs.promises.readFile(inmap, 'utf8');
    const { code, map } = await minify(jsdata, {
      sourceMap: { content: mapdata },
      ...options,
    });
    await fs.promises.writeFile(outjs, code, 'utf8');
    await fs.promises.writeFile(outmap, map, 'utf8');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
