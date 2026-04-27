import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppPage, Invoice } from './types';
import { supabase } from './services/supabaseClient';
import { nextInvoiceNumber, nextDevisNumber, nextBonLivraisonNumber } from './services/numberingService';
import { getClient } from './services/clientService';
import LoginPage from './LoginPage';
import InvoiceList from './InvoiceList';
import InvoiceForm from './InvoiceForm';
import SettingsPage from './SettingsPage';
import AchatList from './AchatList';
import AchatForm from './AchatForm';
import ClientList from './ClientList';
import ClientForm from './ClientForm';
import Dashboard from './Dashboard';
import BankStatements from './BankStatements';
import Reports from './Reports';
import AppLayout, { type NavSection } from './components/layout/AppLayout';

function Spinner() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
    </div>
  );
}

type PendingShare = {
  type: 'email' | 'whatsapp';
  email?: string;
  phone?: string;
  invoiceNum: string;
  totalTTC: number;
};

function getNavSection(page: AppPage): NavSection {
  const n = page.name;
  if (n === 'dashboard') return 'dashboard';
  if (n === 'list' || n === 'new' || n === 'edit' || n === 'view') return 'list';
  if (n === 'achats' || n === 'achat-new' || n === 'achat-edit' || n === 'achat-view') return 'achats';
  if (n === 'clients' || n === 'client-new' || n === 'client-edit' || n === 'client-view') return 'clients';
  if (n === 'bank-statements') return 'bank-statements';
  if (n === 'reports') return 'reports';
  return 'settings';
}

