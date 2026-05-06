import { useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { exportAchatsTrimesterZip } from './services/exportService';

interface Props {
  onClose: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

const TRIMESTERS = [
  { value: 1, label: 'T1 — Janvier · Février · Mars' },
  { value: 2, label: 'T2 — Avril · Mai · Juin' },
  { value: 3, label: 'T3 — Juillet · Août · Septembre' },
  { value: 4, label: 'T4 — Octobre · Novembre · Décembre' },
] as const;

export default function AchatTrimesterExportModal({ onClose }: Props) {
  const [year,       setYear]       = useState(CURRENT_YEAR);
  const [trimester,  setTrimester]  = useState<1 | 2 | 3 | 4>(1);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [done,       setDone]       = useState(false);

  async function handleExport() {
    setLoading(true);
    setError('');
    setDone(false);
    try {
      await exportAchatsTrimesterZip(year, trimester);
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'export');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Export par trimestre</h2>
            <p className="text-xs text-slate-400 mt-0.5">Télécharger un ZIP (XLSX + documents joints)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">

          {/* Year */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Année</label>
            <select
              value={year}
              onChange={e => { setYear(Number(e.target.value)); setDone(false); }}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Trimester */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Trimestre</label>
            <div className="grid grid-cols-2 gap-2">
              {TRIMESTERS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setTrimester(t.value); setDone(false); }}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all text-left ${
                    trimester === t.value
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {t.label.split(' — ')[0]}
                  <span className={`block text-xs font-normal mt-0.5 ${trimester === t.value ? 'text-slate-300' : 'text-slate-400'}`}>
                    {t.label.split(' — ')[1]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ZIP name preview */}
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs font-mono text-slate-500">
            achats_export_T{trimester}_{year}.zip
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          {done && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700">
              Téléchargement lancé avec succès.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
          >
            Fermer
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {loading ? 'Génération…' : 'Télécharger ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
