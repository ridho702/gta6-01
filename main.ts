// Solmar Bay — the entrypoint (Node 22, standard library only). It hands
// the game in: game/ and screenshots/ are copied beside this file into the
// output directory, and /output/dossier.json is written with the vendored
// make.fun library so the scorer can read the entry.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Mirror a directory when it exists; the game folder always does, the
// screenshots folder is optional until the first shots are taken.
function mirror(name) {
  const src = join(repoRoot, name);
  const dst = join(outDir, name);
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
mirror('game');
mirror('screenshots');

// The scorer's own caps for this bounty: at most 4 screenshots of at most
// 256 KiB each, at most 993 files and 48 MiB under game/, paths under 1000
// bytes, and the text summary capped at 160 KiB.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
