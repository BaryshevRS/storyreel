#!/usr/bin/env node
import { buildProgram } from './main.js';

async function main() {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    // Human-readable failure, non-zero exit for CI.
    process.stderr.write(`\n✗ ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}

void main();
