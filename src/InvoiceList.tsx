import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import ExportModal from './ExportModal';
import {
  Plus, Search, Eye, Edit2, Download, Trash2,
  FileText, ChevronDown,
  Receipt, TrendingUp, CheckCircle, Clock,
  Truck,
} from 'lucide-react';
import type { Invoice, InvoiceStatus, DocumentType } from './types';
import { getFactures, deleteFacture, updateStatus, upsertFacture, factureExistsForDevis, blExistsForSource } from './services/factureService';
import { nextInvoiceNumber } from './services/numberingService';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  Brouillon: 'bg-slate-100 text-slate-500',
  Générée:   'bg-violet-50 text-violet-700',
  Envoyée:   'bg-blue-50 text-blue-700',
  Payée:     'bg-emerald-50 text-emerald-700',
  Annulée:   'bg-red-50 text-red-600',
  Envoyé:    'bg-blue-50 text-blue-700',
  Accepté:   'bg-emerald-50 text-emerald-700',
  Refusé:    'bg-red-50 text-red-600',
  Livré:     'bg-teal-50 text-teal-700',
};

const FACTURE_STATUSES: InvoiceStatus[] = ['Générée', 'Envoyée', 'Payée', 'Annulée'];
const DEVIS_STATUSES:   InvoiceStatus[] = ['Envoyé', 'Accepté', 'Refusé'];
const BL_STATUSES:      InvoiceStatus[] = ['Générée', 'Livré', 'Annulée'];
const ALL_STATUSES:     InvoiceStatus[] = [...FACTURE_STATUSES, ...DEVIS_STATUSES, 'Livré'];

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onNew:      (docType: DocumentType) => Promise<void>;
  onEdit:     (id: string) => void;
  onView:     (id: string) => void;
  onPrint:    (id: string) => void;
  onCreateBL: (inv: Invoice) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoiceList({ onNew, onEdit, onView, onPrint, onCreateBL }: Props) {
  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [newLoading,   setNewLoading]   = useState(false);
  const [newError,     setNewError]     = useState('');
  const [fetchError,   setFetchError]   = useState('');
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [yearFilter,   setYearFilter]   = useState('');
  const [typeFilter,   setTypeFilter]   = useState<DocumentType | ''>('');
  const [trimFilter,   setTrimFilter]   = useState<'' | 'T1' | 'T2' | 'T3' | 'T4'>('');
  const [showExport,   setShowExport]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      setInvoices(await getFactures());
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const years = useMemo(() => {
    const set = new Set(invoices.map(inv => inv.date.slice(0, 4)));
    return Array.from(set).sort().reverse();
  }, [invoices]);

  function getTrim(dateStr: string): string {
    const m = parseInt(dateStr.slice(5, 7), 10);
    if (m <= 3) return 'T1';
    if (m <= 6) return 'T2';
    if (m <= 9) return 'T3';
    return 'T4';
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(inv => {
      if (statusFilter && inv.status !== statusFilter) return false;
      if (typeFilter   && inv.documentType !== typeFilter) return false;
      if (yearFilter   && !inv.date.startsWith(yearFilter)) return false;
      if (trimFilter   && getTrim(inv.date) !== trimFilter) return false;
      if (q && !inv.client.toLowerCase().includes(q) && !inv.number.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [invoices, search, statusFilter, typeFilter, yearFilter, trimFilter]);

  const metrics = useMemo(() => {
    const factures = invoices.filter(i => i.documentType === 'facture');
    const active   = factures.filter(i => i.status !== 'Annulée');
    return {
      total:     factures.length,
      totalTTC:  active.reduce((s, i) => s + i.totalTTC, 0),
      payees:    factures.filter(i => i.status === 'Payée').length,
      enAttente: factures.filter(i => i.status === 'Générée' || i.status === 'Envoyée').length,
    };
  }, [invoices]);

  const [blCreating, setBlCreating] = useState(false);

  async function handleCreateBL(inv: Invoice) {
    setBlCreating(true);
    setNewError('');
    try {
      const exists = await blExistsForSource(inv.id);
      if (exists) {
        const ok = window.confirm('Un bon de livraison existe déjà pour ce document. Créer un autre quand même ?');
        if (!ok) { setBlCreating(false); return; }
      }
      await onCreateBL(inv);
    } catch (e: unknown) {
      setNewError(e instanceof Error ? e.message : 'Erreur lors de la création du BL');
    } finally {
      setBlCreating(false);
    }
  }

  async function handleNew(docType: DocumentType) {
    setNewLoading(true);
    setNewError('');
    try {
      await onNew(docType);
    } catch (e: unknown) {
      setNewError(e instanceof Error ? e.message : 'Erreur lors de la création');
    } finally {
      setNewLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Supprimer cette facture définitivement ?')) return;
    await deleteFacture(id);
    setInvoices(prev => prev.filter(i => i.id !== id));
  }

  async function handleStatusChange(id: string, status: InvoiceStatus) {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    try {
      await updateStatus(id, status);

      if (status === 'Accepté') {
        const devis = invoices.find(i => i.id === id);
        if (devis?.documentType === 'devis') {
          const alreadyExists = await factureExistsForDevis(devis.id);
          if (!alreadyExists) {
            const facNum = await nextInvoiceNumber();
            await upsertFacture({
              id:           crypto.randomUUID(),
              number:       facNum,
              client:       devis.client,
              date:         devis.date,
              items:        devis.items,
              tvaRate:      devis.tvaRate,
              totalHT:      devis.totalHT,
              tvaAmount:    devis.tvaAmount,
              totalTTC:     devis.totalTTC,
              status:       'Générée',
              documentType: 'facture',
              originDevisId: devis.id,
              createdAt:    new Date().toISOString(),
            });
            load();
          }
        }
      }
    } catch {
      load();
    }
  }

  return (
    <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-4 max-w-5xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Factures &amp; Devis</h1>
        <div className="flex items-center gap-2">
          <NewDocMenu onNew={handleNew} loading={newLoading} />
          <button
            onClick={() => setShowExport(true)}
            title="Exporter"
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 bg-white rounded-lg"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {newError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          {newError}
        </div>
      )}

        {/* ── Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            icon={<Receipt className="w-5 h-5 text-slate-500" />}
            label="Total factures"
            value={String(metrics.total)}
          />
          <MetricCard
            icon={<TrendingUp className="w-5 h-5 text-violet-500" />}
            label="Chiffre d'affaires"
            value={`${fmt(metrics.totalTTC)} DH`}
            valueClass="text-violet-700"
          />
          <MetricCard
            icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
            label="Payées"
            value={String(metrics.payees)}
            valueClass="text-emerald-700"
          />
          <MetricCard
            icon={<Clock className="w-5 h-5 text-amber-500" />}
            label="En attente"
            value={String(metrics.enAttente)}
            valueClass="text-amber-700"
          />
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Client ou n° facture…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as DocumentType | '')}
              className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Tous les types</option>
              <option value="facture">Facture</option>
              <option value="devis">Devis</option>
              <option value="bon_livraison">Bon de Livraison</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as InvoiceStatus | '')}
              className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Tous les statuts</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Toutes les années</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={trimFilter}
              onChange={e => setTrimFilter(e.target.value as '' | 'T1' | 'T2' | 'T3' | 'T4')}
              className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Tous les trimestres</option>
              <option value="T1">T1 (Jan–Mar)</option>
              <option value="T2">T2 (Avr–Juin)</option>
              <option value="T3">T3 (Jul–Sep)</option>
              <option value="T4">T4 (Oct–Déc)</option>
            </select>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-16 text-red-500 text-sm gap-2">
              <span>{fetchError}</span>
              <button onClick={load} className="text-xs underline text-slate-500">Réessayer</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <FileText className="w-10 h-10 mb-3 opacity-25" />
              <p className="text-sm font-medium">Aucune facture trouvée</p>
              {invoices.length === 0 && (
                <p className="text-xs mt-1">Créez votre première facture pour commencer</p>
              )}
            </div>
          ) : (
            <>
              {/* ── Desktop table — hidden on mobile ── */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 w-44">N° Facture</th>
                      <th className="text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Client</th>
                      <th className="text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-28">Date</th>
                      <th className="text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-36">Total TTC</th>
                      <th className="text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-36">Statut</th>
                      <th className="text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 w-36">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(inv => {
                      const clientLine = inv.client.split('\n')[0].trim();
                      return (
                        <tr key={inv.id} className={`hover:bg-slate-50/60 transition-colors${inv.documentType === 'bon_livraison' ? ' border-l-4 border-teal-400' : ''}`}>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-sm font-semibold text-slate-800 tracking-wide">{inv.number}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            {clientLine
                              ? <span className="text-sm text-slate-800">{clientLine}</span>
                              : <span className="text-sm text-slate-400 italic">—</span>
                            }
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-sm text-slate-600">{dateFR(inv.date)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="text-sm font-semibold text-slate-800">{fmt(inv.totalTTC)} DH</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={inv.status} documentType={inv.documentType} onChange={s => handleStatusChange(inv.id, s)} />
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-0.5">
                              <Btn title="Voir"            onClick={() => onView(inv.id)}>  <Eye      className="w-4 h-4" /></Btn>
                              <Btn title="Modifier"        onClick={() => onEdit(inv.id)}>  <Edit2    className="w-4 h-4" /></Btn>
                              <Btn title="Télécharger PDF" onClick={() => onPrint(inv.id)}> <Download className="w-4 h-4" /></Btn>
                              {inv.documentType !== 'bon_livraison' && (
                                <Btn title="Créer BL" onClick={() => handleCreateBL(inv)} disabled={blCreating}>
                                  <Truck className="w-4 h-4" />
                                </Btn>
                              )}
                              <Btn title="Supprimer" onClick={() => handleDelete(inv.id)} danger>
                                <Trash2 className="w-4 h-4" />
                              </Btn>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile card list — hidden on sm+ ── */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filtered.map(inv => (
                  <MobileInvoiceCard
                    key={inv.id}
                    inv={inv}
                    onView={() => onView(inv.id)}
                    onEdit={() => onEdit(inv.id)}
                    onPrint={() => onPrint(inv.id)}
                    onDelete={() => handleDelete(inv.id)}
                    onStatusChange={s => handleStatusChange(inv.id, s)}
                    onCreateBL={() => handleCreateBL(inv)}
                    blCreating={blCreating}
                  />
                ))}
              </div>
            </>
          )}
        </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-right">
          {filtered.length} facture{filtered.length > 1 ? 's' : ''}
          {filtered.length !== invoices.length ? ` sur ${invoices.length}` : ''}
        </p>
      )}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  );
}

