// Phase 1: the application is always dark/yellow; `theme` is the legacy field
// name for the BOARD palette only. Keep existing v1 choices, pieces, sound,
// coordinates, animation and move badges. A genuinely new user gets Neutral.
// v3 turns the newly-added real move sounds on once. v2's `sound:false` was the old
// synthetic-beep default, so carrying it forward would silently hide the requested MP3s.
export const DISPLAY_KEY = 'linea-display-v3';
export const LEGACY_DISPLAY_KEY = 'linea-display-v2';
export const BOARD_PALETTES = [['neutral', 'Neutral'], ['sage', 'Sage'], ['walnut', 'Walnut'], ['slate', 'Slate']];
export const DEFAULT_DISPLAY_SETTINGS = Object.freeze({
  theme: 'neutral', pieces: 'classic', coordinates: true, animation: true, sound: true, moveBadges: true,
});

export function normalizeDisplaySettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = { ...DEFAULT_DISPLAY_SETTINGS };
  for (const key of ['coordinates', 'animation', 'sound', 'moveBadges']) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  if (BOARD_PALETTES.some(([key]) => key === source.theme)) result.theme = source.theme;
  // Piece style is fixed to the cburnett set; any saved 'figurine' value normalizes to 'classic'.
  return result;
}

export function readDisplaySettings(storage) {
  try {
    const store = storage || window.localStorage;
    const current = store.getItem(DISPLAY_KEY);
    if (current !== null) return normalizeDisplaySettings(JSON.parse(current));
    const legacy = store.getItem(LEGACY_DISPLAY_KEY);
    const settings = normalizeDisplaySettings(legacy === null ? null : { ...JSON.parse(legacy), sound: true });
    // Migration is additive, never deletes v1 or touches game/other app storage.
    // A blocked write must not discard preferences successfully read from v1.
    if (legacy !== null) saveDisplaySettings(settings, store);
    return settings;
  } catch { return { ...DEFAULT_DISPLAY_SETTINGS }; }
}

export function saveDisplaySettings(settings, storage) {
  try {
    (storage || window.localStorage).setItem(DISPLAY_KEY, JSON.stringify(normalizeDisplaySettings(settings)));
    return true;
  } catch { return false; }
}
