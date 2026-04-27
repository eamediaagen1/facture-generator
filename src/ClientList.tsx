import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import {
  Plus, Search, Eye, Edit2, Trash2,
  Users, TrendingUp, AlertCircle, UserCheck,
} from 'lucide-react';
import type { Client, Invoice } from './types';
import { getClients, deleteClient } from './services/clientService';
import { getFactures } from './services/factureService';

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  onNew:  () => void;
  onEdit: (id: string) => void;
  onView: (id: string) => void;
}

export default function ClientList({ onNew, onEdit, onView }: Props) {
  const [clients,     setClients]     = useState<Client[]>([]);
  const [factures,    setFactures]    = useState<Invoice[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState('');
  const [search,      setSearch]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const [c, f] = await Promise.all([getClients(), getFactures()]);
      setClients(c);
      setFactures(f);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Per-client revenue metrics derived from factures
  const clientMetrics = useMemo(() => {
    const map: Record<string, { revenue: number; unpaid: number }> = {};
    factures.forEach(f => {
      if (!f.clientId) return;
      if (!map[f.clientId]) map[f.clientId] = { revenue: 0, unpaid: 0 };
      if (f.documentType === 'facture') {
        if (f.status === 'Payée') map[f.clientId].revenue += f.totalTTC;
        if (f.status === 'Générée' || f.status === 'Envoyée') map[f.clientId].unpaid += f.totalTTC;
      }
    });
    return map;
  }, [factures]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return clients;
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.ice.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const totals = useMemo(() => ({
    revenue: Object.values(clientMetrics).reduce((s, m) => s + m.revenue, 0),
    unpaid:  Object.values(clientMetrics).reduce((s, m) => s + m.unpaid, 0),
  }), [clientMetrics]);

  async function handleDelete(c: Client) {
    if (!window.confirm(`Supprimer le client "${c.name}" définitivement ?`)) return;
    await deleteClient(c.id);
    setClients(prev => prev.filter(x => x.id !== c.id));
  }

  return (
    <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-4 max-w-5xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Clients</h1>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 min-h-[44px] bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nouveau client</span>
        </button>
      </div>

      {/* ── Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={<Users className="w-5 h-5 text-slate-500" />}        label="Total clients"    value={String(clients.length)} />
          <MetricCard icon={<UserCheck className="w-5 h-5 text-violet-500" />}   label="Avec factures"    value={String(Object.keys(clientMetrics).length)} valueClass="text-violet-700" />
          <MetricCard icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} label="CA encaissé"      value={`${fmt(totals.revenue)} DH`} valueClass="text-emerald-700" />
          <MetricCard icon={<AlertCircle className="w-5 h-5 text-amber-500" />}  label="Impayés clients"  value={`${fmt(totals.unpaid)} DH`}  valueClass="text-amber-700" />
        </div>

        {/* ── Search ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Nom, ICE, ville, téléphone, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
            />
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
              <Users className="w-10 h-10 mb-3 opacity-25" />
              <p className="text-sm font-medium">Aucun client trouvé</p>
              {clients.length === 0 && <p className="text-xs mt-1">Créez votre premier client pour commencer</p>}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Client</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-36">ICE</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-32">Téléphone</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-40">Email</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-32">CA (payé)</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-32">Impayé</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(c => {
                      const m = clientMetrics[c.id] ?? { revenue: 0, unpaid: 0 };
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                            {c.city && <p className="text-xs text-slate-400 mt-0.5">{c.city}</p>}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-mono text-slate-600">{c.ice || '—'}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-sm text-slate-600">{c.phone || '—'}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-sm text-slate-600 truncate block max-w-[160px]">{c.email || '—'}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="text-sm font-semibold text-emerald-700">{fmt(m.revenue)} DH</span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {m.unpaid > 0
                              ? <span className="text-sm font-semibold text-amber-600">{fmt(m.unpaid)} DH</span>
                              : <span className="text-sm text-slate-300">—</span>
                            }
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-0.5">
                              <Btn title="Voir"      onClick={() => onView(c.id)}><Eye   className="w-4 h-4" /></Btn>
                              <Btn title="Modifier"  onClick={() => onEdit(c.id)}><Edit2 className="w-4 h-4" /></Btn>
                              <Btn title="Supprimer" onClick={() => handleDelete(c)} danger><Trash2 className="w-4 h-4" /></Btn>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filtered.map(c => {
                  const m = clientMetrics[c.id] ?? { revenue: 0, unpaid: 0 };
                  return (
                    <div key={c.id} className="px-4 py-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{c.city || c.ice || '—'}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Btn title="Voir"      onClick={() => onView(c.id)}><Eye   className="w-5 h-5" /></Btn>
                          <Btn title="Modifier"  onClick={() => onEdit(c.id)}><Edit2 className="w-5 h-5" /></Btn>
                          <Btn title="Supprimer" onClick={() => handleDelete(c)} danger><Trash2 className="w-5 h-5" /></Btn>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <p className="text-xs text-slate-400">CA encaissé</p>
                          <p className="text-sm font-semibold text-emerald-700">{fmt(m.revenue)} DH</p>
                        </div>
                        {m.unpaid > 0 && (
                          <div>
                            <p className="text-xs text-slate-400">Impayé</p>
                            <p className="text-sm font-semibold text-amber-600">{fmt(m.unpaid)} DH</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-right">
          {filtered.length} client{filtered.length > 1 ? 's' : ''}
          {filtered.length !== clients.length ? ` sur ${clients.length}` : ''}
        </p>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, valueClass }: { icon: ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4 flex items-center gap-3">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        <p className={`text-base font-bold tracking-tight mt-0.5 truncate ${valueClass ?? 'text-slate-800'}`}>{value}</p>
      </div>
    </div>
  );
}

function Btn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-2 sm:p-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg transition-all ${
        danger ? 'text-slate-300 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
