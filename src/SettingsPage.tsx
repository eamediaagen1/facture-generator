import { useState } from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import { resetFactureCounter } from './services/numberingService';

interface Props {
  onBack: () => void;
}

export default function SettingsPage({ onBack }: Props) {
  const currentYear = new Date().getFullYear();
  const [year,      setYear]      = useState(currentYear);
  const [startFrom, setStartFrom] = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleReset() {
    const nextNum = `FAC-${year}-${String(startFrom + 1).padStart(4, '0')}`;
    const ok = window.confirm(
      `Réinitialiser le compteur FAC-${year} ?\n\n` +
      `Le prochain numéro généré sera ${nextNum}.\n\n` +
      `Les factures existantes ne seront PAS supprimées.\n` +
      `Si ${nextNum} existe déjà, le système trouvera automatiquement le premier numéro libre.`
    );
    if (!ok) return;
    setLoading(true);
    setResult(null);
    try {
      await resetFactureCounter(year, startFrom);
      setResult({ ok: true, msg: `Compteur réinitialisé. Prochain numéro prévu : ${nextNum}` });
    } catch (e: unknown) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">

      {/* Toolbar */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <Settings className="w-4 h-4 text-slate-500" />
          <span className="font-semibold text-slate-800 text-sm tracking-wide uppercase">Paramètres</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
              Numérotation des factures
            </h2>
          </div>

          <div className="px-6 py-5 space-y-5">

            {/* Warning */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
              <strong>Attention :</strong> cette action réinitialise le compteur interne.
              Les factures existantes ne sont pas supprimées.
              Si le numéro généré existe déjà, le système l'incrémente automatiquement jusqu'à trouver un numéro libre.
            </div>

            {/* Year */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Année
              </label>
              <input
                type="number"
                value={year}
                min={2020}
                max={2099}
                onChange={e => setYear(Number(e.target.value))}
                className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            {/* Start from */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Repartir à partir de
              </label>
              <input
                type="number"
                value={startFrom}
                min={0}
                onChange={e => setStartFrom(Math.max(0, Number(e.target.value)))}
                className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                0 → prochain numéro sera FAC-{year}-0001
              </p>
            </div>

            {/* Feedback */}
            {result && (
              <div className={`rounded-lg px-4 py-3 text-xs leading-relaxed ${
                result.ok
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {result.msg}
              </div>
            )}

            {/* Action */}
            <button
              onClick={handleReset}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
            >
              {loading && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Réinitialiser le compteur
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
