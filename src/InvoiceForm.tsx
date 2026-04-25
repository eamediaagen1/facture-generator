import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, Printer, FileText, ArrowLeft, Save, LogOut } from 'lucide-react';
import { numberToFrenchWords } from './numberToWords';
import type { Invoice, InvoiceStatus, LineItem, DocumentType } from './types';
import { getFacture, upsertFacture } from './services/factureService';
import { signOut } from './services/authService';

// Drop src/assets/logo.png to enable logo — falls back to company name text
const logoFiles = import.meta.glob<string>('./assets/logo.png', { eager: true, query: '?url', import: 'default' });
const LOGO_URL: string | null = logoFiles['./assets/logo.png'] ?? null;

const COMPANY = {
  name:    'AMOR AMENAGEMENT',
  address: 'Benjdia - CASABLANCA',
  gsm:     '06 61 46 55 55',
  ice:     '003766077000051',
  rc:      '688445',
  if:      '68308643',
  patente: '34214765',
};

const MIN_TABLE_ROWS = 4;
const FACTURE_STATUSES: InvoiceStatus[] = ['Générée', 'Envoyée', 'Payée', 'Annulée'];
const DEVIS_STATUSES:   InvoiceStatus[] = ['Envoyé', 'Accepté', 'Refusé'];

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  Brouillon: 'bg-slate-100 text-slate-500',
  Générée:   'bg-violet-50 text-violet-700',
  Envoyée:   'bg-blue-50 text-blue-700',
  Payée:     'bg-emerald-50 text-emerald-700',
  Annulée:   'bg-red-50 text-red-600',
  Envoyé:    'bg-blue-50 text-blue-700',
  Accepté:   'bg-emerald-50 text-emerald-700',
  Refusé:    'bg-red-50 text-red-600',
};

