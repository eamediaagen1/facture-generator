import type { Invoice } from './types';

const INVOICES_KEY = 'invoicer_invoices';
const COUNTER_KEY  = 'invoicer_counter';

interface Counter { year: number; seq: number }

function readCounter(): Counter {
  try {
    return JSON.parse(localStorage.getItem(COUNTER_KEY) ?? 'null') ?? { year: 0, seq: 0 };
  } catch {
    return { year: 0, seq: 0 };
  }
}

// Generates the next FAC-YYYY-NNNN number and persists the counter.
// Call once per "Nouvelle facture" action — never inside a render / useState initializer.
export function nextInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const stored = readCounter();
  const seq = (stored.year === year ? stored.seq : 0) + 1;
  localStorage.setItem(COUNTER_KEY, JSON.stringify({ year, seq }));
  return `FAC-${year}-${String(seq).padStart(4, '0')}`;
}

export function getInvoices(): Invoice[] {
  try {
    return JSON.parse(localStorage.getItem(INVOICES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function getInvoice(id: string): Invoice | undefined {
  return getInvoices().find(inv => inv.id === id);
}

export function saveInvoice(invoice: Invoice): void {
  const list = getInvoices();
  const idx = list.findIndex(i => i.id === invoice.id);
  if (idx >= 0) list[idx] = invoice;
  else list.unshift(invoice);
  localStorage.setItem(INVOICES_KEY, JSON.stringify(list));
}

export function deleteInvoice(id: string): void {
  localStorage.setItem(
    INVOICES_KEY,
    JSON.stringify(getInvoices().filter(i => i.id !== id)),
  );
}
