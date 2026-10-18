import { describe, expect, it } from 'vitest';
import { readConfig, toChartInput } from '../src/config';
import { CONFIG, DEV_CHART, mountConfig } from './fixtures/config';

describe('readConfig', () => {
  it('returns the parsed config from #tsc-config', () => {
    mountConfig(document);
    expect(readConfig(document)).toEqual(CONFIG);
  });

  it('returns null when #tsc-config is absent', () => {
    document.body.innerHTML = '';
    expect(readConfig(document)).toBeNull();
  });

  it('returns null when #tsc-config is not JSON', () => {
    document.body.innerHTML = '<script id="tsc-config" type="application/json">{nope</script>';
    expect(readConfig(document)).toBeNull();
  });
});

describe('toChartInput', () => {
  it('maps the config chart to the engine ChartInput', () => {
    expect(toChartInput(CONFIG.chart)).toEqual(DEV_CHART);
  });
});
