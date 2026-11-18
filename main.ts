// Solmar Bay — the entry program for make.fun's gta6-01 bounty.
// Runs on Node 22 with the standard library only. It takes the game built in
// this repository (game/ as plain static files, screenshots/ as real renders)
// and hands it in: it copies both folders into the output directory and writes
// output/dossier.json using the vendored make.fun library, which is the summary
// the judge reads. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for
// /output, so a local check is: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { readdirSync, statSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Copy a directory tree file by file (plain files only, no symlinks).
function copyTree(srcDir, dstDir) {
  mkdirSync(dstDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    const src = join(srcDir, name);
    const dst = join(dstDir, name);
    const st = statSync(src);
    if (st.isDirectory()) copyTree(src, dst);
    else if (st.isFile()) copyFileSync(src, dst);
  }
}

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
}

// The scorer's caps from the kit's reference/gate.json: the dossier text is
// capped at 160 KiB, at most 4 screenshots of 256 KiB each, game/ at most 993
// files and 48 MiB in all, and no path under game/ longer than 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log('Solmar Bay handed in: game/ + screenshots/ copied, dossier.json written to ' + outDir);
