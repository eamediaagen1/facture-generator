import { useState, useRef, useCallback } from 'react';
import { X, Upload, AlertTriangle, CheckCircle, SkipForward } from 'lucide-react';
import type { Achat, PaymentMethod } from './types';
import { parseImportFile, markDuplicates, type ImportRow } from './services/importService';
import { bulkInsertAchats } from './services/achatService';

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

const PM_STYLES: Record<PaymentMethod, string> = {
  'Virement': 'bg-blue-50 text-blue-700',
  'Espèce':   'bg-emerald-50 text-emerald-700',
  'Chèque':   'bg-violet-50 text-violet-700',
  'Carte':    'bg-pink-50 text-pink-700',
};

type Stage = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';

interface Props {
  existingAchats: Achat[];
  onClose: () => void;
  onImported: () => void;
}

export default function AchatImportModal({ existingAchats, onClose, onImported }: Props) {
  const [stage,    setStage]    = useState<Stage>('idle');
  const [rows,     setRows]     = useState<ImportRow[]>([]);
  const [parseErr, setParseErr] = useState('');
  const [saveErr,  setSaveErr]  = useState('');
  const [imported, setImported] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const toImport = rows.filter(r => r._errors.length === 0 && !r._isDuplicate);
  const invalid  = rows.filter(r => r._errors.length > 0);
  const dupes    = rows.filter(r => r._errors.length === 0 && r._isDuplicate);

  const handleFile = useCallback(async (file: File) => {
    setParseErr('');
    setStage('parsing');
    try {
      const parsed  = await parseImportFile(file);
      const marked  = markDuplicates(parsed, existingAchats);
      setRows(marked);
      setStage('preview');
    } catch (e: unknown) {
      setParseErr(e instanceof Error ? e.message : 'Erreur de lecture du fichier');
      setStage('idle');
    }
  }, [existingAchats]);

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function confirmImport() {
    setSaveErr('');
    setStage('importing');
    try {
      const count = await bulkInsertAchats(toImport.map(r => ({
        supplier_name:           r.supplier_name,
        invoice_date:            r.invoice_date,
        supplier_invoice_number: r.supplier_invoice_number,
        category:                r.category,
        description:             r.description,
        amount_ht:               r.amount_ht,
        tva:                     r.tva,
        amount_ttc:              r.amount_ttc,
        payment_status:          r.payment_status,
        payment_method:          r.payment_method,
        notes:                   r.notes,
      })));
      setImported(count);
      setStage('done');
      onImported();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde');
      setStage('preview');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-semibold text-slate-800">Importer des achats</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Idle ── */}
          {(stage === 'idle' || stage === 'parsing') && (
            <div className="p-6 space-y-4">
              {parseErr && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{parseErr}</p>
              )}
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="flex flex-col items-center gap-3 p-10 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 cursor-pointer hover:border-slate-400 hover:bg-slate-100 transition-all"
              >
                {stage === 'parsing'
                  ? <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
                  : <Upload className="w-8 h-8 text-slate-400" />
                }
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700">
                    {stage === 'parsing' ? 'Lecture du fichier…' : 'Glisser-déposer ou cliquer pour choisir'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Formats acceptés : .xlsx, .csv</p>
                </div>
                <input ref={inputRef} type="file" accept=".xlsx,.csv" className="sr-only" onChange={onFileInput} />
              </div>

              <div className="bg-slate-50 rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Colonnes attendues</p>
                <p className="text-xs text-slate-500 font-mono leading-relaxed">
                  fournisseur · date_facture · numero_facture_fournisseur · categorie · description · montant_ht · tva · montant_ttc · statut_paiement · payment_method · notes
                </p>
              </div>
            </div>
          )}

          {/* ── Preview ── */}
          {stage === 'preview' && (
            <div className="p-6 space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  {toImport.length} à importer
                </span>
                {dupes.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-sm font-medium">
                    <SkipForward className="w-4 h-4" />
                    {dupes.length} doublon{dupes.length > 1 ? 's' : ''} ignoré{dupes.length > 1 ? 's' : ''}
                  </span>
                )}
                {invalid.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    {invalid.length} invalide{invalid.length > 1 ? 's' : ''} ignoré{invalid.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {saveErr && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{saveErr}</p>
              )}

              {/* Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 w-8">#</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Fournisseur</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 w-28">Date</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 w-36">N° Facture</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 w-32">TTC (DH)</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 w-28">Mode</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 w-28">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(row => {
                        const isInvalid = row._errors.length > 0;
                        const isDupe    = !isInvalid && row._isDuplicate;
                        const rowCls    = isInvalid ? 'bg-red-50/60' : isDupe ? 'bg-slate-50/80' : '';
                        const textCls   = isInvalid || isDupe ? 'text-slate-400' : 'text-slate-700';
                        return (
                          <tr key={row._idx} className={rowCls}>
                            <td className="px-4 py-2.5">
                              {isInvalid
                                ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" title={row._errors.join(', ')} />
                                : isDupe
                                ? <SkipForward className="w-3.5 h-3.5 text-slate-300" title="Doublon" />
                                : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                              }
                            </td>
                            <td className={`px-4 py-2.5 font-medium ${textCls}`}>
                              {row.supplier_name || <span className="italic text-red-400">manquant</span>}
                              {isInvalid && (
                                <p className="text-xs text-red-400 font-normal">{row._errors.join(' · ')}</p>
                              )}
                            </td>
                            <td className={`px-4 py-2.5 ${textCls}`}>{dateFR(row.invoice_date)}</td>
                            <td className={`px-4 py-2.5 font-mono ${textCls}`}>{row.supplier_invoice_number || '—'}</td>
                            <td className={`px-4 py-2.5 text-right font-semibold ${textCls}`}>{fmt(row.amount_ttc)}</td>
                            <td className="px-4 py-2.5">
                              {!isInvalid && !isDupe && (
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PM_STYLES[row.payment_method]}`}>
                                  {row.payment_method}
                                </span>
                              )}
                            </td>
                            <td className={`px-4 py-2.5 text-xs ${textCls}`}>
                              {!isInvalid && !isDupe && row.payment_status}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Importing ── */}
          {stage === 'importing' && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Importation en cours…</p>
            </div>
          )}

          {/* ── Done ── */}
          {stage === 'done' && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <CheckCircle className="w-12 h-12 text-emerald-500" />
              <p className="text-lg font-semibold text-slate-800">
                {imported} achat{imported > 1 ? 's' : ''} importé{imported > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-slate-500">La liste a été mise à jour.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {(stage === 'preview' || stage === 'done') && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
            {stage === 'preview' ? (
              <>
                <button
                  onClick={() => { setRows([]); setStage('idle'); }}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Changer de fichier
                </button>
                <button
                  onClick={confirmImport}
                  disabled={toImport.length === 0}
                  className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
                >
                  Importer {toImport.length} ligne{toImport.length !== 1 ? 's' : ''}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="ml-auto px-5 py-2 text-sm bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors"
              >
                Fermer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
