import { describe, expect, it } from 'vitest';
import { parsePastedTable } from './paste';

function ok(text: string) {
  const r = parsePastedTable(text);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('parsePastedTable', () => {
  it('parses a tab-separated table with header synonyms', () => {
    const r = ok('Size\tBUST\tHips\tInside leg\nS\t88\t94\t78\nM\t92\t98\t80');
    expect(r.table).toEqual({
      sizes: ['S', 'M'],
      measurements: { chest: [88, 92], hip: [94, 98], inseam: [78, 80] },
    });
    expect(r.ignored).toEqual([]);
  });

  it('transposes when sizes run across the top', () => {
    const r = ok('Size\tS\tM\tL\nChest\t88\t92\t96\nBody Length\t66\t68\t70');
    expect(r.table).toEqual({
      sizes: ['S', 'M', 'L'],
      measurements: { chest: [88, 92, 96], length: [66, 68, 70] },
    });
  });

  it('reads decimal commas in semicolon-separated data', () => {
    const r = ok('Size;Chest;Waist\nS;52,5;40,5\nM;55;43');
    expect(r.table.measurements).toEqual({ chest: [52.5, 55], waist: [40.5, 43] });
  });

  it('averages ranges written with a hyphen or an en dash', () => {
    const r = ok('Size\tChest\nS\t86-90\nM\t90–94');
    expect(r.table.measurements.chest).toEqual([88, 92]);
  });

  it('strips quotes and units and turns blanks into null', () => {
    const r = ok('Size\tChest (in)\tWaist (cm)\nS\t34"\t\nM\t36 in\t80cm');
    expect(r.table.measurements).toEqual({ chest: [34, 36], waist: [null, 80] });
  });

  it('splits on commas only when there is no tab or semicolon', () => {
    const r = ok('Size,Chest,Waist\nS,88,70\nM,92,74');
    expect(r.table.sizes).toEqual(['S', 'M']);
    expect(r.table.measurements.chest).toEqual([88, 92]);
  });

  it('handles CRLF and trailing blank lines', () => {
    const r = ok('Size\tChest\r\nS\t88\r\n\r\n');
    expect(r.table.sizes).toEqual(['S']);
  });

  it('reports unknown columns as ignored', () => {
    const r = ok('Size\tChest\tSKU\nS\t88\tabc');
    expect(r.ignored).toEqual(['SKU']);
    expect(r.table.measurements).toEqual({ chest: [88] });
  });

  it('errors on fewer than two rows', () => {
    expect(parsePastedTable('Size\tChest').ok).toBe(false);
    expect(parsePastedTable('').ok).toBe(false);
  });

  it('errors without a size column', () => {
    const r = parsePastedTable('Foo\tChest\nS\t88');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/size column/i) });
  });

  it('errors without a recognised measurement column', () => {
    const r = parsePastedTable('Size\tColour\nS\tred');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/measurement/i) });
  });

  it('errors on an unreadable value instead of guessing', () => {
    const r = parsePastedTable('Size\tChest\nS\tabc');
    expect(r.ok).toBe(false);
  });

  it('errors instead of dropping a decimal-comma digit in comma-only data', () => {
    const r = parsePastedTable('Size,Chest\nS,52,5\nM,55');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/columns apart/i) });
  });

  it('errors on lines that are just a decimal comma', () => {
    const r = parsePastedTable('Size\n52,5\n55,5');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/columns apart/i) });
  });

  it('still reads a decimal comma in semicolon data', () => {
    expect(ok('Size;Chest\nS;52,5').table.measurements.chest).toEqual([52.5]);
  });

  it('pads rows with fewer cells than the header with null', () => {
    expect(ok('Size\tChest\tWaist\nS\t88').table.measurements).toEqual({ chest: [88], waist: [null] });
  });
});