export default function App() {
  const [session,      setSession]      = useState<Session | null>(null);
  const [authReady,    setAuthReady]    = useState(false);
  const [page,         setPage]         = useState<AppPage>({ name: 'dashboard' });
  const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setAuthReady(true);
      })
      .catch(() => setAuthReady(true));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!authReady) return <Spinner />;
  if (!session)   return <LoginPage />;

  const goList            = () => { setPage({ name: 'list' });            setPendingShare(null); };
  const goDashboard       = () => { setPage({ name: 'dashboard' });       setPendingShare(null); };
  const goAchats          = () => setPage({ name: 'achats' });
  const goClients         = () => setPage({ name: 'clients' });
  const goSettings        = () => setPage({ name: 'settings' });
  const goBankStatements  = () => setPage({ name: 'bank-statements' });
  const goReports         = () => setPage({ name: 'reports' });

  async function handleEmailShare(inv: Invoice) {
    let email: string | undefined;
    if (inv.clientId) {
      const c = await getClient(inv.clientId);
      email = c?.email || undefined;
    }
    setPendingShare({ type: 'email', email, invoiceNum: inv.number, totalTTC: inv.totalTTC });
    setPage({ name: 'view', invoiceId: inv.id, printOnLoad: true });
  }

  async function handleWhatsAppShare(inv: Invoice) {
    let phone: string | undefined;
    if (inv.clientId) {
      const c = await getClient(inv.clientId);
      phone = c?.phone || undefined;
    }
    setPendingShare({ type: 'whatsapp', phone, invoiceNum: inv.number, totalTTC: inv.totalTTC });
    setPage({ name: 'view', invoiceId: inv.id, printOnLoad: true });
  }

  // Suppress unused-variable warning — kept for future email/WA feature restoration
  void handleEmailShare;
  void handleWhatsAppShare;

  function renderPage() {
    if (page.name === 'dashboard') {
      return (
        <Dashboard
          onGoList={goList}
          onGoAchats={goAchats}
          onNewDoc={async (docType) => {
            const number = docType === 'devis'
              ? await nextDevisNumber()
              : docType === 'bon_livraison'
              ? await nextBonLivraisonNumber()
              : await nextInvoiceNumber();
            setPage({ name: 'new', invoiceNumber: number, docType });
          }}
        />
      );
    }

    if (page.name === 'settings') {
      return <SettingsPage />;
    }

    if (page.name === 'bank-statements') {
      return <BankStatements />;
    }

    if (page.name === 'reports') {
      return <Reports />;
    }

    if (page.name === 'achats') {
      return (
        <AchatList
          onNew={()  => setPage({ name: 'achat-new' })}
          onEdit={id => setPage({ name: 'achat-edit', achatId: id })}
          onView={id => setPage({ name: 'achat-view', achatId: id })}
        />
      );
    }

    if (page.name === 'achat-new') {
      return (
        <AchatForm
          mode="new"
          onBack={goAchats}
          onSaved={goAchats}
        />
      );
    }

    if (page.name === 'achat-edit') {
      return (
        <AchatForm
          mode="edit"
          achatId={page.achatId}
          onBack={goAchats}
          onSaved={goAchats}
        />
      );
    }

    if (page.name === 'achat-view') {
      return (
        <AchatForm
          mode="view"
          achatId={page.achatId}
          onBack={goAchats}
          onSaved={goAchats}
        />
      );
    }

    if (page.name === 'clients') {
      return (
        <ClientList
          onNew={()  => setPage({ name: 'client-new' })}
          onEdit={id => setPage({ name: 'client-edit', clientId: id })}
          onView={id => setPage({ name: 'client-view', clientId: id })}
        />
      );
    }

    if (page.name === 'client-new') {
      return (
        <ClientForm
          mode="new"
          onBack={goClients}
          onSaved={id => setPage({ name: 'client-view', clientId: id })}
          onView={id  => setPage({ name: 'client-view', clientId: id })}
          onEdit={id  => setPage({ name: 'client-edit', clientId: id })}
        />
      );
    }

    if (page.name === 'client-edit') {
      return (
        <ClientForm
          mode="edit"
          clientId={page.clientId}
          onBack={goClients}
          onSaved={id => setPage({ name: 'client-view', clientId: id })}
          onView={id  => setPage({ name: 'client-view', clientId: id })}
          onEdit={id  => setPage({ name: 'client-edit', clientId: id })}
        />
      );
    }

    if (page.name === 'client-view') {
      return (
        <ClientForm
          mode="view"
          clientId={page.clientId}
          onBack={goClients}
          onSaved={id => setPage({ name: 'client-view', clientId: id })}
          onView={id  => setPage({ name: 'client-view', clientId: id })}
          onEdit={id  => setPage({ name: 'client-edit', clientId: id })}
        />
      );
    }

    if (page.name === 'list') {
      return (
        <InvoiceList
          onNew={async (docType) => {
            const number = docType === 'devis'
              ? await nextDevisNumber()
              : docType === 'bon_livraison'
              ? await nextBonLivraisonNumber()
              : await nextInvoiceNumber();
            setPage({ name: 'new', invoiceNumber: number, docType });
          }}
          onCreateBL={async (inv) => {
            const number = await nextBonLivraisonNumber();
            setPage({
              name: 'new',
              invoiceNumber: number,
              docType: 'bon_livraison',
              prefill: { client: inv.client, clientId: inv.clientId, items: inv.items, sourceDocumentId: inv.id },
            });
          }}
          onEdit={id  => setPage({ name: 'edit', invoiceId: id })}
          onView={id  => setPage({ name: 'view', invoiceId: id })}
          onPrint={id => setPage({ name: 'view', invoiceId: id, printOnLoad: true })}
        />
      );
    }

    if (page.name === 'new') {
      return (
        <InvoiceForm
          mode="new"
          invoiceNumber={page.invoiceNumber}
          docType={page.docType}
          prefill={page.prefill}
          onBack={goList}
          onSaved={goList}
        />
      );
    }

    // edit / view
    return (
      <InvoiceForm
        mode={page.name}
        invoiceId={page.invoiceId}
        printOnLoad={page.name === 'view' ? page.printOnLoad : undefined}
        pendingShare={pendingShare ?? undefined}
        onShareOpened={() => setPendingShare(null)}
        onBack={goList}
        onSaved={goList}
      />
    );
  }

  return (
    <AppLayout
      active={getNavSection(page)}
      onDashboard={goDashboard}
      onList={goList}
      onAchats={goAchats}
      onClients={goClients}
      onBankStatements={goBankStatements}
      onReports={goReports}
      onSettings={goSettings}
    >
      {renderPage()}
    </AppLayout>
  );
}
