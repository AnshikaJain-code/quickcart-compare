import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const HEADER = `# Evaluation

Two generated sections. Do not edit by hand: re-run the scripts.

- Matching quality: \`npm run eval:matching\`
- /compare latency: \`npm run bench:compare\`
`;

const begin = (name: string) => `<!-- BEGIN:${name} -->`;
const end = (name: string) => `<!-- END:${name} -->`;

/** Replaces (or appends) one named section of a generated markdown file, leaving the others intact. */
export function upsertSection(file: string, name: string, body: string): void {
  const block = `${begin(name)}\n${body.trim()}\n${end(name)}`;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  let next: string;
  if (!current.includes('<!-- BEGIN:')) {
    next = `${HEADER}\n${block}\n`;
  } else if (current.includes(begin(name))) {
    const a = current.indexOf(begin(name));
    const b = current.indexOf(end(name)) + end(name).length;
    next = `${current.slice(0, a)}${block}${current.slice(b)}`;
  } else {
    next = `${current.trimEnd()}\n\n${block}\n`;
  }
  writeFileSync(file, next, 'utf8');
}
