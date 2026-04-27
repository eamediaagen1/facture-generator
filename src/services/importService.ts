import * as XLSX from 'xlsx';
import type { Achat, AchatPaymentStatus, PaymentMethod } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImportRow {
  _idx: number;
  _errors: string[];
  _isDuplicate: boolean;
  supplier_name: string;
  invoice_date: string;
  supplier_invoice_number: string;
  category: string;
  description: string;
  amount_ht: number;
  tva: number;
  amount_ttc: number;
  payment_status: AchatPaymentStatus;
  payment_method: PaymentMethod;
  notes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function norm(s: string) {
  return stripAccents(s.trim().toLowerCase());
}

function parseDate(raw: unknown): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return '';
}

function parseNum(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(String(raw).replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function normalizePaymentMethod(raw: unknown): PaymentMethod {
  const s = norm(String(raw ?? ''));
  if (s.startsWith('ch')) return 'Chèque';
  if (s.startsWith('es')) return 'Espèce';
  return 'Virement';
}

function normalizePaymentStatus(raw: unknown): AchatPaymentStatus {
  const s = norm(String(raw ?? ''));
  if (s === 'paye' || s === 'paid' || s === 'payé') return 'Payé';
  return 'Non payé';
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function parseImportFile(file: File): Promise<ImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, dateNF: 'yyyy-mm-dd' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: '',
  });

  return rawRows.map((raw, idx) => {
    const errors: string[] = [];

    const supplier_name          = String(raw.fournisseur ?? raw.supplier_name ?? '').trim();
    const invoice_date           = parseDate(raw.date_facture ?? raw.invoice_date);
    const supplier_invoice_number = String(raw.numero_facture_fournisseur ?? raw.supplier_invoice_number ?? '').trim();
    const category               = String(raw.categorie ?? raw.category ?? '').trim();
    const description            = String(raw.description ?? '').trim();
    const amount_ht              = parseNum(raw.montant_ht ?? raw.amount_ht);
    const tva                    = parseNum(raw.tva);
    let   amount_ttc             = parseNum(raw.montant_ttc ?? raw.amount_ttc);
    if (!amount_ttc && (amount_ht || tva)) amount_ttc = amount_ht + tva;
    const payment_status         = normalizePaymentStatus(raw.statut_paiement ?? raw.payment_status);
    const payment_method         = normalizePaymentMethod(raw.payment_method);
    const notes                  = String(raw.notes ?? '').trim();

    if (!supplier_name) errors.push('Fournisseur manquant');
    if (!invoice_date)  errors.push('Date invalide');
    if (!amount_ttc)    errors.push('Montant TTC manquant');

    return {
      _idx: idx,
      _errors: errors,
      _isDuplicate: false,
      supplier_name, invoice_date, supplier_invoice_number,
      category, description,
      amount_ht, tva, amount_ttc,
      payment_status, payment_method, notes,
    };
  });
}

export function markDuplicates(rows: ImportRow[], existing: Achat[]): ImportRow[] {
  const existingKeys = new Set(
    existing
      .filter(a => a.supplier_name && a.supplier_invoice_number)
      .map(a => `${norm(a.supplier_name)}::${norm(a.supplier_invoice_number)}`),
  );
  return rows.map(row => {
    const isDuplicate =
      !!(row.supplier_name && row.supplier_invoice_number &&
         existingKeys.has(`${norm(row.supplier_name)}::${norm(row.supplier_invoice_number)}`));
    return { ...row, _isDuplicate: isDuplicate };
  });
}
