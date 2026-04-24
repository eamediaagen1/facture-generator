const units = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept',
  'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze',
  'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'
];

const tens = [
  '', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'
];

function convertHundreds(n: number): string {
  if (n === 0) return '';
  if (n < 20) return units[n];
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return tens[t];
    if (u === 1 && t !== 8) return `${tens[t]} et un`;
    return `${tens[t]}-${units[u]}`;
  }
  if (n < 80) {
    const remainder = n - 60;
    if (remainder === 11) return 'soixante et onze';
    return `soixante-${convertHundreds(remainder)}`;
  }
  if (n < 100) {
    const remainder = n - 80;
    if (remainder === 0) return 'quatre-vingts';
    return `quatre-vingt-${convertHundreds(remainder)}`;
  }
  return '';
}

function convertGroup(n: number, scale: number): string {
  if (n === 0) return '';
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  let result = '';
  if (hundreds > 0) {
    result = hundreds === 1 ? 'cent' : `${units[hundreds]} cent`;
    if (remainder === 0 && scale > 0) result += 's';
  }
  if (remainder > 0) {
    if (result) result += ' ';
    result += convertHundreds(remainder);
  }
  return result;
}

export function numberToFrenchWords(amount: number): string {
  if (amount === 0) return 'zero dirham';
  const parts = amount.toFixed(2).split('.');
  const integerPart = parseInt(parts[0]);
  const decimalPart = parseInt(parts[1]);
  if (integerPart === 0 && decimalPart === 0) return 'zero dirham';

  const scales = [
    { value: 1000000000, name: 'milliard', plural: 'milliards' },
    { value: 1000000, name: 'million', plural: 'millions' },
    { value: 1000, name: 'mille', plural: 'mille' },
  ];

  let result = '';
  let remaining = integerPart;

  for (const scale of scales) {
    if (remaining >= scale.value) {
      const count = Math.floor(remaining / scale.value);
      remaining = remaining % scale.value;
      if (count > 0) {
        if (result) result += ' ';
        if (scale.value === 1000 && count === 1) {
          result += 'mille';
        } else {
          result += convertGroup(count, 0) + ' ';
          result += count > 1 ? scale.plural : scale.name;
        }
      }
    }
  }

  if (remaining > 0) {
    if (result) result += ' ';
    result += convertGroup(remaining, 0);
  }

  if (integerPart > 0) {
    result += integerPart === 1 ? ' dirham' : ' dirhams';
  }

  if (decimalPart > 0) {
    if (result) result += ' et ';
    result += convertGroup(decimalPart, 0);
    result += decimalPart === 1 ? ' centime' : ' centimes';
  }

  return result;
}
