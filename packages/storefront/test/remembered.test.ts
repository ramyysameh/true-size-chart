import { beforeEach, describe, expect, it } from 'vitest';
import { paintRemembered } from '../src/remembered';
import { mountConfig } from './fixtures/config';

beforeEach(() => {
  mountConfig(document);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<a data-tsc-open="chart" data-tsc-default="Size chart" data-tsc-remembered="Mine: {size}"><span data-tsc-label>Size chart</span></a>',
  );
});

const label = (sel: string) => document.querySelector(`${sel} [data-tsc-label]`)?.textContent;

describe('paintRemembered', () => {
  it('shows the remembered size', () => {
    paintRemembered(document, 'XL');
    expect(label('button[data-tsc-open]')).toBe('Your size: XL');
  });

  it('restores the default label when size is null', () => {
    paintRemembered(document, 'XL');
    paintRemembered(document, null);
    expect(label('button[data-tsc-open]')).toBe('Find my size');
  });

  it('leaves the data-tsc-open="chart" link untouched', () => {
    paintRemembered(document, 'XL');
    expect(label('[data-tsc-open="chart"]')).toBe('Size chart');
  });
});
