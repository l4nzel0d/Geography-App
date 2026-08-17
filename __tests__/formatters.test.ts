import {
  formatArea,
  formatCapital,
  formatCurrencies,
  formatLanguages,
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

describe('formatLanguages', () => {
  it('renders a single language', () => {
    expect(formatLanguages(['Portuguese'])).toBe('Portuguese');
  });

  it('renders many languages', () => {
    expect(formatLanguages(['French', 'Swiss German', 'Italian', 'Romansh'])).toBe(
      'French, Swiss German, Italian, Romansh',
    );
  });

  it('falls back when absent', () => {
    expect(formatLanguages([])).toBe(NOT_AVAILABLE);
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
