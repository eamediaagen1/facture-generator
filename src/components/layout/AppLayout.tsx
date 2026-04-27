import { type ReactNode } from 'react';
import {
  LayoutDashboard, FileText, ShoppingCart, Users, Settings, LogOut,
  Landmark, BarChart2,
} from 'lucide-react';
import { signOut } from '../../services/authService';

export type NavSection =
  | 'dashboard' | 'list' | 'achats' | 'clients'
  | 'bank-statements' | 'reports' | 'settings';

interface Props {
  active:           NavSection;
  onDashboard:      () => void;
  onList:           () => void;
  onAchats:         () => void;
  onClients:        () => void;
  onBankStatements: () => void;
  onReports:        () => void;
  onSettings:       () => void;
  children:         ReactNode;
}

const NAV = [
  { key: 'dashboard'       as const, label: 'Dashboard',        short: 'Home',     Icon: LayoutDashboard },
  { key: 'list'            as const, label: 'Factures & Devis',  short: 'Factures', Icon: FileText        },
  { key: 'achats'          as const, label: 'Achats',            short: 'Achats',   Icon: ShoppingCart    },
  { key: 'clients'         as const, label: 'Clients',           short: 'Clients',  Icon: Users           },
  { key: 'bank-statements' as const, label: 'Relevés bancaires', short: 'Banque',   Icon: Landmark        },
  { key: 'reports'         as const, label: 'Rapports',          short: 'Rapports', Icon: BarChart2       },
];

export default function AppLayout({
  active, onDashboard, onList, onAchats, onClients,
  onBankStatements, onReports, onSettings, children,
}: Props) {
  const handlers: Record<NavSection, () => void> = {
    'dashboard':       onDashboard,
    'list':            onList,
    'achats':          onAchats,
    'clients':         onClients,
    'bank-statements': onBankStatements,
    'reports':         onReports,
    'settings':        onSettings,
  };

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-slate-200 fixed top-0 left-0 bottom-0 z-30 print:hidden">

        {/* Brand */}
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide leading-tight">
              AMOR<br />AMENAGEMENT
            </span>
          </div>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ key, label, Icon }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={handlers[key]}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Bottom: settings + logout */}
        <div className="px-3 py-3 border-t border-slate-100 space-y-0.5 shrink-0">
          <button
            onClick={onSettings}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              active === 'settings'
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            Paramètres
          </button>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-all"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="lg:ml-56 flex flex-col min-h-screen">

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm print:hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                AMOR AMENAGEMENT
              </span>
            </div>
            <button
              onClick={() => signOut()}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
              title="Déconnexion"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content — pb leaves room for mobile bottom nav */}
        <main className="flex-1 pb-16 lg:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav (scrollable) ──────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 print:hidden overflow-x-auto">
        <div className="flex min-w-max">
          {[...NAV, { key: 'settings' as const, label: 'Paramètres', short: 'Params', Icon: Settings }].map(
            ({ key, short, Icon }) => {
              const isActive = active === key;
              return (
                <button
                  key={key}
                  onClick={handlers[key]}
                  className={`w-16 flex flex-col items-center gap-0.5 py-2 transition-colors shrink-0 ${
                    isActive ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                    {short}
                  </span>
                </button>
              );
            },
          )}
        </div>
      </nav>
    </div>
  );
}
