import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, Printer, FileText, ArrowLeft, Save, LogOut } from 'lucide-react';
import { numberToFrenchWords } from './numberToWords';
import type { Invoice, InvoiceStatus, LineItem } from './types';
import { getFacture, upsertFacture } from './services/factureService';
import { signOut } from './services/authService';

const COMPANY = {
  name:    'AMOR AMENAGEMENT',
  slogan:  'Votre partenaire en amenagement et construction',
  address: 'Benjdia - CASABLANCA',
  gsm:     '06 61 46 55 55',
  ice:     '003766077000051',
  rc:      '688445',
  if:      '68308643',
  patente: '34214765',
};

const MIN_TABLE_ROWS = 4;

// Status options available after a facture is saved (Brouillon is UI-only)
const SAVED_STATUSES: InvoiceStatus[] = ['Générée', 'Envoyée', 'Payée', 'Annulée'];

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  Brouillon: 'bg-slate-100 text-slate-500',
  Générée:   'bg-violet-50 text-violet-700',
  Envoyée:   'bg-blue-50 text-blue-700',
  Payée:     'bg-emerald-50 text-emerald-700',
  Annulée:   'bg-red-50 text-red-600',
};

function uid()    { return crypto.randomUUID(); }
function today()  { return new Date().toISOString().split('T')[0]; }
function fmtNum(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

interface Props {
  mode: 'new' | 'edit' | 'view';
  invoiceNumber?: string;   // provided for 'new' mode
  invoiceId?: string;       // provided for 'edit' | 'view' mode
  printOnLoad?: boolean;
  onBack: () => void;
  onSaved: () => void;
}

export default function InvoiceForm({
  mode, invoiceNumber: newNumber, invoiceId, printOnLoad, onBack, onSaved,
}: Props) {
  const readOnly = mode === 'view';

  // Stable client-side id: reuse from props or generate once
  const internalId = useRef<string>(invoiceId ?? uid());

  const [fetchLoading, setFetchLoading] = useState(mode !== 'new');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  // Form fields – seeded with defaults; overwritten when invoice loads
  const [invoiceNum, setInvoiceNum] = useState(newNumber ?? '');
  const [date,       setDate]       = useState(today());
  const [client,     setClient]     = useState('');
  const [status,     setStatus]     = useState<InvoiceStatus>('Générée');
  const [items,      setItems]      = useState<LineItem[]>([
    { id: uid(), designation: '', quantity: 1, unitPrice: 0 },
  ]);
  const tvaRate = 20;

  // Load existing invoice for edit / view
  useEffect(() => {
    if (mode === 'new') return;
    setFetchLoading(true);
    getFacture(internalId.current).then(inv => {
      if (inv) {
        setInvoiceNum(inv.number);
        setDate(inv.date);
        setClient(inv.client);
        setStatus(inv.status);
        setItems(inv.items);
      }
      setFetchLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-print when opened via "Download PDF"
  useEffect(() => {
    if (!printOnLoad || fetchLoading) return;
    const t = setTimeout(() => {
      setPrintTitle();
      window.print();
    }, 500);
    return () => clearTimeout(t);
  }, [printOnLoad, fetchLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPrintTitle() {
    document.title = `AMOR AMENAGEMENT - ${invoiceNum}`;
    window.addEventListener('afterprint', () => {
      document.title = 'Facture';
    }, { once: true });
  }

  // ── Item CRUD ──────────────────────────────────────────────────────────────
  const addItem = useCallback(() => {
    setItems(p => [...p, { id: uid(), designation: '', quantity: 1, unitPrice: 0 }]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(p => p.length <= 1 ? p : p.filter(i => i.id !== id));
  }, []);

  const updateItem = useCallback((id: string, field: keyof LineItem, value: string | number) => {
    setItems(p => p.map(i => i.id === id ? { ...i, [field]: value } : i));
  }, []);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalHT      = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const tvaAmount    = totalHT * (tvaRate / 100);
  const totalTTC     = totalHT + tvaAmount;
  const totalInWords = numberToFrenchWords(totalTTC);
  const placeholders = Math.max(0, MIN_TABLE_ROWS - items.length);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const invoice: Invoice = {
        id:        internalId.current,
        number:    invoiceNum,
        client,
        date,
        items,
        tvaRate,
        totalHT,
        tvaAmount,
        totalTTC,
        // Force 'Générée' on first save; keep chosen status on edits
        status: mode === 'new' ? 'Générée' : status,
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

  function handlePrint() {
    setPrintTitle();
    window.print();
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (fetchLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  const titleLabel =
    mode === 'new'  ? 'Nouvelle Facture' :
    mode === 'edit' ? 'Modifier Facture'  :
                     'Aperçu Facture';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Left */}
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
              <span className="font-semibold text-slate-800 text-sm tracking-wide uppercase">
                {titleLabel}
              </span>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {/* Brouillon badge in new mode */}
            {mode === 'new' && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES.Brouillon}`}>
                Brouillon
              </span>
            )}

            {/* Status selector in edit mode */}
            {mode === 'edit' && (
              <select
                value={status}
                onChange={e => setStatus(e.target.value as InvoiceStatus)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                {SAVED_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}

            {/* Status badge in view mode */}
            {mode === 'view' && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
                {status}
              </span>
            )}

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
              title="Déconnexion"
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="max-w-4xl mx-auto px-4 pb-2">
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          </div>
        )}
      </div>

      {/* ── Invoice card ── */}
      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto my-6 inv-spacing">
        <div className="bg-white shadow-lg inv-shadow rounded-xl border border-slate-200 inv-border overflow-hidden flex flex-col flex-1">

          {/* Header */}
          <div className="bg-slate-800 px-8 py-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-wide">{COMPANY.name}</h1>
                <p className="text-slate-300 text-sm mt-1 italic">{COMPANY.slogan}</p>
              </div>
              <div className="text-right">
                <div className="inline-block bg-white/10 rounded-lg px-4 py-2">
                  <p className="text-xs text-slate-300 uppercase tracking-wider">Facture N°</p>
                  <p className="text-white font-bold text-lg tracking-wide">{invoiceNum}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Date & Client */}
          <div className="px-8 py-5 border-b border-slate-200">
            <div className="flex items-start justify-between gap-8">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Date
                </label>
                {readOnly ? (
                  <p className="text-sm text-slate-800 px-3 py-2">{dateFR(date)}</p>
                ) : (
                  <>
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all inv-field"
                    />
                    <p className="inv-date text-sm text-slate-800 mt-1">{dateFR(date)}</p>
                  </>
                )}
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Client
                </label>
                {readOnly ? (
                  <p className="text-sm text-slate-800 px-3 py-2 whitespace-pre-line">{client || '—'}</p>
                ) : (
                  <textarea
                    value={client}
                    onChange={e => setClient(e.target.value)}
                    placeholder={'Nom du client\nAdresse\nVille'}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all resize-none inv-field"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="px-8 py-5">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left   text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-3 border-b-2 border-slate-300">Designation</th>
                  <th className="text-center text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-3 border-b-2 border-slate-300 w-24">Qte</th>
                  <th className="text-right  text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-3 border-b-2 border-slate-300 w-32">P.U (DH)</th>
                  <th className="text-right  text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-3 border-b-2 border-slate-300 w-36">P.T.H.T (DH)</th>
                  {!readOnly && <th className="w-10 border-b-2 border-slate-300 no-print" />}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className={!readOnly ? 'group hover:bg-slate-50/50 transition-colors' : ''}>
                    <td className="px-4 py-2 border-b border-slate-100">
                      {readOnly ? (
                        <span className="text-sm text-slate-800 px-2 block">{item.designation}</span>
                      ) : (
                        <input
                          type="text"
                          value={item.designation}
                          onChange={e => updateItem(item.id, 'designation', e.target.value)}
                          placeholder="Description..."
                          className="w-full px-2 py-1.5 text-sm text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors"
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 text-center">
                      {readOnly ? (
                        <span className="text-sm text-slate-800">{item.quantity}</span>
                      ) : (
                        <input
                          type="number" min="0" step="1"
                          value={item.quantity || ''}
                          onChange={e => updateItem(item.id, 'quantity', Math.max(0, Number(e.target.value)))}
                          className="w-full px-2 py-1.5 text-sm text-center text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors"
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100">
                      {readOnly ? (
                        <span className="text-sm text-slate-800 block text-right">{fmtNum(item.unitPrice)}</span>
                      ) : (
                        <input
                          type="number" min="0" step="0.01"
                          value={item.unitPrice || ''}
                          onChange={e => updateItem(item.id, 'unitPrice', Math.max(0, Number(e.target.value)))}
                          className="w-full px-2 py-1.5 text-sm text-right text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded transition-colors"
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 text-right">
                      <span className="text-sm font-medium text-slate-700">
                        {fmtNum(item.quantity * item.unitPrice)}
                      </span>
                    </td>
                    {!readOnly && (
                      <td className="px-1 py-2 border-b border-slate-100 no-print">
                        {items.length > 1 && (
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}

                {/* Empty filler rows */}
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

            {!readOnly && (
              <div className="mt-3 no-print">
                <button
                  onClick={addItem}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter ligne
                </button>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="px-8 py-5 bg-slate-50/50">
            <div className="flex justify-end">
              <div className="w-72">
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-sm text-slate-600">TOTAL H.T.</span>
                  <span className="text-sm font-semibold text-slate-800">{fmtNum(totalHT)} DH</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-sm text-slate-600">TVA ({tvaRate}%)</span>
                  <span className="text-sm font-semibold text-slate-800">{fmtNum(tvaAmount)} DH</span>
                </div>
                <div className="flex justify-between items-center py-2.5 bg-slate-800 -mx-3 px-3 rounded-lg mt-1">
                  <span className="text-sm font-bold text-white uppercase tracking-wide">Total T.T.C.</span>
                  <span className="text-lg font-bold text-white">{fmtNum(totalTTC)} DH</span>
                </div>
              </div>
            </div>
          </div>

          {/* Amount in words */}
          <div className="px-8 py-4 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Arreter la presente facture a la somme de :
            </p>
            <p className="text-sm text-slate-800 font-medium bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-200 italic">
              {totalInWords}
            </p>
          </div>

          {/* Spacer pushes footer to bottom */}
          <div className="flex-1" />

          {/* Footer */}
          <div className="bg-slate-800 px-8 py-3">
            <div className="flex justify-center items-baseline gap-8 mb-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[9px] font-light text-slate-400 uppercase tracking-wider">Adresse</span>
                <span className="text-[11px] text-slate-200">{COMPANY.address}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[9px] font-light text-slate-400 uppercase tracking-wider">GSM</span>
                <span className="text-[11px] text-slate-200">{COMPANY.gsm}</span>
              </div>
            </div>
            <div className="flex justify-center items-baseline gap-6">
              {([['ICE', COMPANY.ice], ['RC', COMPANY.rc], ['IF', COMPANY.if], ['Patente', COMPANY.patente]] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <span className="text-[9px] font-light text-slate-400 uppercase tracking-wider">{label}</span>
                  <span className="text-[11px] text-slate-200">{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