function uid()   { return crypto.randomUUID(); }
function today() { return new Date().toISOString().split('T')[0]; }
function fmtNum(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

interface Props {
  mode: 'new' | 'edit' | 'view';
  invoiceNumber?: string;
  invoiceId?: string;
  docType?: DocumentType;
  printOnLoad?: boolean;
  onBack: () => void;
  onSaved: () => void;
}

export default function InvoiceForm({
  mode, invoiceNumber: newNumber, invoiceId, docType: docTypeProp, printOnLoad, onBack, onSaved,
}: Props) {
  const readOnly    = mode === 'view';
  const internalId  = useRef<string>(invoiceId ?? uid());

  const [fetchLoading, setFetchLoading] = useState(mode !== 'new');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  const [invoiceNum, setInvoiceNum] = useState(newNumber ?? '');
  const [date,       setDate]       = useState(today());
  const [client,     setClient]     = useState('');
  const [docType,    setDocType]    = useState<DocumentType>(docTypeProp ?? 'facture');
  const [status,     setStatus]     = useState<InvoiceStatus>('Générée');
  const [items,      setItems]      = useState<LineItem[]>([
    { id: uid(), designation: '', quantity: 1, unitPrice: 0 },
  ]);
  const tvaRate = 20;

  useEffect(() => {
    if (mode === 'new') return;
    setFetchLoading(true);
    getFacture(internalId.current).then(inv => {
      if (inv) {
        setInvoiceNum(inv.number);
        setDate(inv.date);
        setClient(inv.client);
        setStatus(inv.status);
        setDocType(inv.documentType ?? 'facture');
        setItems(inv.items);
      }
      setFetchLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!printOnLoad || fetchLoading) return;
    const t = setTimeout(() => { setPrintTitle(); window.print(); }, 500);
    return () => clearTimeout(t);
  }, [printOnLoad, fetchLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPrintTitle() {
    document.title = `AMOR AMENAGEMENT - ${invoiceNum}`;
    window.addEventListener('afterprint', () => { document.title = 'Facture'; }, { once: true });
  }

  const addItem = useCallback(() => {
    setItems(p => [...p, { id: uid(), designation: '', quantity: 1, unitPrice: 0 }]);
  }, []);
  const removeItem = useCallback((id: string) => {
    setItems(p => p.length <= 1 ? p : p.filter(i => i.id !== id));
  }, []);
  const updateItem = useCallback((id: string, field: keyof LineItem, value: string | number) => {
    setItems(p => p.map(i => i.id === id ? { ...i, [field]: value } : i));
  }, []);

  const totalHT      = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const tvaAmount    = totalHT * (tvaRate / 100);
  const totalTTC     = totalHT + tvaAmount;
  const totalInWords = numberToFrenchWords(totalTTC);
  const placeholders = Math.max(0, MIN_TABLE_ROWS - items.length);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const invoice: Invoice = {
        id:        internalId.current,
        number:    invoiceNum,
        client, date, items, tvaRate,
        totalHT, tvaAmount, totalTTC,
        status:       mode === 'new' ? (docType === 'devis' ? 'Envoyé' : 'Générée') : status,
        documentType: docType,
        createdAt: new Date().toISOString(),
      };
      await upsertFacture(invoice);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() { setPrintTitle(); window.print(); }

  if (fetchLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  const titleLabel =
    mode === 'new'  ? (docType === 'devis' ? 'Nouveau Devis'  : 'Nouvelle Facture') :
    mode === 'edit' ? (docType === 'devis' ? 'Modifier Devis'  : 'Modifier Facture') :
                      (docType === 'devis' ? 'Aperçu Devis'    : 'Aperçu Facture');

  const savedStatuses = docType === 'devis' ? DEVIS_STATUSES : FACTURE_STATUSES;

  // Status control shared between mobile and desktop toolbars
  const statusControl = (
    <>
      {mode === 'new' && (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES.Brouillon}`}>
          Brouillon
        </span>
      )}
      {mode === 'edit' && (
        <select
          value={status}
          onChange={e => setStatus(e.target.value as InvoiceStatus)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {savedStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {mode === 'view' && (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
          {status}
        </span>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col print:bg-white print:min-h-0">

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">

        {/* Mobile toolbar (2 rows) */}
        <div className="sm:hidden px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </button>
            <div className="flex items-center gap-2">
              {statusControl}
              <button
                onClick={() => signOut()}
                className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            {!readOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
              >
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Save className="w-4 h-4" />
                }
                Sauvegarder
              </button>
            )}
            <button
              onClick={handlePrint}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-all ${readOnly ? 'flex-1' : ''}`}
            >
              <Printer className="w-4 h-4" />
              {readOnly ? 'Imprimer' : 'PDF'}
            </button>
          </div>
        </div>

        {/* Desktop toolbar (1 row) */}
        <div className="hidden sm:flex max-w-4xl mx-auto px-4 py-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-slate-800 text-sm tracking-wide uppercase">{titleLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusControl}
            {!readOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
              >
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Save className="w-4 h-4" />
                }
                Sauvegarder
              </button>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              <Printer className="w-4 h-4" />
              {readOnly ? 'Imprimer' : 'Aperçu PDF'}
            </button>
            <button
              onClick={() => signOut()}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 pb-2 max-w-4xl mx-auto">
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          </div>
        )}
      </div>

      {/* ── Invoice card ── */}
      {/*
        Mobile:  no margin, no rounding — full-width edge-to-edge card
        Desktop: centered, rounded, with vertical margin
        Print:   inv-spacing / inv-border CSS overrides handle layout
      */}
      <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto sm:my-6 inv-spacing print:flex-none">
        <div className="bg-white sm:shadow-lg inv-shadow sm:rounded-xl sm:border sm:border-slate-200 inv-border overflow-hidden flex flex-col flex-1 invoice-container">

          {/* ── Header ── */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 sm:py-6 print:py-3">
            <div className="flex flex-col sm:flex-row print:flex-row sm:items-start print:items-center sm:justify-between print:justify-between gap-3">
              <div>
                {LOGO_URL
                  ? <img src={LOGO_URL} alt={COMPANY.name} className="max-w-[250px] max-h-[180px] object-contain print:max-h-20" />
                  : <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-wide whitespace-nowrap">{COMPANY.name}</h1>
                }
              </div>
              <div className="sm:text-right print:text-right">
                <div className="inline-block bg-slate-800 rounded-lg px-3 sm:px-4 py-2">
                  <p className="text-xs text-slate-300 uppercase tracking-wider">{docType === 'devis' ? 'Devis N°' : 'Facture N°'}</p>
                  <p className="text-white font-bold text-base sm:text-lg tracking-wide">{invoiceNum}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Date & Client ── */}
          <div className="px-4 sm:px-8 py-4 sm:py-5 border-b border-slate-200 print:py-2">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-8">
              <div className="sm:flex-1">
                <label className="block text-[14px] font-bold text-slate-700 uppercase tracking-[0.04em] mb-1.5">Date</label>
                {readOnly ? (
                  <p className="text-sm text-slate-800 py-2">{dateFR(date)}</p>
                ) : (
                  <>
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full px-3 py-2.5 sm:py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all inv-field"
                    />
                    <p className="inv-date text-sm text-slate-800 mt-1">{dateFR(date)}</p>
                  </>
                )}
              </div>
              <div className="sm:flex-1">
                <label className="block text-[14px] font-bold text-slate-700 uppercase tracking-[0.04em] mb-1.5">Client</label>
                {readOnly ? (
                  <p className="text-sm text-slate-800 py-2 whitespace-pre-line">{client || '—'}</p>
                ) : (
                  <textarea
                    value={client}
                    onChange={e => setClient(e.target.value)}
                    placeholder={'Nom du client\nAdresse\nICE'}
                    rows={3}
                    className="w-full px-3 py-2.5 sm:py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all resize-none inv-field"
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Line Items ── */}
          <div className="px-4 sm:px-8 py-4 sm:py-5 border-b border-slate-200 print:py-2">

            {/* Desktop table — hidden on mobile screens, always visible on print */}
            <div className="hidden sm:block print:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left   text-[12px] font-semibold text-slate-700 uppercase tracking-[0.04em] px-4 py-3 border-b-2 border-slate-300">Designation</th>
                    <th className="text-center text-[12px] font-semibold text-slate-700 uppercase tracking-[0.04em] px-4 py-3 border-b-2 border-slate-300 w-24">Qte</th>
                    <th className="text-right  text-[12px] font-semibold text-slate-700 uppercase tracking-[0.04em] px-4 py-3 border-b-2 border-slate-300 w-32">P.U (DH)</th>
                    <th className="text-right  text-[12px] font-semibold text-slate-700 uppercase tracking-[0.04em] px-4 py-3 border-b-2 border-slate-300 w-36">P.T.H.T (DH)</th>
                    {!readOnly && <th className="w-10 border-b-2 border-slate-300 no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className={!readOnly ? 'group hover:bg-slate-50/50 transition-colors' : ''}>
                      <td className="px-4 py-2 border-b border-slate-100">
                        {readOnly
                          ? <span className="text-sm text-slate-800 px-2 block">{item.designation}</span>
                          : <input type="text" value={item.designation}
                              onChange={e => updateItem(item.id, 'designation', e.target.value)}
                              placeholder="Description..."
                              className="w-full px-2 py-1.5 text-sm text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors" />
                        }
                      </td>
                      <td className="px-4 py-2 border-b border-slate-100 text-center">
                        {readOnly
                          ? <span className="text-sm text-slate-800">{item.quantity}</span>
                          : <input type="number" min="0" step="1" value={item.quantity || ''}
                              onChange={e => updateItem(item.id, 'quantity', Math.max(0, Number(e.target.value)))}
                              className="w-full px-2 py-1.5 text-sm text-center text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors" />
                        }
                      </td>
                      <td className="px-4 py-2 border-b border-slate-100">
                        {readOnly
                          ? <span className="text-sm text-slate-800 block text-right">{fmtNum(item.unitPrice)}</span>
                          : <input type="number" min="0" step="0.01" value={item.unitPrice || ''}
                              onChange={e => updateItem(item.id, 'unitPrice', Math.max(0, Number(e.target.value)))}
                              className="w-full px-2 py-1.5 text-sm text-right text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors" />
                        }
                      </td>
                      <td className="px-4 py-2 border-b border-slate-100 text-right">
                        <span className="text-sm font-medium text-slate-700">{fmtNum(item.quantity * item.unitPrice)}</span>
                      </td>
                      {!readOnly && (
                        <td className="px-1 py-2 border-b border-slate-100 no-print">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {Array.from({ length: placeholders }).map((_, i) => (
                    <tr key={`ph-${i}`}>
                      <td className="px-4 py-3 border-b border-slate-100 h-10">&nbsp;</td>
                      <td className="px-4 py-3 border-b border-slate-100">&nbsp;</td>
                      <td className="px-4 py-3 border-b border-slate-100">&nbsp;</td>
                      <td className="px-4 py-3 border-b border-slate-100">&nbsp;</td>
                      {!readOnly && <td className="px-1 py-3 border-b border-slate-100 no-print" />}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile item cards — hidden on sm+ and never printed */}
            <div className="sm:hidden no-print space-y-3">
              {items.map(item => (
                <MobileItemCard
                  key={item.id}
                  item={item}
                  readOnly={readOnly}
                  canRemove={items.length > 1}
                  onUpdate={(field, value) => updateItem(item.id, field, value)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>

            {!readOnly && (
              <div className="mt-3 no-print">
                <button
                  onClick={addItem}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 sm:px-3 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm sm:text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all w-full sm:w-auto justify-center sm:justify-start"
                >
                  <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  Ajouter une ligne
                </button>
              </div>
            )}
          </div>

          {/* ── Totals ── */}
          <div className="px-4 sm:px-8 py-4 sm:py-5 bg-slate-50/50 border-t border-slate-200 print:py-2">
            <div className="flex justify-end">
              {/* Full-width on mobile, fixed 288px on desktop */}
              <div className="w-full sm:w-72">
                <div className="flex justify-between items-center py-2 print:py-1 border-b border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-[0.04em]">TOTAL H.T.</span>
                  <span className="text-sm font-semibold text-slate-800">{fmtNum(totalHT)} DH</span>
                </div>
                <div className="flex justify-between items-center py-2 print:py-1 border-b border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-[0.04em]">TVA ({tvaRate}%)</span>
                  <span className="text-sm font-semibold text-slate-800">{fmtNum(tvaAmount)} DH</span>
                </div>
                <div className="flex justify-between items-center py-2.5 print:py-1.5 bg-slate-800 -mx-3 px-3 rounded-lg mt-1 print:mt-0.5">
                  <span className="text-sm font-bold text-white uppercase tracking-wide">Total T.T.C.</span>
                  <span className="text-lg font-bold text-white">{fmtNum(totalTTC)} DH</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Amount in words ── */}
          <div className="px-4 sm:px-8 py-4 print:py-2 border-t border-slate-200">
            <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] mb-1.5 print:mb-1">
              Arreter la presente facture a la somme de :
            </p>
            <p className="text-sm text-slate-800 font-medium bg-slate-50 px-4 py-2.5 print:py-1.5 rounded-lg border border-slate-200 italic">
              {totalInWords}
            </p>
          </div>

          <div className="flex-1" />

          {/* ── Footer ── */}
          <div className="border-t border-slate-500 px-4 sm:px-8 py-3 print:py-2 invoice-footer">
            <div className="flex justify-center items-baseline gap-4 sm:gap-8 mb-1 flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.05em]">Adresse</span>
                <span className="text-[11px] text-slate-700">{COMPANY.address}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.05em]">GSM</span>
                <span className="text-[11px] text-slate-700">{COMPANY.gsm}</span>
              </div>
            </div>
            <div className="flex justify-center items-baseline gap-3 sm:gap-6 flex-wrap">
              {([['ICE', COMPANY.ice], ['RC', COMPANY.rc], ['IF', COMPANY.if], ['Patente', COMPANY.patente]] as [string,string][]).map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-1">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.05em]">{label}</span>
                  <span className="text-[10px] sm:text-[11px] text-slate-700">{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Mobile item card ──────────────────────────────────────────────────────────
// Shown on small screens instead of the desktop table. Never printed.

function MobileItemCard({
  item, readOnly, canRemove, onUpdate, onRemove,
}: {
  item: LineItem;
  readOnly: boolean;
  canRemove: boolean;
  onUpdate: (field: keyof LineItem, value: string | number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
      {/* Designation */}
      <div>
        <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] block mb-1.5">
          Désignation
        </label>
        {readOnly ? (
          <p className="text-sm text-slate-800">{item.designation || '—'}</p>
        ) : (
          <input
            type="text"
            value={item.designation}
            onChange={e => onUpdate('designation', e.target.value)}
            placeholder="Description du produit ou service..."
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-slate-300 transition-colors"
          />
        )}
      </div>

      {/* QTE / P.U / P.T.H.T */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] block mb-1.5">QTE</label>
          {readOnly ? (
            <p className="text-sm font-medium text-slate-800">{item.quantity}</p>
          ) : (
            <input
              type="number" min="0" step="1"
              value={item.quantity || ''}
              onChange={e => onUpdate('quantity', Math.max(0, Number(e.target.value)))}
              className="w-full px-2 py-2.5 text-sm text-center border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            />
          )}
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] block mb-1.5">P.U</label>
          {readOnly ? (
            <p className="text-sm font-medium text-slate-800">{fmtNum(item.unitPrice)}</p>
          ) : (
            <input
              type="number" min="0" step="0.01"
              value={item.unitPrice || ''}
              onChange={e => onUpdate('unitPrice', Math.max(0, Number(e.target.value)))}
              className="w-full px-2 py-2.5 text-sm text-right border border-slate-200 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            />
          )}
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-[0.04em] block mb-1.5">P.T.H.T</label>
          <p className="text-sm font-semibold text-slate-800 pt-2.5">{fmtNum(item.quantity * item.unitPrice)}</p>
        </div>
      </div>

      {!readOnly && canRemove && (
        <button
          onClick={onRemove}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 py-1 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Supprimer cette ligne
        </button>
      )}
    </div>
  );
}
