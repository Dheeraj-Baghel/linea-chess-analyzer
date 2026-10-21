// Ten-game demo sample for the homepage player-report clip (brief section 6).
// Games are constructed/well-known short legal lines with FICTIONAL display identities
// ("Demo Player" and invented opponents). They are reviewed once by the real batch
// pipeline (scripts/build-demo-report.mjs); no scores are written by hand.
const header = (n, white, black, result, format, elo, date) => `[Event "Linea demo sample ${n}"]\n[Site "Linea demo fixture, not a real account"]\n[Date "${date}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n[WhiteElo "${elo[0]}"]\n[BlackElo "${elo[1]}"]\n[TimeControl "${format === 'rapid' ? '600' : format === 'blitz' ? '180+2' : '60'}"]\n\n`;
const ME = 'Demo Player';
const raw = [
  // [white?, opponent, result, format, [myElo, oppElo], date, moves]
  [true, 'Sample Rival A', '1-0', 'rapid', [1210, 1185], '2026.10.01', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Nxc3 9. bxc3 Bxc3 10. Qb3 Bxa1 11. Bxf7+ Kf8 12. Bg5 Ne7 13. Ne5 d5 14. Qf3 Bf5 15. Bxe7+ Kxe7 16. Qxf5 1-0'],
  [false, 'Sample Rival B', '1-0', 'blitz', [1195, 1230], '2026.10.03', '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0'],
  [true, 'Sample Rival C', '0-1', 'blitz', [1205, 1240], '2026.10.04', '1. d4 d5 2. c4 e5 3. dxe5 d4 4. e3 Bb4+ 5. Bd2 dxe3 6. Bxb4 exf2+ 7. Ke2 fxg1=N+ 8. Ke1 Qh4+ 9. Kd2 Nc6 10. Bc3 Bg4 0-1'],
  [false, 'Sample Rival D', '1/2-1/2', 'rapid', [1220, 1210], '2026.10.06', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Be7 8. O-O O-O 9. Be3 Be6 10. Qd2 Nbd7 11. a4 Rc8 12. Rfd1 Qc7 13. f3 Rfd8 1/2-1/2'],
  [true, 'Sample Rival E', '1-0', 'bullet', [1180, 1150], '2026.10.08', '1. e4 e5 2. Qh5 Nc6 3. Bc4 g6 4. Qf3 Nf6 5. Qb3 Qe7 6. Nc3 Nd4 7. Qa4 c6 8. d3 b5 9. Bxb5 cxb5 10. Nxb5 Nxb5 11. Qxb5 Bb7 12. Bg5 Bg7 13. Nf3 O-O 14. O-O d5 1-0'],
  [false, 'Sample Rival F', '1-0', 'blitz', [1200, 1260], '2026.10.10', '1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3 Ne7 7. Qg4 O-O 8. Bd3 Nbc6 9. Qh5 Ng6 10. Nf3 Qc7 11. Bxg6 fxg6 12. Qxg6 Rf7 13. Ng5 Rf8 14. Qxh7# 1-0'],
  [true, 'Sample Rival G', '1/2-1/2', 'rapid', [1215, 1205], '2026.10.12', '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 5. Bd3 d5 6. Nf3 c5 7. O-O Nc6 8. a3 Bxc3 9. bxc3 dxc4 10. Bxc4 Qc7 11. Bd3 e5 12. Qc2 Re8 13. e4 exd4 14. cxd4 Bg4 15. d5 Nd4 16. Nxd4 cxd4 17. f3 Bd7 18. a4 Rac8 19. Qb2 Qc3 20. Qxc3 dxc3 1/2-1/2'],
  [false, 'Sample Rival H', '0-1', 'bullet', [1190, 1170], '2026.10.14', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1'],
  [true, 'Sample Rival I', '1-0', 'blitz', [1225, 1215], '2026.10.16', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 Bd7 13. Nf1 Rac8 14. Ne3 cxd4 15. cxd4 Nc6 16. d5 Nb4 17. Bb1 a5 18. a3 Na6 19. Bd2 Nc5 20. b4 axb4 21. axb4 Na4 22. Qe2 1-0'],
  [false, 'Sample Rival J', '1/2-1/2', 'rapid', [1210, 1220], '2026.10.18', '1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O O-O 9. Qe2 Nbd7 10. e4 Bg6 11. Bd3 Bh5 12. e5 Nd5 13. Nxd5 cxd5 14. Qe3 Bg6 15. Bxg6 hxg6 16. Bd2 Bxd2 17. Nxd2 Qb6 1/2-1/2'],
];
export const DEMO_REPORT_GAMES = raw.map(([white, opponent, result, format, elo, date, moves], index) => ({
  key: `demo:linea:${index + 1}`, provider: 'chess.com', id: `demo-${index + 1}`, url: '', color: white ? 'w' : 'b', format,
  date: `${date.replaceAll('.', '-')}T12:00:00Z`,
  pgn: header(index + 1, white ? ME : opponent, white ? opponent : ME, result, format, white ? elo : [elo[1], elo[0]], date) + moves,
}));
