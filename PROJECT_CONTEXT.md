# PROJECT CONTEXT — Invoicer (AMOR AMENAGEMENT)

## What it does
Single-user invoice and devis (quote) generator for the company **AMOR AMENAGEMENT**.
Deployed on Netlify. Auth and data stored in Supabase.
Users can create, edit, view, and print/PDF Factures (FAC-YYYY-NNNN) and Devis (DEV-YYYY-NNNN).

---

## Tech Stack

| Layer | Library / Tool |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS v3 (JIT) |
| Backend / Auth / DB | Supabase (Postgres + Auth) |
| Icons | lucide-react |
| Deployment | Netlify (static) |

---

## Folder Structure

```
src/
  App.tsx                   — root router + auth gate
  LoginPage.tsx             — email/password login (no signup)
  InvoiceList.tsx           — list of all factures + devis, metrics, filters
  InvoiceForm.tsx           — shared form for new/edit/view + print/PDF
  SettingsPage.tsx          — admin: reset numbering counters
  types.ts                  — all shared TypeScript types
  numberToWords.ts          — converts totals to French words
  storage.ts                — unused legacy (localStorage), safe to ignore
  index.css                 — Tailwind + @media print rules
  assets/
    logo.png                — optional company logo (drop here to enable)
  services/
    supabaseClient.ts       — createClient, throws if env vars missing
    authService.ts          — signIn(), signOut()
    factureService.ts       — CRUD for factures table (both facture + devis)
    numberingService.ts     — nextInvoiceNumber(), nextDevisNumber(), resetFactureCounter()
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |

Set in `.env.local` (Vite only reads this file in dev, not `.env.example`).

---

## Routing

No react-router-dom. State-based routing via `AppPage` discriminated union in `App.tsx`:

```ts
type AppPage =
  | { name: 'list' }
  | { name: 'new'; invoiceNumber: string; docType: DocumentType }
  | { name: 'edit'; invoiceId: string }
  | { name: 'view'; invoiceId: string; printOnLoad?: boolean }
  | { name: 'settings' };
```

`App.tsx` renders the right component based on `page.name`. `goList()` resets to `{ name: 'list' }`.

---

## Key Types (`src/types.ts`)

```ts
type DocumentType = 'facture' | 'devis';

type InvoiceStatus =
  | 'Brouillon'                              // draft, never saved
  | 'Générée' | 'Envoyée' | 'Payée' | 'Annulée'  // facture statuses
  | 'Envoyé'  | 'Accepté' | 'Refusé';              // devis statuses

interface Invoice {
  id, number, client, date, items, tvaRate,
  totalHT, tvaAmount, totalTTC,
  status: InvoiceStatus,
  documentType: DocumentType,
  createdAt
}

interface LineItem { id, designation, quantity, unitPrice }
```

---

## Database Schema (Supabase)

### Table: `factures`
Stores both factures and devis (distinguished by `document_type`).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | client-generated via `crypto.randomUUID()` |
| number | TEXT UNIQUE | FAC-2026-0001 or DEV-2026-0001 |
| document_type | TEXT | `'facture'` (default) or `'devis'` |
| client | TEXT | multi-line string |
| date | DATE | |
| items | JSONB | array of LineItem |
| tva_rate | INTEGER | always 20 |
| total_ht, tva_amount, total_ttc | NUMERIC | |
| status | TEXT | one of InvoiceStatus values |
| created_at, updated_at | TIMESTAMPTZ | |

### Table: `facture_counter`
`(year INTEGER PK, seq INTEGER)` — one row per year for FAC numbering.

### Table: `devis_counter`
Same structure — one row per year for DEV numbering.

### RPC Functions
| Function | Returns | Purpose |
|---|---|---|
| `next_facture_number()` | TEXT | atomic FAC-YYYY-NNNN, auto-increments seq |
| `next_devis_number()` | TEXT | atomic DEV-YYYY-NNNN |
| `reset_facture_counter(p_year, p_start_from)` | VOID | resets FAC counter (admin) |

All use `INSERT … ON CONFLICT DO UPDATE`, `SECURITY DEFINER`, RLS enabled.

---

## Key Components

### `InvoiceForm.tsx`
- Props: `mode ('new'|'edit'|'view')`, `invoiceNumber?`, `invoiceId?`, `docType?`, `printOnLoad?`
- `docType` state initialized from prop, overwritten from DB when loading edit/view
- Header badge shows "Facture N°" or "Devis N°" based on `docType`
- First save: status auto-set to `'Générée'` (facture) or `'Envoyé'` (devis)
- Print/PDF: `window.print()` + `document.title` trick for PDF filename
- Dual layout: desktop table (`hidden sm:block print:block`) + mobile cards (`sm:hidden no-print`)
- Logo: `import.meta.glob('./assets/logo.png', { eager: true, query: '?url' })` — returns `null` if file absent, falls back to text

### `InvoiceList.tsx`
- Loads all documents (factures + devis) from `factures` table
- `NewDocMenu` dropdown → triggers `onNew('facture')` or `onNew('devis')`
- `StatusBadge`: portal-based dropdown (avoids overflow clipping), shows FACTURE_STATUSES or DEVIS_STATUSES based on `inv.documentType`
- Metrics: total count, chiffre d'affaires (non-annulé), payées count, en-attente count
- Filters: text search, status filter (ALL_STATUSES), year filter

### `SettingsPage.tsx`
- Form: year + startFrom inputs → calls `resetFactureCounter(year, startFrom)` via Supabase RPC
- Warns about duplicate risk; system skips duplicates automatically in `nextInvoiceNumber()`

---

## Key Services

### `numberingService.ts`
- `nextInvoiceNumber()` / `nextDevisNumber()`: calls RPC, then checks if number already exists in `factures` table — loops up to 20× to skip duplicates (handles post-reset collisions)
- `resetFactureCounter(year, startFrom)`: calls `reset_facture_counter` RPC

### `factureService.ts`
- `toInvoice(row)`: snake_case DB → camelCase TypeScript (maps `document_type` → `documentType`)
- `toRow(inv)`: camelCase → snake_case for DB writes
- `upsertFacture`: uses `onConflict: 'id'` — insert on first save, update on subsequent saves
- `updateStatus`: optimistic update pattern in InvoiceList

---

## Print / PDF

- `@page { size: A4; margin: 0 }` in `index.css` — suppresses browser header/footer
- `html, body { margin: 0; print-color-adjust: exact }` in print media
- `.inv-spacing` forces `width: 100%; min-height: 297mm` in print
- `.no-print { display: none !important }` — hides toolbar and mobile cards
- `print:block` on desktop table — always renders in print regardless of screen
- `document.title = 'AMOR AMENAGEMENT - FAC-YYYY-NNNN'` before `window.print()` → browser uses this as PDF filename

---

## Coding Patterns

- **No routing library** — discriminated union `AppPage` + `useState` in App.tsx
- **Upsert pattern** — client generates UUID, same `upsertFacture` call for create and update
- **Stable IDs** — `useRef<string>(invoiceId ?? uid())` prevents StrictMode double-generate
- **Optimistic updates** — `setInvoices` before await, rollback via `load()` on error
- **Portal dropdowns** — `createPortal` + `getBoundingClientRect` for status badge (avoids `overflow: hidden` clipping)
- **camelCase ↔ snake_case** — explicit mappers `toInvoice`/`toRow`, never let Supabase snake_case leak into components
- **Logo optional** — `import.meta.glob` at module level, `LOGO_URL = null` if file absent
- **Devis/Facture on one table** — `document_type` column distinguishes them; both numbering counters are separate tables
