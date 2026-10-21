// Detect multiple mainline games before handing the original text to chess.js.
// Comments, header strings and nested RAVs cannot manufacture result tokens.
export function assertSinglePgn(text) {
  let depth = 0, comment = false, line = false, header = false, quote = false, clean = '', eventHeaders = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (line) { if (c === '\n') line = false; continue; }
    if (comment) { if (c === '}') comment = false; continue; }
    if (header) { if (c === '"' && text[i - 1] !== '\\') quote = !quote; if (c === ']' && !quote) header = false; continue; }
    if (c === '{') { comment = true; continue; } if (c === ';') { line = true; continue; }
    if (c === '[') { if (!depth && /^\[Event\s+"/.test(text.slice(i))) eventHeaders++; header = true; clean += ' '; continue; }
    if (c === '(') { depth++; continue; } if (c === ')') { depth = Math.max(0, depth - 1); continue; }
    if (!depth) clean += c;
  }
  const results = [...clean.matchAll(/(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)(?=\s|$)/g)];
  if (results.length > 1 || eventHeaders > 1) throw new Error('This contains multiple PGN games. MVP import supports one game at a time; choose a single-game PGN.');
}
