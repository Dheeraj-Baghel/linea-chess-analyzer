// Rebuild the offline opening index from the pinned, checksum-verified CC0 TSVs.
// Run from the Linea folder. --check validates without writing generated output.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

const provenance = JSON.parse(await fs.readFile('vendor/chess-openings/provenance.json', 'utf8'));
const positions = {}, records = [], documented = new Set();
for (const file of ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv']) {
  const bytes = await fs.readFile(`vendor/chess-openings/${file}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.files[file].sha256, `${file} differs from the pinned source`);
  const [header, ...lines] = bytes.toString().trimEnd().split(/\r?\n/);
  assert.equal(header, 'eco\tname\tpgn');
  for (const [i, line] of lines.entries()) {
    const [eco, name, pgn, extra] = line.split('\t');
    assert.ok(/^[A-E]\d{2}$/.test(eco) && name && pgn && extra === undefined, `${file}:${i + 2}`);
    const chess = new Chess(); chess.loadPgn(pgn, { strict: true });
    const history = chess.history({ verbose: true });
    const uci = history.map(move => move.from + move.to + (move.promotion || '')).join(' ');
    // Book evidence (linea-book-2): every position ON a documented line, not
    // only its named terminal position. Same canonical EPD as the lookup.
    for (const move of history) documented.add(new Chess(move.after).fen().split(' ').slice(0, 4).join(' '));
    // chess.js canonical FEN includes an EP square only for a legal EP capture.
    const epd = chess.fen().split(' ').slice(0, 4).join(' ');
    (positions[epd] ||= []).push([eco, name, uci, history.length]);
    records.push({ eco, name, uci, epd, plies: history.length });
  }
  console.log(`Validated ${file}; ${records.length} legal opening records so far`);
}
for (const [key, rows] of Object.entries(positions)) {
  positions[key] = [...new Map(rows.map(row => [JSON.stringify(row), row])).values()].sort((a, b) => b[3] - a[3] || `${a[0]}\0${a[1]}\0${a[2]}`.localeCompare(`${b[0]}\0${b[1]}\0${b[2]}`, 'en'));
}
const sorted = Object.fromEntries(Object.keys(positions).sort().map(key => [key, positions[key]]));
const data = { version: 1, revision: provenance.revision, license: provenance.license, records: records.length, positions: sorted };
const serialized = JSON.stringify(data) + '\n';
const target = 'src/data/openings-index.json';
if (process.argv.includes('--check')) assert.equal(await fs.readFile(target, 'utf8'), serialized, 'Generated opening index is stale');
else { await fs.mkdir('src/data', { recursive: true }); await fs.writeFile(target, serialized); }
const bookData = { version: 1, revision: provenance.revision, license: provenance.license, rule: 'every position reached on a documented line (canonical EPD)', positions: [...documented].sort() };
const bookSerialized = JSON.stringify(bookData) + '\n';
const bookTarget = 'src/data/opening-book-positions.json';
if (process.argv.includes('--check')) assert.equal(await fs.readFile(bookTarget, 'utf8'), bookSerialized, 'Generated book-position index is stale');
else await fs.writeFile(bookTarget, bookSerialized);
const verification = { revision: provenance.revision, sourceRecords: records.length, positions: Object.keys(sorted).length, generatedBytes: Buffer.byteLength(serialized), sha256: createHash('sha256').update(serialized).digest('hex'), everySourceLineLegal: true, exactTerminalLookup: records.every(row => sorted[row.epd].some(candidate => candidate[0] === row.eco && candidate[1] === row.name && candidate[2] === row.uci)), bookPositions: documented.size, bookSha256: createHash('sha256').update(bookSerialized).digest('hex'), everyTerminalIsBookPosition: Object.keys(sorted).every(key => documented.has(key)) };
await fs.mkdir('artifacts/testing/phase3b', { recursive: true });
await fs.writeFile('artifacts/testing/phase3b/dataset-validation.json', JSON.stringify(verification, null, 2) + '\n');
console.log(JSON.stringify(verification, null, 2));
