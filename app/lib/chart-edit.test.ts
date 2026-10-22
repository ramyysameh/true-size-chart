import { describe, expect, it } from 'vitest';
import type { ChartTable } from '@true-size-chart/engine';
import { addDim, addSize, availableDims, cellText, removeDim, removeSize, setCell, setSizeLabel } from './chart-edit';

const base = (): ChartTable => ({
  sizes: ['S', 'M'],
  measurements: { chest: [50, 54], length: [null, 70] },
});

describe('chart-edit', () => {
  it('adds a size row with an empty cell in every column', () => {
    expect(addSize(base())).toEqual({
      sizes: ['S', 'M', ''],
      measurements: { chest: [50, 54, null], length: [null, 70, null] },
    });
  });

  it('removes a size row from every column and drops aliases to it', () => {
    const t = { ...base(), aliases: { small: 'S', medium: 'M' } };
    const r = removeSize(t, 0);
    expect(r.sizes).toEqual(['M']);
    expect(r.measurements).toEqual({ chest: [54], length: [70] });
    expect(r.aliases).toEqual({ medium: 'M' });
  });

  it('renames a size and keeps aliases pointing at it', () => {
    const t = { ...base(), aliases: { small: 'S' } };
    const r = setSizeLabel(t, 0, 'XS');
    expect(r.sizes).toEqual(['XS', 'M']);
    expect(r.aliases).toEqual({ small: 'XS' });
  });

  it('adds a missing dim as an empty column and removes one', () => {
    const added = addDim(base(), 'waist');
    expect(added.measurements.waist).toEqual([null, null]);
    expect(addDim(added, 'waist')).toEqual(added);
    expect(removeDim(added, 'waist').measurements.waist).toBeUndefined();
  });

  it('lists the dims not yet present, in engine order', () => {
    expect(availableDims(base())).toEqual(['waist', 'hip', 'inseam']);
  });

  it('sets a cell from text; empty or unreadable becomes null', () => {
    expect(setCell(base(), 'chest', 0, '51.5').measurements.chest).toEqual([51.5, 54]);
    expect(setCell(base(), 'chest', 1, '').measurements.chest).toEqual([50, null]);
    expect(setCell(base(), 'chest', 1, '  ').measurements.chest).toEqual([50, null]);
    expect(setCell(base(), 'chest', 0, 'abc').measurements.chest).toEqual([null, 54]);
    expect(setCell(base(), 'chest', 0, '52,5').measurements.chest).toEqual([52.5, 54]);
  });

  it('does not mutate its input', () => {
    const t = base();
    setCell(t, 'chest', 0, '9');
    addSize(t);
    expect(t).toEqual(base());
  });

  it('formats a cell for an input', () => {
    expect(cellText(52.5)).toBe('52.5');
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
  });
});
