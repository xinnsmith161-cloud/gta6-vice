// Solmar City — make.fun gta6-01 entry build script (Node 22, stdlib only).
//
// What it does: takes the playable game (game/, plain static files the
// browser loads offline) plus the four real gameplay screenshots
// (screenshots/) from beside this file, copies them into the output
// directory, and writes dossier.json — the summary the judge reads —
// using the vendored make.fun library. No build step, no bundler, no
// network: the game ships exactly as it is played.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Directory this script lives in (the repo root).
const root = fileURLToPath(new URL('.', import.meta.url));
// The grader sets /output; locally we point it at ./out instead.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

// The game itself.
copyTree(join(root, 'game'), join(outDir, 'game'));

// The screenshots, if they exist (the kit check refuses an entry with
// more than 4, or any single one over 256 KiB — see the caps below).
const shotDir = join(root, 'screenshots');
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) copyTree(shotDir, join(outDir, 'screenshots'));

// The scorer's own caps (from reference/gate.json). text_max_bytes shapes
// the bytes; the rest refuse an entry the scorer would refuse: at most 4
// screenshots, each at most 256 KiB; at most 993 files in game/, at most
// 48 MiB of game files in all, no path under game/ over 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Solmar City built into ${outDir}`);
