import { useState, useEffect, useMemo } from 'react';
import { getFactures } from './services/factureService';
import { getAchats } from './services/achatService';
import { getBankStatements } from './services/bankStatementService';
import type { Invoice, Achat, BankStatement } from './types';

type Period = 'month' | 'trimester' | 'year' | 'custom' | 'all';

const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month',     label: 'Mois'          },
  { key: 'trimester', label: 'Trimestre'     },
  { key: 'year',      label: 'Année'         },
  { key: 'custom',    label: 'Personnalisé'  },
  { key: 'all',       label: 'Tout'          },
];

function fmt(n: number) {
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function inRange(dateStr: string, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  const d = new Date(dateStr);
  if (from && d < from) return false;
  if (to   && d > to)   return false;
  return true;
}

export default function Reports() {
  const now = new Date();
  const currentYear      = now.getFullYear();
  const currentMonth     = now.getMonth() + 1;
  const currentTrimester = Math.floor(now.getMonth() / 3) + 1;

  const [period,     setPeriod]     = useState<Period>('year');
  const [year,       setYear]       = useState(currentYear);
  const [month,      setMonth]      = useState(currentMonth);
  const [trimester,  setTrimester]  = useState(currentTrimester);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [achats,     setAchats]     = useState<Achat[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([getFactures(), getAchats(), getBankStatements()])
      .then(([inv, ach, stmt]) => {
        setInvoices(inv);
        setAchats(ach);
        setStatements(stmt);
      })
      .finally(() => setLoading(false));
  }, []);

  const { from, to } = useMemo(() => {
    if (period === 'all') return { from: null, to: null };
    if (period === 'year') return {
      from: new Date(year, 0, 1),
      to:   new Date(year, 11, 31, 23, 59, 59),
    };
    if (period === 'trimester') {
      const q = (trimester - 1) * 3;
      return {
        from: new Date(year, q, 1),
        to:   new Date(year, q + 3, 0, 23, 59, 59),
      };
    }
    if (period === 'month') return {
      from: new Date(year, month - 1, 1),
      to:   new Date(year, month, 0, 23, 59, 59),
    };
    if (period === 'custom' && customFrom && customTo) return {
      from: new Date(customFrom),
      to:   new Date(customTo + 'T23:59:59'),
    };
    return { from: null, to: null };
  }, [period, year, month, trimester, customFrom, customTo]);

  const filteredFactures = useMemo(() =>
    invoices.filter(inv => inv.documentType === 'facture' && inRange(inv.date, from, to)),
    [invoices, from, to]);

  const filteredDevis = useMemo(() =>
    invoices.filter(inv => inv.documentType === 'devis' && inRange(inv.date, from, to)),
    [invoices, from, to]);

  const filteredBL = useMemo(() =>
    invoices.filter(inv => inv.documentType === 'bon_livraison' && inRange(inv.date, from, to)),
    [invoices, from, to]);

  const filteredAchats = useMemo(() =>
    achats.filter(a => inRange(a.invoice_date, from, to)),
    [achats, from, to]);

  const facMetrics = useMemo(() => {
    const active    = filteredFactures.filter(f => f.status !== 'Annulée');
    const caHT      = active.reduce((s, f) => s + f.totalHT,    0);
    const caTTC     = active.reduce((s, f) => s + f.totalTTC,   0);
    const tvaColl   = active.reduce((s, f) => s + f.tvaAmount,  0);
    const paid      = active.filter(f => f.status === 'Payée').reduce((s, f) => s + f.totalTTC, 0);
    const unpaid    = active.filter(f => f.status !== 'Payée').reduce((s, f) => s + f.totalTTC, 0);
    const cancelled = filteredFactures.length - active.length;
    return { caHT, caTTC, tvaColl, paid, unpaid, count: active.length, cancelled };
  }, [filteredFactures]);

  const achatMetrics = useMemo(() => {
    const totalHT   = filteredAchats.reduce((s, a) => s + a.amount_ht,  0);
    const totalTTC  = filteredAchats.reduce((s, a) => s + a.amount_ttc, 0);
    const tvaDeduct = filteredAchats.reduce((s, a) => s + a.tva,        0);
    const paid      = filteredAchats.filter(a => a.payment_status === 'Payé').reduce((s, a) => s + a.amount_ttc, 0);
    const unpaid    = filteredAchats.filter(a => a.payment_status === 'Non payé').reduce((s, a) => s + a.amount_ttc, 0);
    return { totalHT, totalTTC, tvaDeduct, paid, unpaid, count: filteredAchats.length };
  }, [filteredAchats]);

  const tvaSolde  = facMetrics.tvaColl - achatMetrics.tvaDeduct;
  const benefice  = facMetrics.caTTC   - achatMetrics.totalTTC;

  const clientRevenue = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; count: number }>();
    filteredFactures.filter(f => f.status !== 'Annulée').forEach(f => {
      const key  = f.clientId ?? f.client.split('\n')[0].trim();
      const name = f.client.split('\n')[0].trim();
      const ex   = map.get(key) ?? { name, revenue: 0, count: 0 };
      map.set(key, { name, revenue: ex.revenue + f.totalTTC, count: ex.count + 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [filteredFactures]);

  const achatCategories = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filteredAchats.forEach(a => {
      const cat = a.category || 'Non catégorisé';
      const ex  = map.get(cat) ?? { count: 0, total: 0 };
      map.set(cat, { count: ex.count + 1, total: ex.total + a.amount_ttc });
    });
    return Array.from(map.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [filteredAchats]);

  const stmtFiltered = useMemo(() => {
    if (period === 'all')  return [...statements].sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month);
    if (period === 'year') return statements.filter(s => s.year === year).sort((a, b) => a.month - b.month);
    if (period === 'trimester') {
      const months = [(trimester - 1) * 3 + 1, (trimester - 1) * 3 + 2, (trimester - 1) * 3 + 3];
      return statements.filter(s => s.year === year && months.includes(s.month)).sort((a, b) => a.month - b.month);
    }
    if (period === 'month') return statements.filter(s => s.year === year && s.month === month);
    if (from && to) {
      return statements.filter(s => {
        const d = new Date(s.year, s.month - 1, 1);
        return d >= new Date(from.getFullYear(), from.getMonth(), 1) &&
               d <= new Date(to.getFullYear(), to.getMonth(), 1);
      }).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
    }
    return statements;
  }, [statements, period, year, month, trimester, from, to]);

  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 w-full max-w-[1400px] mx-auto">

      {/* Header */}
      <h1 className="text-xl font-bold text-slate-800">Rapports financiers</h1>

      {/* Period filter */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                period === p.key
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period !== 'all' && period !== 'custom' && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {period === 'trimester' && (
              <select
                value={trimester}
                onChange={e => setTrimester(Number(e.target.value))}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
              >
                {[1,2,3,4].map(t => <option key={t} value={t}>T{t}</option>)}
              </select>
            )}
            {period === 'month' && (
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
              >
                {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            )}
          </div>
        )}

        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        )}
      </div>

      {/* Summary metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Chiffre d'affaires TTC"
          value={fmt(facMetrics.caTTC)}
          sub={`${facMetrics.count} facture(s)`}
          color="violet"
        />
        <MetricCard
          label="Total achats TTC"
          value={fmt(achatMetrics.totalTTC)}
          sub={`${achatMetrics.count} achat(s)`}
          color="blue"
        />
        <MetricCard
          label="Bénéfice brut"
          value={fmt(benefice)}
          sub="CA − Achats"
          color={benefice >= 0 ? 'emerald' : 'red'}
        />
        <MetricCard
          label="Solde TVA"
          value={fmt(tvaSolde)}
          sub={tvaSolde >= 0 ? 'À reverser' : 'Crédit TVA'}
          color={tvaSolde >= 0 ? 'amber' : 'slate'}
        />
      </div>

      {/* Detail sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <Section title="Factures">
          <TableRows rows={[
            ['CA HT',          fmt(facMetrics.caHT)],
            ['TVA collectée',  fmt(facMetrics.tvaColl)],
            ['CA TTC',         fmt(facMetrics.caTTC)],
            ['— dont Payées',  fmt(facMetrics.paid)],
            ['— dont Impayées',fmt(facMetrics.unpaid)],
            ['Annulées',       `${facMetrics.cancelled} doc(s)`],
          ]} />
        </Section>

        <Section title="Devis & Bons de Livraison">
          <TableRows rows={[
            ['Devis (total)',       `${filteredDevis.length} doc(s)`],
            ['Devis acceptés',     `${filteredDevis.filter(d => d.status === 'Accepté').length}`],
            ['Devis refusés',      `${filteredDevis.filter(d => d.status === 'Refusé').length}`],
            ['Devis en attente',   `${filteredDevis.filter(d => !['Accepté','Refusé','Annulée'].includes(d.status)).length}`],
            ['Bons de livraison',  `${filteredBL.length} doc(s)`],
            ['BL livrés',          `${filteredBL.filter(b => b.status === 'Livré').length}`],
          ]} />
        </Section>

        <Section title="Achats">
          <TableRows rows={[
            ['Total HT',          fmt(achatMetrics.totalHT)],
            ['TVA déductible',    fmt(achatMetrics.tvaDeduct)],
            ['Total TTC',         fmt(achatMetrics.totalTTC)],
            ['— dont Payés',      fmt(achatMetrics.paid)],
            ['— dont Non payés',  fmt(achatMetrics.unpaid)],
          ]} />
        </Section>

        <Section title="Récapitulatif TVA">
          <TableRows rows={[
            ['TVA collectée (Factures)',  fmt(facMetrics.tvaColl)],
            ['TVA déductible (Achats)',   fmt(achatMetrics.tvaDeduct)],
            ['Solde TVA',                 fmt(tvaSolde)],
          ]} />
          <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
            {tvaSolde >= 0
              ? `Montant à reverser à l'administration fiscale : ${fmt(tvaSolde)}`
              : `Crédit de TVA disponible : ${fmt(Math.abs(tvaSolde))}`}
          </p>
        </Section>

      </div>

      {/* Client revenue */}
      {clientRevenue.length > 0 && (
        <Section title="Chiffre d'affaires par client (Top 10)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 pr-4">Client</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 px-4">Factures</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2">CA TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {clientRevenue.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 text-slate-800 font-medium">{c.name}</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">{c.count}</td>
                    <td className="py-2.5 text-right text-slate-800 font-semibold tabular-nums">{fmt(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Achat categories */}
      {achatCategories.length > 0 && (
        <Section title="Achats par catégorie">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 pr-4">Catégorie</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 px-4">Quantité</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2">Total TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {achatCategories.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 text-slate-800 font-medium">{c.category}</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">{c.count}</td>
                    <td className="py-2.5 text-right text-slate-800 font-semibold tabular-nums">{fmt(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Bank statements cashflow */}
      {stmtFiltered.length > 0 && (
        <Section title="Flux bancaires">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 pr-4">Période</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 px-3">Solde ouv.</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 px-3">Crédit</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 px-3">Débit</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2">Solde clôt.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stmtFiltered.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 text-slate-800 font-medium">
                      {MONTH_NAMES[s.month - 1]} {s.year}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500 tabular-nums">{fmt(s.opening_balance)}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600 font-medium tabular-nums">{fmt(s.total_credit)}</td>
                    <td className="py-2.5 px-3 text-right text-red-500 font-medium tabular-nums">{fmt(s.total_debit)}</td>
                    <td className="py-2.5 text-right text-slate-800 font-semibold tabular-nums">{fmt(s.closing_balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200">
                <tr>
                  <td className="py-2.5 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</td>
                  <td />
                  <td className="py-2.5 px-3 text-right text-emerald-600 font-bold tabular-nums">
                    {fmt(stmtFiltered.reduce((s, r) => s + r.total_credit, 0))}
                  </td>
                  <td className="py-2.5 px-3 text-right text-red-500 font-bold tabular-nums">
                    {fmt(stmtFiltered.reduce((s, r) => s + r.total_debit, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type MetricColor = 'violet' | 'blue' | 'emerald' | 'red' | 'amber' | 'slate';

const COLOR_MAP: Record<MetricColor, string> = {
  violet:  'text-violet-700 bg-violet-50  border-violet-100',
  blue:    'text-blue-700   bg-blue-50    border-blue-100',
  emerald: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  red:     'text-red-700    bg-red-50     border-red-100',
  amber:   'text-amber-700  bg-amber-50   border-amber-100',
  slate:   'text-slate-700  bg-slate-50   border-slate-200',
};

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: MetricColor;
}) {
  return (
    <div className={`rounded-xl border p-5 ${COLOR_MAP[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg sm:text-xl font-bold mt-1 break-words leading-tight tabular-nums">{value}</p>
      <p className="text-xs mt-1 opacity-60">{sub}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function TableRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="space-y-2.5">
      {rows.map(([label, value], i) => (
        <div key={i} className="flex items-center justify-between text-sm gap-4">
          <span className="text-slate-500">{label}</span>
          <span className="text-slate-800 font-medium tabular-nums shrink-0">{value}</span>
        </div>
      ))}
    </div>
  );
}
