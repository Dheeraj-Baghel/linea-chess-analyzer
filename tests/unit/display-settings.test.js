import { describe, expect, it } from 'vitest';
import { BOARD_PALETTES, DEFAULT_DISPLAY_SETTINGS, DISPLAY_KEY, LEGACY_DISPLAY_KEY, normalizeDisplaySettings, readDisplaySettings, saveDisplaySettings } from '../../src/displaySettings.js';

function memory(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

describe('Phase 1 board-only display preferences', () => {
  it('gives a new user Neutral without creating or changing unrelated storage', () => {
    const store = memory({ 'other-app': 'untouched' });
    expect(readDisplaySettings(store)).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect([...store.values]).toEqual([['other-app', 'untouched']]);
  });
  for (const palette of ['sage', 'walnut', 'slate']) it(`migrates saved ${palette} and every existing preference without deleting v1`, () => {
    const saved = { theme: palette, pieces: 'figurine', coordinates: false, animation: false, sound: true, moveBadges: false };
    const original = JSON.stringify(saved), store = memory({ [LEGACY_DISPLAY_KEY]: original, 'other-app': 'untouched' });
    expect(readDisplaySettings(store)).toEqual({ ...saved, pieces: 'classic' });
    expect(JSON.parse(store.getItem(DISPLAY_KEY))).toEqual({ ...saved, pieces: 'classic' });
    expect(store.getItem(LEGACY_DISPLAY_KEY)).toBe(original);
    expect(store.getItem('other-app')).toBe('untouched');
  });
  it('honors the current choice instead of applying the legacy preference again', () => {
    const store = memory({ [DISPLAY_KEY]: JSON.stringify({ theme: 'neutral', sound: true }), [LEGACY_DISPLAY_KEY]: JSON.stringify({ theme: 'walnut' }) });
    expect(readDisplaySettings(store)).toEqual({ ...DEFAULT_DISPLAY_SETTINGS, sound: true });
  });
  it('retains successfully read legacy settings if migration storage is full', () => {
    const store = memory({ [LEGACY_DISPLAY_KEY]: JSON.stringify({ theme: 'slate', coordinates: false }) });
    store.setItem = () => { throw new Error('QuotaExceeded'); };
    expect(readDisplaySettings(store)).toEqual({ ...DEFAULT_DISPLAY_SETTINGS, theme: 'slate', coordinates: false });
    expect(store.getItem(DISPLAY_KEY)).toBeNull();
  });
  it('uses safe in-memory defaults when storage cannot be read', () => {
    expect(readDisplaySettings({ getItem: () => { throw new Error('Blocked'); } })).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });
  it('never overwrites unreadable JSON during a read', () => {
    const store = memory({ [DISPLAY_KEY]: '{broken' });
    expect(readDisplaySettings(store)).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(store.getItem(DISPLAY_KEY)).toBe('{broken');
  });
  it('normalizes malformed field types without accepting unknown board or piece values', () => {
    expect(normalizeDisplaySettings({ theme: 'light-app', pieces: 'remote', coordinates: 'false', sound: true, unexpected: 'value' })).toEqual({ ...DEFAULT_DISPLAY_SETTINGS, sound: true });
    expect(normalizeDisplaySettings(null)).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(normalizeDisplaySettings([])).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });
  it('persists only display fields and leaves game data alone', () => {
    const store = memory({ pgn: 'original game' });
    expect(saveDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, theme: 'walnut', game: 'discard me' }, store)).toBe(true);
    expect(JSON.parse(store.getItem(DISPLAY_KEY))).toEqual({ ...DEFAULT_DISPLAY_SETTINGS, theme: 'walnut' });
    expect(store.getItem('pgn')).toBe('original game');
  });
  it('reports failed saves while leaving caller-owned in-memory settings usable', () => {
    const settings = { ...DEFAULT_DISPLAY_SETTINGS, theme: 'sage' };
    expect(saveDisplaySettings(settings, { setItem: () => { throw new Error('Blocked'); } })).toBe(false);
    expect(settings.theme).toBe('sage');
  });
  it('offers the new default and all legacy palettes independently of app theme', () => {
    expect(BOARD_PALETTES.map(([key]) => key)).toEqual(['neutral', 'sage', 'walnut', 'slate']);
    expect(DEFAULT_DISPLAY_SETTINGS).not.toHaveProperty('appTheme');
  });
});
