// Explicit synthetic provider fixtures, not historical Lichess records.
export function lichessRecord(id = 'Abcd1234', extra = {}) {
  const pgn = `[Event "Lichess import regression"]\n[Site "https://lichess.org/${id}"]\n[GameId "${id}"]\n[White "Alice"]\n[Black "Bob"]\n[WhiteElo "1500"]\n[BlackElo "1600"]\n[Result "0-1"]\n[TimeControl "300+3"]\n[Variant "Standard"]\n[ECO "A00"]\n[Opening "Fixture supplied opening"]\n\n1. f3 {[%clk 0:05:00]} e5 {[%clk 0:04:59]} 2. g4 Qh4# 0-1`;
  return { id, rated: true, variant: 'standard', speed: 'blitz', status: 'mate', createdAt: 1790000000000, lastMoveAt: 1790000100000, winner: 'black', clock: { initial: 300, increment: 3 }, players: { white: { user: { id: 'alice', name: 'Alice' }, rating: 1500 }, black: { user: { id: 'bob', name: 'Bob' }, rating: 1600 } }, pgn, ...extra };
}
