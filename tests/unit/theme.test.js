import fs from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { FEEDBACK } from '../../src/chess.js';

const sheets = ['styles.css', 'review.css', 'accessibility.css'].map(name => ({ name, css: postcss.parse(fs.readFileSync(`src/${name}`, 'utf8')) }));
const tokens = {};
sheets[0].css.nodes.find(node => node.selector === ':root').walkDecls(decl => { tokens[decl.prop] = decl.value; });
const resolve = name => tokens[name]?.startsWith('var(') ? resolve(tokens[name].slice(4, -1)) : tokens[name];
const luminance = hex => {
  const values = hex.slice(1).match(/../g).slice(0, 3).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
};
const contrast = (first, second) => {
  const [light, dark] = [luminance(resolve(first)), luminance(resolve(second))].sort((a, b) => b - a);
  return (light + .05) / (dark + .05);
};

describe('Phase 1 L02 semantic token contract', () => {
  it('matches the required application, board and last-move colors exactly', () => {
    expect(Object.fromEntries(['--canvas', '--surface', '--surface-raised', '--border', '--text-primary', '--text-secondary', '--action', '--on-action', '--board-light', '--board-dark', '--board-last-light', '--board-last-dark'].map(key => [key, tokens[key]]))).toEqual({
      '--canvas': '#101110', '--surface': '#191b19', '--surface-raised': '#232621', '--border': '#34382f',
      '--text-primary': '#f3f2ea', '--text-secondary': '#b1b5a9', '--action': '#f5cf49', '--on-action': '#16180f',
      '--board-light': '#ded6b9', '--board-dark': '#766d50', '--board-last-light': '#e1c555', '--board-last-dark': '#a99d3c',
    });
  });
  it('keeps every authored color literal in the root tokens, not component overrides', () => {
    const outside = [];
    for (const { name, css } of sheets) css.walkDecls(decl => {
      if (/(#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\()/i.test(decl.value) && !(name === 'styles.css' && decl.parent.selector === ':root' && decl.prop.startsWith('--'))) outside.push(`${name}: ${decl.toString()}`);
    });
    expect(outside).toEqual([]);
    for (const file of ['App.jsx', 'Board.jsx', 'Panels.jsx', 'MovesPanel.jsx', 'ReportPanel.jsx', 'ReviewDetails.jsx', 'OpeningInfo.jsx', 'ImportContent.jsx', 'LichessImport.jsx', 'ReviewInsights.jsx', 'UI.jsx', 'chess.js']) {
      expect(fs.readFileSync(`src/${file}`, 'utf8'), file).not.toMatch(/#[\da-f]{3,8}\b/i);
    }
  });
  it('resolves every semantic variable used by styles and presentation markup', () => {
    const declared = new Set(['--ink', '--feedback-color']);
    for (const { css } of sheets) css.walkDecls(decl => { if (decl.prop.startsWith('--')) declared.add(decl.prop); });
    const missing = [];
    for (const file of [...sheets.map(({ name }) => name), 'App.jsx', 'Board.jsx', 'Panels.jsx', 'ReportPanel.jsx', 'ReviewDetails.jsx', 'OpeningInfo.jsx', 'ReviewInsights.jsx', 'chess.js']) {
      for (const [, variable] of fs.readFileSync(`src/${file}`, 'utf8').matchAll(/var\((--[\w-]+)/g)) if (!declared.has(variable)) missing.push(`${file}: ${variable}`);
    }
    expect(missing).toEqual([]);
  });
  it('uses DM Sans/system sans, readable 14/12/17px roles and no editorial UI fonts', () => {
    expect(tokens['--text-body']).toBe('14px');
    expect(tokens['--text-meta']).toBe('12px');
    expect(tokens['--text-title']).toBe('17px');
    expect(fs.readFileSync('src/styles.css', 'utf8')).toContain("font-family: 'DM Sans'");
    expect(sheets.map(({ css }) => css.toString()).join('')).not.toContain('Instrument Serif');
    const undersized = [];
    for (const { name, css } of sheets) css.walkDecls('font-size', decl => {
      if (/^\d+(?:\.\d+)?px$/.test(decl.value) && parseFloat(decl.value) < 12) undersized.push(`${name}: ${decl.toString()}`);
    });
    expect(undersized).toEqual([]);
  });
  it('has at least 4.5:1 functional text contrast on every interactive dark surface', () => {
    for (const fg of ['--text-primary', '--text-secondary', '--text-muted']) {
      for (const bg of ['--canvas', '--surface', '--surface-raised', '--surface-hover']) expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('preserves symbols/labels and accessible classification colors, including selected-yellow chips', () => {
    for (const [type, feedback] of Object.entries(FEEDBACK)) {
      expect(feedback.color).toBe(`var(--feedback-${type})`);
      expect(feedback.label).toBeTruthy(); expect(feedback.icon).toBeTruthy();
      for (const bg of ['--surface', '--surface-raised', '--surface-hover']) expect(contrast(`--feedback-${type}`, bg), `${type} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast('--feedback-on-color', `--feedback-${type}`), `${type} board badge`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast('--on-selection', '--selection')).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps errors, notice text, board coordinates and control boundaries readable', () => {
    for (const [fg, bg] of [['--error', '--error-surface'], ['--notice', '--notice-surface'], ['--board-coordinate-light', '--board-light'], ['--board-coordinate-dark', '--board-dark'], ['--on-action', '--board-last-light'], ['--on-action', '--board-last-dark'], ['--on-action', '--action']]) expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    for (const bg of ['--canvas', '--surface', '--surface-raised']) expect(contrast('--border-control', bg), `control border on ${bg}`).toBeGreaterThanOrEqual(3);
  });
});
