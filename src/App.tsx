import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppPage } from './types';
import { supabase } from './services/supabaseClient';
import { nextInvoiceNumber } from './services/numberingService';
import LoginPage from './LoginPage';
import InvoiceList from './InvoiceList';
import InvoiceForm from './InvoiceForm';

function Spinner() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const [session,     setSession]     = useState<Session | null>(null);
  const [authReady,   setAuthReady]   = useState(false);
  const [page,        setPage]        = useState<AppPage>({ name: 'list' });

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

  const goList = () => setPage({ name: 'list' });

  if (page.name === 'list') {
    return (
      <InvoiceList
        onNew={async () => {
          const number = await nextInvoiceNumber();
          setPage({ name: 'new', invoiceNumber: number });
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
      onBack={goList}
      onSaved={goList}
    />
  );
}
