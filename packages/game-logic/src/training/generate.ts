#!/usr/bin/env node
/**
 * Generate training data by simulating bot-vs-bot games.
 *
 * Usage:
 *   npx tsx packages/game-logic/src/training/generate.ts [--games=N] [--output=FILE]
 *
 * Writes JSONL to stdout (or FILE if specified), one game per line.
 */

import { greedyBot } from "../bot/bot-player.js";
import { playAndLog } from "./game-logger.js";
import { writeFileSync, appendFileSync } from "node:fs";

function parseArgs(args: string[]): { games: number; output: string | null } {
  let games = 1000;
  let output: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--games=")) {
      games = parseInt(arg.slice("--games=".length), 10);
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    }
  }

  return { games, output };
}

const { games, output } = parseArgs(process.argv.slice(2));

const strategies = [greedyBot, greedyBot, greedyBot, greedyBot];
const labels = ["greedy", "greedy", "greedy", "greedy"];

// Clear output file if specified
if (output) {
  writeFileSync(output, "");
}

const startTime = Date.now();

for (let i = 0; i < games; i++) {
  const log = playAndLog(strategies, labels);
  const line = JSON.stringify(log) + "\n";

  if (output) {
    appendFileSync(output, line);
  } else {
    process.stdout.write(line);
  }

  if ((i + 1) % 1000 === 0 || i === games - 1) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = ((i + 1) / ((Date.now() - startTime) / 1000)).toFixed(0);
    process.stderr.write(
      `\r[${elapsed}s] ${i + 1}/${games} games (${rate} games/s)`,
    );
  }
}

process.stderr.write("\n");
const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
process.stderr.write(`Done. ${games} games in ${totalElapsed}s\n`);
