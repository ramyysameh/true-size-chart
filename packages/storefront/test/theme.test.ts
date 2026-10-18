import { describe, expect, it } from 'vitest';
import { applyTheme, contrastText } from '../src/finder/theme';

describe('contrastText', () => {
  it('puts black text on a light accent', () => {
    expect(contrastText('#ffff00')).toBe('#000000');
  });

  it('puts white text on a dark accent', () => {
    expect(contrastText('#111111')).toBe('#ffffff');
  });

  it('keeps white while it still reaches 4.5:1', () => {
    expect(contrastText('#767676')).toBe('#ffffff');
  });

  it('reads 3-digit hex', () => {
    expect(contrastText('#ff0')).toBe('#000000');
  });
});

describe('applyTheme', () => {
  const vars = (el: HTMLElement) =>
    ['--tsc-font', '--tsc-accent', '--tsc-on-accent', '--tsc-radius'].map((v) => el.style.getPropertyValue(v));

  it('maps the editorial font, accent, its text colour and the radius to CSS vars', () => {
    const el = document.createElement('div');
    applyTheme(el, { font: 'editorial', accent: '#ffff00', radius: 6 });
    expect(vars(el)).toEqual(['"Helvetica Neue", Helvetica, Arial, sans-serif', '#ffff00', '#000000', '6px']);
  });

  it('inherits the theme font, and falls back to black for an unusable accent', () => {
    const el = document.createElement('div');
    applyTheme(el, { font: 'theme', accent: 'lime', radius: 0 });
    expect(vars(el)).toEqual(['inherit', '#111111', '#ffffff', '0px']);
  });
});
