import { describe, expect, it } from 'vitest';
import { csvCell } from './admin-values';

describe('spreadsheet exports', () => {
  it('escapes direct and whitespace-prefixed formulas', () => {
    for (const value of [
      '=HYPERLINK("https://example.test")',
      ' +SUM(1,2)',
      '\t@SUM(1)',
      '\nvalue',
      '-1+2',
    ])
      expect(csvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
  });
  it('preserves ordinary text and CSV quotes', () => {
    expect(csvCell('ASC-000001')).toBe('"ASC-000001"');
    expect(csvCell('Training "bundle", online')).toBe('"Training ""bundle"", online"');
  });
});
