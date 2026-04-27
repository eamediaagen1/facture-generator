import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppPage, Invoice } from './types';
import { supabase } from './services/supabaseClient';
import { nextInvoiceNumber, nextDevisNumber } from './services/numberingService';
import { getClient } from './services/clientService';
import LoginPage from './LoginPage';
import InvoiceList from './InvoiceList';
import InvoiceForm from './InvoiceForm';
import SettingsPage from './SettingsPage';
import AchatList from './AchatList';
import AchatForm from './AchatForm';
import ClientList from './ClientList';
import ClientForm from './ClientForm';

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

export default function App() {
  const [session,      setSession]      = useState<Session | null>(null);
  const [authReady,    setAuthReady]    = useState(false);
  const [page,         setPage]         = useState<AppPage>({ name: 'list' });
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

  const goList = () => { setPage({ name: 'list' }); setPendingShare(null); };

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

  if (page.name === 'settings') {
    return <SettingsPage onBack={goList} />;
  }

  const goClients = () => setPage({ name: 'clients' });

  if (page.name === 'achats') {
    return (
      <AchatList
        onNew={()       => setPage({ name: 'achat-new' })}
        onEdit={id      => setPage({ name: 'achat-edit', achatId: id })}
        onView={id      => setPage({ name: 'achat-view', achatId: id })}
        onFactures={goList}
        onClients={goClients}
      />
    );
  }

  if (page.name === 'achat-new') {
    return (
      <AchatForm
        mode="new"
        onBack={() => setPage({ name: 'achats' })}
        onSaved={() => setPage({ name: 'achats' })}
      />
    );
  }

  if (page.name === 'achat-edit') {
    return (
      <AchatForm
        mode="edit"
        achatId={page.achatId}
        onBack={() => setPage({ name: 'achats' })}
        onSaved={() => setPage({ name: 'achats' })}
      />
    );
  }

  if (page.name === 'achat-view') {
    return (
      <AchatForm
        mode="view"
        achatId={page.achatId}
        onBack={() => setPage({ name: 'achats' })}
        onSaved={() => setPage({ name: 'achats' })}
      />
    );
  }

  if (page.name === 'clients') {
    return (
      <ClientList
        onNew={()   => setPage({ name: 'client-new' })}
        onEdit={id  => setPage({ name: 'client-edit', clientId: id })}
        onView={id  => setPage({ name: 'client-view', clientId: id })}
        onFactures={goList}
        onAchats={() => setPage({ name: 'achats' })}
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
            : await nextInvoiceNumber();
          setPage({ name: 'new', invoiceNumber: number, docType });
        }}
        onEdit={id       => setPage({ name: 'edit', invoiceId: id })}
        onView={id       => setPage({ name: 'view', invoiceId: id })}
        onPrint={id      => setPage({ name: 'view', invoiceId: id, printOnLoad: true })}
        onSettings={() => setPage({ name: 'settings' })}
        onAchats={() => setPage({ name: 'achats' })}
        onClients={goClients}
        onEmailShare={handleEmailShare}
        onWhatsAppShare={handleWhatsAppShare}
      />
    );
  }

  if (page.name === 'new') {
    return (
      <InvoiceForm
        mode="new"
        invoiceNumber={page.invoiceNumber}
        docType={page.docType}
        onBack={goList}
        onSaved={goList}
      />
    );
  }

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
