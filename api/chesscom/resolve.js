// Preserve Linea's existing public-link metadata lookup on Vercel.
// The shared handler permits only numeric public Chess.com game URLs, validates
// every redirect and bounds content, time, cache and serial queue. No credentials.
export { handleChessComResolve as default } from '../../server/chesscom-resolver.js';
