import {
  formatArea,
  formatCapital,
  formatCompactNumber,
  formatCurrencies,
  formatLabelList,
  formatPopulation,
  NOT_AVAILABLE,
} from '@/components/formatters';

describe('formatPopulation', () => {
  it('groups thousands', () => {
    expect(formatPopulation(212812405)).toBe('212,812,405');
  });

  it('falls back for territories with no reported population', () => {
    expect(formatPopulation(null)).toBe(NOT_AVAILABLE);
    expect(formatPopulation(undefined)).toBe(NOT_AVAILABLE);
  });

  it('does not treat zero as missing', () => {
    expect(formatPopulation(0)).toBe('0');
  });
});

describe('formatCurrencies', () => {
  it('includes the symbol when present', () => {
    expect(formatCurrencies([{ code: 'BRL', name: 'Brazilian real', symbol: 'R$' }])).toBe(
      'Brazilian real (BRL, R$)',
    );
  });

  it('omits the symbol when the dataset has none', () => {
    expect(formatCurrencies([{ code: 'XYZ', name: 'Testcoin', symbol: null }])).toBe(
      'Testcoin (XYZ)',
    );
  });

  it('joins multiple currencies', () => {
    const result = formatCurrencies([
      { code: 'USD', name: 'United States dollar', symbol: '$' },
      { code: 'PAB', name: 'Panamanian balboa', symbol: 'B/.' },
    ]);
    expect(result).toContain('United States dollar (USD, $)');
    expect(result).toContain('Panamanian balboa (PAB, B/.)');
  });

  it('falls back for an empty list', () => {
    expect(formatCurrencies([])).toBe(NOT_AVAILABLE);
    expect(formatCurrencies(null)).toBe(NOT_AVAILABLE);
  });
});

describe('formatCapital', () => {
  it('handles countries with no capital', () => {
    // Nauru is the canonical case - the dataset genuinely has none.
    expect(formatCapital([])).toBe(NOT_AVAILABLE);
  });

  it('joins multiple capitals', () => {
    expect(formatCapital(['Pretoria', 'Cape Town', 'Bloemfontein'])).toBe(
      'Pretoria, Cape Town, Bloemfontein',
    );
  });
});

describe('formatArea', () => {
  it('formats and labels square kilometres', () => {
    expect(formatArea(8515767)).toBe('8,515,767 km²');
  });

  it('falls back when absent', () => {
    expect(formatArea(null)).toBe(NOT_AVAILABLE);
  });
});

describe('formatCompactNumber', () => {
  it('rounds to two significant figures with a k/m/b suffix', () => {
    expect(formatCompactNumber(1451000000)).toBe('1.5b');
    expect(formatCompactNumber(343000000)).toBe('340m');
    expect(formatCompactNumber(68000000)).toBe('68m');
    expect(formatCompactNumber(11200)).toBe('11k');
  });

  it('rounds before choosing the unit', () => {
    // The other order prints this as "1000m": the unit is picked while the value is
    // still under a billion, and only then rounded.
    expect(formatCompactNumber(999999999)).toBe('1.0b');
  });

  it('stays short for every real population', () => {
    // The fit test in labelFit.ts assumes label width is roughly constant across
    // countries. Tuvalu is the smallest and India the largest.
    for (const value of [11200, 1451000000, 340000000, 5600000]) {
      expect(formatCompactNumber(value).length).toBeLessThanOrEqual(4);
    }
  });

  it('falls back for a missing figure', () => {
    expect(formatCompactNumber(null)).toBe(NOT_AVAILABLE);
    expect(formatCompactNumber(undefined)).toBe(NOT_AVAILABLE);
    expect(formatCompactNumber(Number.NaN)).toBe(NOT_AVAILABLE);
  });

  it('leaves formatPopulation alone', () => {
    // The info sheet has a row to itself and keeps the grouped form.
    expect(formatPopulation(68000000)).toBe('68,000,000');
  });
});

describe('formatLabelList', () => {
  it('keeps the first three entries', () => {
    expect(formatLabelList(['Shona', 'Ndebele', 'English', 'Chewa', 'Tonga'])).toBe(
      'Shona, Ndebele, English',
    );
  });

  it('leaves shorter lists whole', () => {
    expect(formatLabelList(['French'])).toBe('French');
  });

  it('returns null for an empty list, so the property can be omitted entirely', () => {
    // Absence, not a placeholder: it is what lets the layer filter use ['has', ...].
    expect(formatLabelList([])).toBeNull();
    expect(formatLabelList(null)).toBeNull();
    expect(formatLabelList(undefined)).toBeNull();
  });
});
