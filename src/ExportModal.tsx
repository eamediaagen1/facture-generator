import { useState } from 'react';
import { X, Download, FileText, FileJson } from 'lucide-react';
import type { Invoice, Achat, Client } from './types';
import { getFactures } from './services/factureService';
import { getAchats } from './services/achatService';
import { getClients } from './services/clientService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toCSV(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

const DOC_LABEL: Record<string, string> = {
  facture:       'Facture',
  devis:         'Devis',
  bon_livraison: 'Bon de Livraison',
};

// ── Types ─────────────────────────────────────────────────────────────────────

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AllData {
  factures: Invoice[];
  achats:   Achat[];
  clients:  Client[];
}

interface Props {
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExportModal({ onClose }: Props) {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [loadError,  setLoadError]  = useState('');
  const [allData,    setAllData]    = useState<AllData | null>(null);

  async function loadData() {
    setLoadStatus('loading');
    setLoadError('');
    try {
      const [factures, achats, clients] = await Promise.all([
        getFactures(),
        getAchats(),
        getClients(),
      ]);
      setAllData({ factures, achats, clients });
      setLoadStatus('ready');
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Erreur de chargement');
      setLoadStatus('error');
    }
  }

  function downloadJSON() {
    if (!allData) return;
    const payload = { ...allData, exportedAt: new Date().toISOString() };
    triggerDownload(JSON.stringify(payload, null, 2), `invoicer-backup-${todayStr()}.json`, 'application/json');
  }

  function downloadFacturesCSV() {
    if (!allData) return;
    const headers = ['Numéro', 'Type', 'Client', 'Date', 'HT (DH)', 'TVA (DH)', 'TTC (DH)', 'Statut'];
    const rows = allData.factures.map(f => [
      f.number,
      DOC_LABEL[f.documentType] ?? f.documentType,
      f.client.split('\n')[0].trim(),
      f.date,
      f.totalHT.toFixed(2),
      f.tvaAmount.toFixed(2),
      f.totalTTC.toFixed(2),
      f.status,
    ]);
    triggerDownload(toCSV(headers, rows), `documents-${todayStr()}.csv`, 'text/csv;charset=utf-8');
  }

  function downloadAchatsCSV() {
    if (!allData) return;
    const headers = ['Fournisseur', 'Date', 'N° Facture', 'Catégorie', 'HT (DH)', 'TVA (DH)', 'TTC (DH)', 'Statut paiement', 'Mode'];
    const rows = allData.achats.map(a => [
      a.supplier_name,
      a.invoice_date,
      a.supplier_invoice_number,
      a.category,
      a.amount_ht.toFixed(2),
      a.tva.toFixed(2),
      a.amount_ttc.toFixed(2),
      a.payment_status,
      a.payment_method ?? '',
    ]);
    triggerDownload(toCSV(headers, rows), `achats-${todayStr()}.csv`, 'text/csv;charset=utf-8');
  }

  function downloadClientsCSV() {
    if (!allData) return;
    const headers = ['Nom', 'ICE', 'IF', 'RC', 'Adresse', 'Ville', 'Téléphone', 'Email', 'Contact'];
    const rows = allData.clients.map(c => [
      c.name, c.ice, c.if_number, c.rc, c.address, c.city, c.phone, c.email, c.contact_person,
    ]);
    triggerDownload(toCSV(headers, rows), `clients-${todayStr()}.csv`, 'text/csv;charset=utf-8');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-800">Exporter les données</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">

          {loadStatus === 'idle' && (
            <div className="text-center py-4 space-y-4">
              <p className="text-sm text-slate-500 leading-relaxed">
                Téléchargez toutes vos données localement.<br />
                Aucune donnée n'est envoyée en ligne.
              </p>
              <button
                onClick={loadData}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Charger les données
              </button>
            </div>
          )}

          {loadStatus === 'loading' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Chargement…</p>
            </div>
          )}

          {loadStatus === 'error' && (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-red-600">{loadError}</p>
              <button onClick={loadData} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                Réessayer
              </button>
            </div>
          )}

          {loadStatus === 'ready' && allData && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                {allData.factures.length} document(s) · {allData.achats.length} achat(s) · {allData.clients.length} client(s)
              </p>

              <div className="space-y-2">
                <ExportBtn
                  icon={<FileJson className="w-5 h-5 text-violet-500 shrink-0" />}
                  label="Sauvegarde JSON"
                  sub="Toutes les données — idéal pour backup complet"
                  onClick={downloadJSON}
                />
                <ExportBtn
                  icon={<FileText className="w-5 h-5 text-blue-500 shrink-0" />}
                  label="Factures / Devis / Bons de Livraison (CSV)"
                  sub={`${allData.factures.length} document(s)`}
                  onClick={downloadFacturesCSV}
                />
                <ExportBtn
                  icon={<FileText className="w-5 h-5 text-emerald-500 shrink-0" />}
                  label="Achats (CSV)"
                  sub={`${allData.achats.length} achat(s)`}
                  onClick={downloadAchatsCSV}
                />
                <ExportBtn
                  icon={<FileText className="w-5 h-5 text-amber-500 shrink-0" />}
                  label="Clients (CSV)"
                  sub={`${allData.clients.length} client(s)`}
                  onClick={downloadClientsCSV}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportBtn({
  icon, label, sub, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
    >
      {icon}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </button>
  );
}
