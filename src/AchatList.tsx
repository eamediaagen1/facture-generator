import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import {
  Plus, Search, Eye, Edit2, Trash2, ExternalLink, FileText, LogOut,
  ShoppingCart, TrendingDown, CheckCircle, AlertCircle,
} from 'lucide-react';
import type { Achat, AchatPaymentStatus } from './types';
import { getAchats, deleteAchat, deleteAchatFile } from './services/achatService';
import { signOut } from './services/authService';

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

interface Props {
  onNew:      () => void;
  onEdit:     (id: string) => void;
  onView:     (id: string) => void;
  onFactures: () => void;
  onClients:  () => void;
}

export default function AchatList({ onNew, onEdit, onView, onFactures, onClients }: Props) {
  const [achats,      setAchats]      = useState<Achat[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState('');
  const [search,      setSearch]      = useState('');
  const [statusFilter, setStatusFilter] = useState<AchatPaymentStatus | ''>('');
  const [yearFilter,  setYearFilter]  = useState('');

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

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return achats.filter(a => {
      if (statusFilter && a.payment_status !== statusFilter) return false;
      if (yearFilter   && !a.invoice_date?.startsWith(yearFilter)) return false;
      if (q &&
        !a.supplier_name.toLowerCase().includes(q) &&
        !a.supplier_invoice_number.toLowerCase().includes(q) &&
        !a.category.toLowerCase().includes(q)
      ) return false;
      return true;
    });
  }, [achats, search, statusFilter, yearFilter]);

  const metrics = useMemo(() => ({
    total:    achats.length,
    totalTTC: achats.reduce((s, a) => s + a.amount_ttc, 0),
    totalTVA: achats.reduce((s, a) => s + a.tva, 0),
    unpaid:   achats
      .filter(a => a.payment_status === 'Non payé')
      .reduce((s, a) => s + a.amount_ttc, 0),
  }), [achats]);

  async function handleDelete(a: Achat) {
    if (!window.confirm('Supprimer cet achat définitivement ?')) return;
    if (a.file_path) await deleteAchatFile(a.file_path);
    await deleteAchat(a.id);
    setAchats(prev => prev.filter(x => x.id !== a.id));
  }

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-slate-700 shrink-0" />
            <span className="font-semibold text-slate-800 text-sm tracking-wide uppercase truncate">
              AMOR AMENAGEMENT
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onNew}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nouvel achat</span>
            </button>
            <button
              onClick={() => signOut()}
              title="Déconnexion"
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Tab nav */}
        <div className="border-t border-slate-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex">
            <button
              onClick={onFactures}
              className="py-2 px-3 text-sm font-medium text-slate-400 hover:text-slate-700 border-b-2 border-transparent -mb-px transition-colors"
            >
              Factures &amp; Devis
            </button>
            <span className="py-2 px-3 text-sm font-semibold text-slate-800 border-b-2 border-slate-800 -mb-px">
              Achats
            </span>
            <button
              onClick={onClients}
              className="py-2 px-3 text-sm font-medium text-slate-400 hover:text-slate-700 border-b-2 border-transparent -mb-px transition-colors"
            >
              Clients
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">

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
          <div className="flex gap-3 sm:gap-2">
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
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 w-36">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-medium text-slate-800">{a.supplier_name || '—'}</span>
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
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            a.payment_status === 'Payé'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {a.payment_status}
                          </span>
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
      </div>
    </div>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function MobileAchatCard({
  achat, onView, onEdit, onDelete,
}: {
  achat: Achat;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-slate-800 block">{achat.supplier_name || '—'}</span>
          <p className="text-xs text-slate-400 mt-0.5">{achat.category || 'Sans catégorie'}</p>
        </div>
        <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
          achat.payment_status === 'Payé'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-700'
        }`}>
          {achat.payment_status}
        </span>
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
