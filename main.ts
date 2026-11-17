// Prismheart's hand-in program (Node 22, standard library only, no install, no network).
//
// It packs the entry into the output folder the grader reads:
//   <out>/game/          the playable game, copied as-is from this repository's game/
//   <out>/screenshots/   the real browser captures (cover first by name)
//   <out>/dossier.json   the judge's summary, built by the kit's own vendored library
// <out> is /output in the grader's container; set MAKEFUN_OUTPUT_DIR to pack anywhere else,
// e.g. `MAKEFUN_OUTPUT_DIR=out node main.ts`. Both runs of the grader must write the same bytes,
// so nothing here depends on time, randomness or the machine.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The limits the bounty's gate enforces; only the text budget shapes the dossier's bytes. */
const GATE_LIMITS = {
  text_max_bytes: 160 * 1024,
  screenshots: { max: 4, max_bytes: 256 * 1024 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copy one top-level folder of the repository into the output, if it is there. */
function shipFolder(name: string, required: boolean): void {
  const from = join(repoRoot, name);
  const to = join(outputDir, name);
  if (!existsSync(from)) {
    if (required) throw new Error(`missing ${name}/ beside main.ts`);
    mkdirSync(to, { recursive: true });
    return;
  }
  cpSync(from, to, { recursive: true });
}

function packEntry(): void {
  mkdirSync(outputDir, { recursive: true });
  shipFolder('game', true);
  shipFolder('screenshots', false);
  const dossier = buildDossier(outputDir, GATE_LIMITS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
}

packEntry();
