import { getFactures } from './factureService';
import { getAchats } from './achatService';
import { getClients } from './clientService';
import { getBankStatements } from './bankStatementService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const BOM = '﻿';
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };
  return BOM + [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const todayStr = () => new Date().toISOString().split('T')[0];

// ── CSV exports ───────────────────────────────────────────────────────────────

export async function exportFacturesCSV() {
  const data = await getFactures();
  const rows = data.map(f => ({
    number:        f.number,
    document_type: f.documentType,
    client:        f.client.split('\n')[0].trim(),
    date:          f.date,
    total_ht:      f.totalHT,
    tva_amount:    f.tvaAmount,
    total_ttc:     f.totalTTC,
    status:        f.status,
  }));
  download(
    toCSV(rows, ['number','document_type','client','date','total_ht','tva_amount','total_ttc','status']),
    `factures-${todayStr()}.csv`,
    'text/csv;charset=utf-8',
  );
}

export async function exportDevisCSV() {
  const data = (await getFactures()).filter(f => f.documentType === 'devis');
  const rows = data.map(f => ({
    number:     f.number,
    client:     f.client.split('\n')[0].trim(),
    date:       f.date,
    total_ht:   f.totalHT,
    tva_amount: f.tvaAmount,
    total_ttc:  f.totalTTC,
    status:     f.status,
  }));
  download(
    toCSV(rows, ['number','client','date','total_ht','tva_amount','total_ttc','status']),
    `devis-${todayStr()}.csv`,
    'text/csv;charset=utf-8',
  );
}

export async function exportBLCSV() {
  const data = (await getFactures()).filter(f => f.documentType === 'bon_livraison');
  const rows = data.map(f => ({
    number:  f.number,
    client:  f.client.split('\n')[0].trim(),
    date:    f.date,
    status:  f.status,
  }));
  download(
    toCSV(rows, ['number','client','date','status']),
    `bons-livraison-${todayStr()}.csv`,
    'text/csv;charset=utf-8',
  );
}

export async function exportAchatsCSV() {
  const data = await getAchats();
  const rows = data.map(a => ({
    supplier_name:           a.supplier_name,
    invoice_date:            a.invoice_date,
    supplier_invoice_number: a.supplier_invoice_number,
    category:                a.category,
    amount_ht:               a.amount_ht,
    tva:                     a.tva,
    amount_ttc:              a.amount_ttc,
    payment_status:          a.payment_status,
    payment_method:          a.payment_method ?? '',
  }));
  download(
    toCSV(rows, ['supplier_name','invoice_date','supplier_invoice_number','category','amount_ht','tva','amount_ttc','payment_status','payment_method']),
    `achats-${todayStr()}.csv`,
    'text/csv;charset=utf-8',
  );
}

export async function exportClientsCSV() {
  const data = await getClients();
  const rows = data.map(c => ({
    name:           c.name,
    ice:            c.ice,
    if_number:      c.if_number,
    rc:             c.rc,
    address:        c.address,
    city:           c.city,
    phone:          c.phone,
    email:          c.email,
    contact_person: c.contact_person,
  }));
  download(
    toCSV(rows, ['name','ice','if_number','rc','address','city','phone','email','contact_person']),
    `clients-${todayStr()}.csv`,
    'text/csv;charset=utf-8',
  );
}

export async function exportBankStatementsCSV() {
  const data = await getBankStatements();
  const rows = data.map(s => ({
    year:            s.year,
    month:           s.month,
    opening_balance: s.opening_balance,
    total_credit:    s.total_credit,
    total_debit:     s.total_debit,
    closing_balance: s.closing_balance,
    notes:           s.notes,
  }));
  download(
    toCSV(rows, ['year','month','opening_balance','total_credit','total_debit','closing_balance','notes']),
    `releves-bancaires-${todayStr()}.csv`,
    'text/csv;charset=utf-8',
  );
}

// ── JSON backup ───────────────────────────────────────────────────────────────

export async function exportAllJSON() {
  const [factures, achats, clients, bankStatements] = await Promise.all([
    getFactures(), getAchats(), getClients(), getBankStatements(),
  ]);
  const backup = {
    exported_at:     new Date().toISOString(),
    version:         '1.0',
    factures,
    achats,
    clients,
    bank_statements: bankStatements,
  };
  download(
    JSON.stringify(backup, null, 2),
    `backup-AMOR-AMENAGEMENT-${todayStr()}.json`,
    'application/json',
  );
}

// ── JSON import ───────────────────────────────────────────────────────────────

export interface BackupPreview {
  exported_at: string;
  version: string;
  counts: {
    factures: number;
    achats: number;
    clients: number;
    bank_statements: number;
  };
}

export function parseBackupFile(json: string): { preview: BackupPreview; raw: Record<string, unknown> } {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (!raw.version || !raw.factures) throw new Error('Fichier de sauvegarde invalide');
  return {
    raw,
    preview: {
      exported_at:    raw.exported_at as string,
      version:        raw.version as string,
      counts: {
        factures:        (raw.factures        as unknown[]).length,
        achats:          (raw.achats          as unknown[]).length,
        clients:         (raw.clients         as unknown[]).length,
        bank_statements: ((raw.bank_statements as unknown[] | undefined) ?? []).length,
      },
    },
  };
}

import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';

// ── Trimester ZIP export ──────────────────────────────────────────────────────

const TRIM_MONTHS: Record<1 | 2 | 3 | 4, [number, number]> = {
  1: [1, 3],
  2: [4, 6],
  3: [7, 9],
  4: [10, 12],
};

export async function exportAchatsTrimesterZip(year: number, trimester: 1 | 2 | 3 | 4): Promise<void> {
  const [mStart, mEnd] = TRIM_MONTHS[trimester];
  const dateStart = `${year}-${String(mStart).padStart(2, '0')}-01`;
  const dateEnd   = `${year}-${String(mEnd).padStart(2, '0')}-${mEnd === 3 ? 31 : mEnd === 6 ? 30 : mEnd === 9 ? 30 : 31}`;

  const allAchats = await getAchats();
  const rows = allAchats.filter(a => {
    const d = a.invoice_date;
    return d >= dateStart && d <= dateEnd;
  });

  const zip = new JSZip();

  // Build XLSX saisie
  const xlsRows = rows.map(a => ({
    'Date':               a.invoice_date,
    'Fournisseur':        a.supplier_name,
    'Numéro facture':     a.supplier_invoice_number,
    'Montant HT':         a.amount_ht,
    'TVA':                a.tva,
    'Montant TTC':        a.amount_ttc,
    'Mode de paiement':   a.payment_method ?? '',
    'Catégorie':          a.category,
    'Notes / Référence':  a.notes,
    'Fichier joint':      a.file_path ? a.file_path.split('/').pop() ?? '' : '',
  }));

  const ws = XLSX.utils.json_to_sheet(xlsRows.length > 0 ? xlsRows : [
    {
      'Date': '', 'Fournisseur': '', 'Numéro facture': '',
      'Montant HT': '', 'TVA': '', 'Montant TTC': '',
      'Mode de paiement': '', 'Catégorie': '', 'Notes / Référence': '', 'Fichier joint': '',
    },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Saisie T${trimester} ${year}`);
  const xlsBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  zip.file(`saisie_achats_T${trimester}_${year}.xlsx`, xlsBuffer);

  // Fetch and bundle attachment files
  const filesFolder = zip.folder('documents');
  await Promise.all(
    rows
      .filter(a => a.file_url)
      .map(async a => {
        try {
          const resp = await fetch(a.file_url!);
          if (!resp.ok) return;
          const blob = await resp.blob();
          const ext  = a.file_url!.split('?')[0].split('.').pop() ?? 'bin';
          const safe = a.supplier_name.replace(/[^a-zA-Z0-9À-ɏ\-_ ]/g, '_').slice(0, 40);
          const name = `${a.invoice_date}_${safe}_${a.supplier_invoice_number || a.id.slice(0, 8)}.${ext}`;
          filesFolder!.file(name, blob);
        } catch {
          // skip files that can't be fetched
        }
      }),
  );

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `achats_export_T${trimester}_${year}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromBackup(
  raw: Record<string, unknown>,
): Promise<{ inserted: number; errors: string[] }> {
  let inserted = 0;
  const errors: string[] = [];

  const attempt = async (table: string, rows: unknown[]) => {
    if (!rows.length) return;
    const { error } = await supabase
      .from(table)
      .upsert(rows as Record<string, unknown>[], { onConflict: 'id', ignoreDuplicates: false });
    if (error) errors.push(`${table}: ${error.message}`);
    else inserted += rows.length;
  };

  await attempt('factures',        (raw.factures        as unknown[] | undefined) ?? []);
  await attempt('achats',          (raw.achats          as unknown[] | undefined) ?? []);
  await attempt('clients',         (raw.clients         as unknown[] | undefined) ?? []);
  await attempt('bank_statements', (raw.bank_statements as unknown[] | undefined) ?? []);

  return { inserted, errors };
}
