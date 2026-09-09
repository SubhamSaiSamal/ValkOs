#!/usr/bin/env node
/**
 * VALKOS journal validator.
 *
 * The build challenge this project belongs to has one hard rule about logging:
 *
 *   > Journal entries that claim tracked hours must have at least 100
 *   > characters per logged hour, with an absolute floor of 100 characters.
 *   > Entries with lazy placeholders or one-liners get rejected.
 *
 * Rather than trusting myself to eyeball that at submission time, the rule is
 * mechanised here. `npm run journal` parses JOURNAL.md, pulls every session
 * heading, measures the body underneath it, and fails loudly on anything thin.
 *
 * Expected heading shape:
 *
 *   ## 2026-09-05 | Session 01 | Kernel bring-up [4.5h]
 *
 * Everything between one heading and the next counts as that session's body.
 * Fenced code blocks are excluded from the character count on purpose - pasting
 * a stack trace is not the same as describing what broke.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const JOURNAL = join(ROOT, 'JOURNAL.md');

const CHARS_PER_HOUR = 100;
const ABSOLUTE_FLOOR = 100;

// --- terminal paint ---

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const ESC = String.fromCharCode(27);
const paint = (code, s) => (useColor ? `${ESC}[${code}m${s}${ESC}[0m` : String(s));
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const amber = (s) => paint('33', s);
const dim = (s) => paint('2', s);
const bold = (s) => paint('1', s);

// --- placeholder detection ---

/**
 * Phrases that signal an entry was padded rather than written. These are
 * matched against the lowercased body. A single hit is a warning; the entry
 * still has to independently clear its character budget.
 */
const LAZY_MARKERS = [
  'lorem ipsum',
  'todo: write',
  'tbd',
  'fill this in',
  'placeholder',
  'asdf',
  'qwerty',
  'xxxxx',
  'same as above',
  'nothing to report',
  'n/a',
];

/**
 * Detects filler produced by mashing a key or repeating a phrase. Returns a
 * reason string when the body looks synthetic, otherwise null.
 */
function detectPadding(body) {
  const lower = body.toLowerCase();

  for (const marker of LAZY_MARKERS) {
    if (lower.includes(marker)) return `contains placeholder text "${marker}"`;
  }

  // Any character repeated 8+ times in a row is not prose.
  const runs = body.match(/(.)\1{7,}/);
  if (runs) return `contains a run of ${runs[0].length} repeated "${runs[1]}" characters`;

  // If fewer than 35% of the words are unique the entry is looping.
  const words = lower.match(/[a-z][a-z'-]{2,}/g) || [];
  if (words.length >= 40) {
    const unique = new Set(words).size;
    const ratio = unique / words.length;
    if (ratio < 0.35) {
      return `only ${Math.round(ratio * 100)}% of words are unique - reads as repetition`;
    }
  }

  // A body that is one enormous line is a one-liner regardless of length.
  const realLines = body.split('\n').filter((l) => l.trim().length > 0);
  if (realLines.length === 1 && body.length > 200) {
    return 'entire entry is a single unbroken line';
  }

  return null;
}

// --- parsing ---

const HEADING = /^##\s+(.+?)\s*$/;
const HOURS_TAG = /\[(\d+(?:\.\d+)?)\s*h\]/i;

/**
 * Splits JOURNAL.md into session records. Anything above the first `## `
 * heading is treated as front matter and ignored.
 */
function parseJournal(text) {
  const lines = text.split(/\r?\n/);
  const sessions = [];
  let current = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = HEADING.exec(line);

    if (match) {
      if (current) sessions.push(current);
      const title = match[1];
      const hoursMatch = HOURS_TAG.exec(title);
      current = {
        title,
        line: i + 1,
        hours: hoursMatch ? Number.parseFloat(hoursMatch[1]) : null,
        bodyLines: [],
      };
      continue;
    }

    if (current) current.bodyLines.push(line);
  }

  if (current) sessions.push(current);
  return sessions;
}

/**
 * Produces the countable body for a session: code fences stripped, markdown
 * bullets and emphasis removed, whitespace collapsed.
 */
function countableBody(bodyLines) {
  const kept = [];
  let inFence = false;

  for (const line of bodyLines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/^[\s>*+-]+/gm, '')
    .replace(/[*_`#]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// --- report ---

function main() {
  if (!existsSync(JOURNAL)) {
    console.error(red('FAIL  JOURNAL.md does not exist.'));
    process.exit(1);
  }

  const sessions = parseJournal(readFileSync(JOURNAL, 'utf8'));

  if (sessions.length === 0) {
    console.error(red('FAIL  JOURNAL.md has no "## " session headings.'));
    process.exit(1);
  }

  console.log('');
  console.log(bold('  VALKOS JOURNAL AUDIT'));
  console.log(dim(`  rule: ${CHARS_PER_HOUR} characters per logged hour, floor ${ABSOLUTE_FLOOR}`));
  console.log('');

  let failures = 0;
  let warnings = 0;
  let totalHours = 0;
  let totalChars = 0;

  for (const session of sessions) {
    const body = countableBody(session.bodyLines);
    const chars = body.length;
    const hours = session.hours;

    if (hours === null) {
      console.log(
        `  ${amber('WARN')}  ${session.title} ${dim(`(line ${session.line})`)}`,
      );
      console.log(dim('          no [Nh] hour tag in the heading - not counted'));
      warnings += 1;
      continue;
    }

    const required = Math.max(ABSOLUTE_FLOOR, Math.round(hours * CHARS_PER_HOUR));
    const padding = detectPadding(body);
    const short = chars < required;

    totalHours += hours;
    totalChars += chars;

    const status = short || padding ? red('FAIL') : green(' OK ');
    const budget = `${chars}/${required} chars`;
    console.log(`  ${status}  ${session.title}`);
    console.log(
      dim(`          ${hours}h claimed  ${budget}  ${dim(`line ${session.line}`)}`),
    );

    if (short) {
      console.log(red(`          short by ${required - chars} characters`));
      failures += 1;
    }
    if (padding) {
      console.log(red(`          rejected: ${padding}`));
      if (!short) failures += 1;
    }
  }

  console.log('');
  console.log(dim('  ' + '-'.repeat(58)));
  console.log(
    `  ${bold(sessions.length)} sessions   ${bold(totalHours.toFixed(1) + 'h')} logged   ${bold(totalChars)} chars written`,
  );

  if (totalHours > 0) {
    const perHour = Math.round(totalChars / totalHours);
    console.log(dim(`  average ${perHour} characters per logged hour`));
  }

  console.log('');

  if (failures > 0) {
    console.log(red(`  ${failures} entr${failures === 1 ? 'y' : 'ies'} would be rejected.`));
    console.log('');
    process.exit(1);
  }

  console.log(green('  All entries clear the character budget.'));
  if (warnings > 0) console.log(amber(`  ${warnings} heading(s) missing an hour tag.`));
  console.log('');
}

main();cl