// ── Mobile invoice card ───────────────────────────────────────────────────────

function MobileInvoiceCard({
  inv, onView, onEdit, onPrint, onDelete, onStatusChange, onCreateBL, blCreating,
}: {
  inv: Invoice;
  onView: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onDelete: () => void;
  onStatusChange: (s: InvoiceStatus) => void;
  onCreateBL: () => void;
  blCreating: boolean;
}) {
  const clientLine = inv.client.split('\n')[0].trim();
  return (
    <div className={`px-4 py-4 flex flex-col gap-3${inv.documentType === 'bon_livraison' ? ' border-l-4 border-teal-400' : ''}`}>
      {/* Row 1: number + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-sm font-bold text-slate-800 tracking-wide block">{inv.number}</span>
          {clientLine
            ? <p className="text-sm text-slate-600 mt-0.5 truncate">{clientLine}</p>
            : <p className="text-sm text-slate-400 italic mt-0.5">Sans client</p>
          }
        </div>
        <StatusBadge status={inv.status} documentType={inv.documentType} onChange={onStatusChange} />
      </div>
      {/* Row 2: date + amount + actions */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">{dateFR(inv.date)}</p>
          {inv.documentType !== 'bon_livraison' && (
            <p className="text-base font-bold text-slate-800 mt-0.5">{fmt(inv.totalTTC)} DH</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Btn title="Voir"            onClick={onView}>  <Eye      className="w-5 h-5" /></Btn>
          <Btn title="Modifier"        onClick={onEdit}>  <Edit2    className="w-5 h-5" /></Btn>
          <Btn title="Télécharger PDF" onClick={onPrint}> <Download className="w-5 h-5" /></Btn>
          {inv.documentType !== 'bon_livraison' && (
            <Btn title="Créer BL" onClick={onCreateBL} disabled={blCreating}>
              <Truck className="w-5 h-5" />
            </Btn>
          )}
          <Btn title="Supprimer" onClick={onDelete} danger><Trash2 className="w-5 h-5" /></Btn>
        </div>
      </div>
    </div>
  );
}

// ── MetricCard ────────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4 flex items-center gap-3">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        <p className={`text-base font-bold tracking-tight mt-0.5 truncate ${valueClass ?? 'text-slate-800'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ── StatusBadge (portal-based, safe inside overflow:hidden) ──────────────────

function StatusBadge({
  status, documentType, onChange,
}: {
  status: InvoiceStatus;
  documentType: DocumentType;
  onChange: (s: InvoiceStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // Ensure dropdown doesn't go off right edge
      const left = Math.min(r.left, window.innerWidth - 160);
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(o => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium select-none whitespace-nowrap transition-opacity hover:opacity-80 ${STATUS_STYLES[status]}`}
      >
        {status}
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 min-w-[150px]"
            style={{ top: pos.top, left: pos.left }}
          >
            {(documentType === 'devis' ? DEVIS_STATUSES : documentType === 'bon_livraison' ? BL_STATUSES : FACTURE_STATUSES).map(s => (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors flex items-center gap-2 min-h-[44px] sm:min-h-0 sm:py-1.5 ${s === status ? 'opacity-40 cursor-default pointer-events-none' : ''}`}
              >
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[s]}`}>
                  {s}
                </span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

function Btn({
  title, onClick, danger, disabled, children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-2 sm:p-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:pointer-events-none ${
        danger
          ? 'text-slate-300 hover:text-red-500 hover:bg-red-50'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

// ── New document dropdown ─────────────────────────────────────────────────────

function NewDocMenu({ onNew, loading }: { onNew: (d: DocumentType) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 min-h-[44px] bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
      >
        {loading
          ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : <Plus className="w-4 h-4" />
        }
        <span className="hidden sm:inline">Nouveau</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 min-w-[150px]">
          <button
            onClick={() => { onNew('facture'); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 sm:py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px] sm:min-h-0"
          >
            Facture
          </button>
          <button
            onClick={() => { onNew('devis'); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 sm:py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px] sm:min-h-0"
          >
            Devis
          </button>
          <button
            onClick={() => { onNew('bon_livraison'); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 sm:py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px] sm:min-h-0"
          >
            Bon de Livraison
          </button>
        </div>
      )}
    </div>
  );
}
