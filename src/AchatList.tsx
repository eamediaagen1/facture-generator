import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import {
  Plus, Search, Eye, Edit2, Trash2, ExternalLink,
  ShoppingCart, TrendingDown, CheckCircle, AlertCircle, Upload, Sparkles,
} from 'lucide-react';
import type { Achat, AchatPaymentStatus, PaymentMethod } from './types';
import { getAchats, deleteAchat, deleteAchatFile, patchAchat } from './services/achatService';
import AchatImportModal from './AchatImportModal';
import AchatAIModal from './AchatAIModal';

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

interface Props {
  onNew:  () => void;
  onEdit: (id: string) => void;
  onView: (id: string) => void;
}

export default function AchatList({ onNew, onEdit, onView }: Props) {
  const [achats,      setAchats]      = useState<Achat[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState('');
  const [search,      setSearch]      = useState('');
  const [statusFilter, setStatusFilter] = useState<AchatPaymentStatus | ''>('');
  const [yearFilter,  setYearFilter]  = useState('');
  const [trimFilter,  setTrimFilter]  = useState<'' | 'T1' | 'T2' | 'T3' | 'T4'>('');
  const [showImport,  setShowImport]  = useState(false);
  const [showAIModal,  setShowAIModal]  = useState(false);
  const [inlineError,  setInlineError]  = useState('');

  type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'amount_desc' | 'amount_asc';
  const [sortBy, setSortBy] = useState<SortKey>('date_desc');

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      setAchats(await getAchats());
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const years = useMemo(() => {
    const set = new Set(achats.map(a => a.invoice_date?.slice(0, 4)).filter(Boolean) as string[]);
    return Array.from(set).sort().reverse();
  }, [achats]);

  function getTrim(dateStr: string): string {
    const m = parseInt(dateStr?.slice(5, 7) ?? '0', 10);
    if (m <= 3) return 'T1';
    if (m <= 6) return 'T2';
    if (m <= 9) return 'T3';
    return 'T4';
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const result = achats.filter(a => {
      if (statusFilter && a.payment_status !== statusFilter) return false;
      if (yearFilter   && !a.invoice_date?.startsWith(yearFilter)) return false;
      if (trimFilter   && a.invoice_date && getTrim(a.invoice_date) !== trimFilter) return false;
      if (q &&
        !a.supplier_name.toLowerCase().includes(q) &&
        !a.supplier_invoice_number.toLowerCase().includes(q) &&
        !a.category.toLowerCase().includes(q)
      ) return false;
      return true;
    });
    const s = [...result];
    switch (sortBy) {
      case 'name_asc':    s.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name, 'fr')); break;
      case 'name_desc':   s.sort((a, b) => b.supplier_name.localeCompare(a.supplier_name, 'fr')); break;
      case 'date_asc':    s.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));         break;
      case 'date_desc':   s.sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));         break;
      case 'amount_desc': s.sort((a, b) => b.amount_ttc - a.amount_ttc);                          break;
      case 'amount_asc':  s.sort((a, b) => a.amount_ttc - b.amount_ttc);                          break;
    }
    return s;
  }, [achats, search, statusFilter, yearFilter, trimFilter, sortBy]);

  const metrics = useMemo(() => ({
    total:    achats.length,
    totalTTC: achats.reduce((s, a) => s + a.amount_ttc, 0),
    totalTVA: achats.reduce((s, a) => s + a.tva, 0),
    unpaid:   achats
      .filter(a => a.payment_status === 'Non payé')
      .reduce((s, a) => s + a.amount_ttc, 0),
  }), [achats]);

  async function handleStatusChange(a: Achat, status: AchatPaymentStatus) {
    setAchats(prev => prev.map(x => x.id === a.id ? { ...x, payment_status: status } : x));
    try {
      await patchAchat(a.id, { payment_status: status });
    } catch (e: unknown) {
      setAchats(prev => prev.map(x => x.id === a.id ? { ...x, payment_status: a.payment_status } : x));
      setInlineError(e instanceof Error ? e.message : 'Erreur de sauvegarde');
      setTimeout(() => setInlineError(''), 4000);
    }
  }

  async function handleMethodChange(a: Achat, method: PaymentMethod) {
    setAchats(prev => prev.map(x => x.id === a.id ? { ...x, payment_method: method } : x));
    try {
      await patchAchat(a.id, { payment_method: method });
    } catch (e: unknown) {
      setAchats(prev => prev.map(x => x.id === a.id ? { ...x, payment_method: a.payment_method } : x));
      setInlineError(e instanceof Error ? e.message : 'Erreur de sauvegarde');
      setTimeout(() => setInlineError(''), 4000);
    }
  }

  async function handleDelete(a: Achat) {
    if (!window.confirm('Supprimer cet achat définitivement ?')) return;
    if (a.file_path) await deleteAchatFile(a.file_path);
    await deleteAchat(a.id);
    setAchats(prev => prev.filter(x => x.id !== a.id));
  }

  return (
    <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-4 max-w-7xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Achats</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAIModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 text-sm font-medium rounded-lg transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Importer avec IA</span>
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-all"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importer</span>
          </button>
          <button
            onClick={onNew}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nouvel achat</span>
          </button>
        </div>
      </div>

        {/* ── Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            icon={<ShoppingCart className="w-5 h-5 text-slate-500" />}
            label="Total achats"
            value={String(metrics.total)}
          />
          <MetricCard
            icon={<TrendingDown className="w-5 h-5 text-blue-500" />}
            label="Total TTC achats"
            value={`${fmt(metrics.totalTTC)} DH`}
            valueClass="text-blue-700"
          />
          <MetricCard
            icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
            label="TVA récupérable"
            value={`${fmt(metrics.totalTVA)} DH`}
            valueClass="text-emerald-700"
          />
          <MetricCard
            icon={<AlertCircle className="w-5 h-5 text-amber-500" />}
            label="Non payés (TTC)"
            value={`${fmt(metrics.unpaid)} DH`}
            valueClass="text-amber-700"
          />
        </div>

        {/* ── Filters ── */}
        {inlineError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
            {inlineError}
          </div>
        )}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Fournisseur, n° facture, catégorie…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as AchatPaymentStatus | '')}
              className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Tous les statuts</option>
              <option value="Non payé">Non payé</option>
              <option value="Payé">Payé</option>
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
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortKey)}
              className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="date_desc">Date (récent → ancien)</option>
              <option value="date_asc">Date (ancien → récent)</option>
              <option value="name_asc">Fournisseur A → Z</option>
              <option value="name_desc">Fournisseur Z → A</option>
              <option value="amount_desc">Montant (haut → bas)</option>
              <option value="amount_asc">Montant (bas → haut)</option>
            </select>
          </div>
        </div>

        {/* ── List ── */}
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
              <ShoppingCart className="w-10 h-10 mb-3 opacity-25" />
              <p className="text-sm font-medium">Aucun achat trouvé</p>
              {achats.length === 0 && (
                <p className="text-xs mt-1">Créez votre premier achat pour commencer</p>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Fournisseur</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-28">Date</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-36">N° Facture</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-32">Catégorie</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-36">Montant TTC</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-28">Statut</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-28">Mode</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 w-36">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800">{a.supplier_name || '—'}</span>
                            {a.status === 'needs_review' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                                <Sparkles className="w-3 h-3" />
                                IA
                              </span>
                            )}
                          </div>
                          {a.description && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{a.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-slate-600">{dateFR(a.invoice_date)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-slate-600 font-mono">{a.supplier_invoice_number || '—'}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-slate-600">{a.category || '—'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-sm font-semibold text-slate-800">{fmt(a.amount_ttc)} DH</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <select
                            value={a.payment_status}
                            onChange={e => handleStatusChange(a, e.target.value as AchatPaymentStatus)}
                            onClick={e => e.stopPropagation()}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 outline-none cursor-pointer ${
                              a.payment_status === 'Payé'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            <option value="Non payé">Non payé</option>
                            <option value="Payé">Payé</option>
                          </select>
                        </td>
                        <td className="px-4 py-3.5">
                          <select
                            value={a.payment_method ?? 'Virement'}
                            onChange={e => handleMethodChange(a, e.target.value as PaymentMethod)}
                            onClick={e => e.stopPropagation()}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 outline-none cursor-pointer ${PM_STYLES[a.payment_method ?? 'Virement'] ?? PM_STYLES['Virement']}`}
                          >
                            <option value="Virement">Virement</option>
                            <option value="Espèce">Espèce</option>
                            <option value="Chèque">Chèque</option>
                            <option value="Carte">Carte</option>
                          </select>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-0.5">
                            {a.file_url && (
                              <a
                                href={a.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Voir fichier"
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            <Btn title="Voir"      onClick={() => onView(a.id)}><Eye    className="w-4 h-4" /></Btn>
                            <Btn title="Modifier"  onClick={() => onEdit(a.id)}><Edit2  className="w-4 h-4" /></Btn>
                            <Btn title="Supprimer" onClick={() => handleDelete(a)} danger><Trash2 className="w-4 h-4" /></Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filtered.map(a => (
                  <MobileAchatCard
                    key={a.id}
                    achat={a}
                    onView={() => onView(a.id)}
                    onEdit={() => onEdit(a.id)}
                    onDelete={() => handleDelete(a)}
                    onStatusChange={status => handleStatusChange(a, status)}
                    onMethodChange={method => handleMethodChange(a, method)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-right">
          {filtered.length} achat{filtered.length > 1 ? 's' : ''}
          {filtered.length !== achats.length ? ` sur ${achats.length}` : ''}
        </p>
      )}

      {showImport && (
        <AchatImportModal
          existingAchats={achats}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      {showAIModal && (
        <AchatAIModal
          onClose={() => setShowAIModal(false)}
          onDone={() => { setShowAIModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function MobileAchatCard({
  achat, onView, onEdit, onDelete, onStatusChange, onMethodChange,
}: {
  achat:          Achat;
  onView:         () => void;
  onEdit:         () => void;
  onDelete:       () => void;
  onStatusChange: (s: AchatPaymentStatus) => void;
  onMethodChange: (m: PaymentMethod) => void;
}) {
  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-800">{achat.supplier_name || '—'}</span>
            {achat.status === 'needs_review' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 shrink-0">
                <Sparkles className="w-3 h-3" />
                IA
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{achat.category || 'Sans catégorie'}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <select
            value={achat.payment_status}
            onChange={e => onStatusChange(e.target.value as AchatPaymentStatus)}
            onClick={e => e.stopPropagation()}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 outline-none cursor-pointer ${
              achat.payment_status === 'Payé'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            <option value="Non payé">Non payé</option>
            <option value="Payé">Payé</option>
          </select>
          <select
            value={achat.payment_method ?? 'Virement'}
            onChange={e => onMethodChange(e.target.value as PaymentMethod)}
            onClick={e => e.stopPropagation()}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 outline-none cursor-pointer ${PM_STYLES[achat.payment_method ?? 'Virement'] ?? PM_STYLES['Virement']}`}
          >
            <option value="Virement">Virement</option>
            <option value="Espèce">Espèce</option>
            <option value="Chèque">Chèque</option>
            <option value="Carte">Carte</option>
          </select>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">{dateFR(achat.invoice_date)}</p>
          <p className="text-base font-bold text-slate-800 mt-0.5">{fmt(achat.amount_ttc)} DH</p>
        </div>
        <div className="flex items-center gap-1">
          {achat.file_url && (
            <a
              href={achat.file_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Voir fichier"
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          )}
          <Btn title="Voir"      onClick={onView}><Eye    className="w-5 h-5" /></Btn>
          <Btn title="Modifier"  onClick={onEdit}><Edit2  className="w-5 h-5" /></Btn>
          <Btn title="Supprimer" onClick={onDelete} danger><Trash2 className="w-5 h-5" /></Btn>
        </div>
      </div>
    </div>
  );
}

// ── PaymentMethodBadge ────────────────────────────────────────────────────────

const PM_STYLES: Record<PaymentMethod, string> = {
  'Virement': 'bg-blue-50 text-blue-700',
  'Espèce':   'bg-emerald-50 text-emerald-700',
  'Chèque':   'bg-violet-50 text-violet-700',
  'Carte':    'bg-pink-50 text-pink-700',
};

function PaymentMethodBadge({ value }: { value?: PaymentMethod }) {
  const label = value ?? 'Virement';
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${PM_STYLES[label] ?? PM_STYLES['Virement']}`}>
      {label}
    </span>
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

// ── Btn ───────────────────────────────────────────────────────────────────────

function Btn({
  title, onClick, danger, children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-2 sm:p-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg transition-all ${
        danger
          ? 'text-slate-300 hover:text-red-500 hover:bg-red-50'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
