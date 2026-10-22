import { describe, expect, it } from 'vitest';
import { extensionStatus, themeEditorLinks } from './theme-links';

describe('themeEditorLinks', () => {
  it('builds the deep links', () => {
    expect(themeEditorLinks('x.myshopify.com', 'abc')).toEqual({
      embed: 'https://x.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=abc/tsc-embed',
      block:
        'https://x.myshopify.com/admin/themes/current/editor?template=product&addAppBlockId=abc/tsc-button&target=mainSection',
    });
  });
});

describe('extensionStatus', () => {
  const fixture = [
    { handle: 'other', type: 'ui_extension', activations: [] },
    {
      handle: 'true-size-chart',
      type: 'theme_app_extension',
      activations: [
        { handle: 'tsc-embed', name: 'Embed', target: 'body', status: 'active', activations: [] },
        { handle: 'tsc-button', name: 'Button', target: 'section', status: 'available' },
      ],
    },
  ];
  it('reads embed and block status', () => {
    expect(extensionStatus(fixture)).toEqual({ embed: 'active', block: 'available' });
  });
  it('maps unavailable and missing handles to unknown', () => {
    const f = [{ type: 'theme_app_extension', activations: [{ handle: 'tsc-embed', status: 'unavailable' }] }];
    expect(extensionStatus(f)).toEqual({ embed: 'unknown', block: 'unknown' });
  });
  it('unknown for malformed input', () => {
    expect(extensionStatus(null)).toEqual({ embed: 'unknown', block: 'unknown' });
    expect(extensionStatus([null, 3, { type: 'theme_app_extension' }])).toEqual({ embed: 'unknown', block: 'unknown' });
  });
});
