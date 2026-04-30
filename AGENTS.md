# AGENTS.md

Guidance for Codex agents working in this repository.

This is a React/Vite/Supabase invoicing and finance app for AMOR AMENAGEMENT. Make small, scoped changes. Prefer existing patterns over new abstractions. Do not modify files outside the assigned task.

## Project Structure

- `src/main.tsx`: React entry point.
- `src/App.tsx`: auth gate and state-based routing. There is no `react-router-dom`.
- `src/types.ts`: shared domain types and app page union.
- `src/index.css`: Tailwind base plus print/PDF capture CSS. Treat print rules as high risk.
- `src/ui.tsx`: shared UI primitives used by list/data pages.
- `src/components/layout/AppLayout.tsx`: authenticated app shell, desktop sidebar, mobile navigation.
- `src/services/`: Supabase client, CRUD, storage, numbering, import/export, PDF, and Edge Function callers.
- `src/assets/`: company logo and stamp assets.
- `supabase/functions/`: Supabase Edge Functions for AI extraction.
- `supabase-schema.sql`: schema reference. It may be incomplete compared with the current app.
- `dist/`: generated build output. Do not edit by hand.
- `node_modules/`: installed dependencies. Never edit.

Main product surfaces:

- Dashboard: `src/Dashboard.tsx`
- Factures, devis, bons de livraison: `src/InvoiceList.tsx`, `src/InvoiceForm.tsx`
- Achats: `src/AchatList.tsx`, `src/AchatForm.tsx`, `src/AchatImportModal.tsx`, `src/AchatAIModal.tsx`
- Clients: `src/ClientList.tsx`, `src/ClientForm.tsx`
- Bank statements: `src/BankStatements.tsx`
- Reports: `src/Reports.tsx`
- Settings/import/export/counters: `src/SettingsPage.tsx`, `src/services/exportService.ts`

## Commands

Use npm.

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run preview
```

Expected verification:

- Run `npm run typecheck` for any TypeScript or React change.
- Run `npm run lint` for any source change.
- Run `npm run build` before release or when changing Vite/config/assets/build behavior.
- For visual changes, run the app and manually check affected desktop and mobile layouts.
- For invoice/PDF/print changes, manually verify the invoice preview, print mode, and generated PDF behavior.

If a command fails because of pre-existing issues, state that clearly in the final response and include the relevant errors. Do not hide failing checks.

## Coding Rules

- Use TypeScript strict-mode patterns. Do not introduce `any` unless there is no practical alternative.
- Keep DB rows in snake_case inside service mappings and camelCase in React/domain types.
- Keep Supabase access inside `src/services/*` or Edge Functions. Components should call service functions rather than raw Supabase queries.
- Keep the current state-based routing in `App.tsx`; do not add a router unless explicitly requested.
- Use local React state and existing hooks patterns. There is no global store.
- Preserve client-generated UUID patterns using `crypto.randomUUID()` and stable `useRef` IDs in forms.
- Preserve optimistic update patterns where already used, and make rollback/reload behavior explicit.
- Use `lucide-react` icons for UI actions.
- Keep comments sparse and useful.
- Do not edit `.env.local`, secrets, `node_modules`, or generated `dist` files.

## Design Rules

- Use Tailwind CSS and existing visual language: slate base, white cards, subtle borders, restrained accent colors.
- Prefer shared primitives from `src/ui.tsx` for page containers, metric cards, table action buttons, loading, empty, and error states.
- Use responsive Tailwind breakpoints. Existing list pages generally use desktop tables and mobile cards.
- Keep primary actions as icon plus short text where space allows; use icon-only action buttons for table rows.
- Maintain minimum touch targets for mobile actions.
- Avoid text overflow. Use `truncate`, wrapping, or responsive layout changes for long client/supplier/document names.
- Do not change print CSS casually. Invoice print/PDF layout depends on `@page`, `.invoice-page`, `.inv-spacing`, `.no-print`, `.inv-field`, and `body.pdf-capturing`.
- Keep app screens operational and dense. Do not add marketing/landing-page sections.

## Safety Rules

High-risk areas:

- `src/InvoiceForm.tsx`
- `src/InvoiceList.tsx`
- `src/services/factureService.ts`
- `src/services/numberingService.ts`
- `src/services/pdfService.ts`
- `src/index.css`
- `src/SettingsPage.tsx`
- `src/services/exportService.ts`
- `supabase/functions/*`
- `supabase-schema.sql`

Special care:

- Invoice numbering is business-critical. Do not change FAC/DEV/BL numbering, reset logic, or RPC names unless assigned.
- Invoice save, status transitions, devis-to-facture conversion, BL creation, PDF upload, and print behavior are tightly coupled.
- Backup import uses upsert and can overwrite records by ID. Treat import/export changes as data-risk changes.
- Edge Functions use `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY`. Never expose secrets or log sensitive document content.
- Storage delete/upload logic can orphan or remove files. Review bucket names and paths carefully.
- Auth is Supabase email/password. Do not add signup, anonymous access, or bypass auth unless assigned.
- RLS/storage policies are not fully represented in this repo. Do not assume schema changes are safe without migration notes.

Before destructive changes:

- Do not delete records, files, buckets, schema objects, or migrations unless the task explicitly requires it.
- Do not use `git reset --hard`, `git checkout --`, or similar destructive git operations unless explicitly requested.
- Do not revert unrelated changes in the worktree.

## Agent Ownership

Each agent should work on one task only. Keep write scope narrow.

### Product Manager Agent

Allowed to edit:

- `PROJECT_CONTEXT.md`
- planning/spec Markdown files
- issue/task documents

Must never edit:

- `src/services/*`
- `supabase/*`
- `.env*`
- package files
- generated files

Required checks:

- Confirm scope, non-goals, acceptance criteria, affected files, manual QA.

### UI/UX Agent

Allowed to edit:

- Relevant `src/*.tsx` page/component files
- `src/ui.tsx`
- `src/components/layout/*`
- Non-print portions of `src/index.css`

Must never edit:

- `src/services/*`
- `supabase/*`
- `.env*`
- numbering/PDF service logic
- print CSS unless explicitly assigned

Required checks:

- `npm run typecheck`
- `npm run lint`
- Manual desktop/mobile review of affected screens.

### Frontend Agent

Allowed to edit:

- Relevant React files in `src/*.tsx`
- `src/types.ts` when type changes are required
- `src/ui.tsx` when shared UI changes are required

Must never edit:

- `supabase/functions/*`
- `supabase-schema.sql`
- `.env*`
- dependency versions unless assigned

Required checks:

- `npm run typecheck`
- `npm run lint`
- Manual QA of affected workflow.

### Backend/Supabase Agent

Allowed to edit:

- `src/services/*`
- `supabase/functions/*`
- `supabase-schema.sql`
- `src/types.ts` if service contracts change

Must never edit:

- Large UI rewrites
- `.env.local`
- generated files

Required checks:

- `npm run typecheck`
- Review database field mappings.
- Document required Supabase migration, bucket, RLS, or secret changes.

### Database Agent

Allowed to edit:

- SQL/schema/migration files
- documentation describing DB setup

Must never edit:

- UI components
- Edge Function business logic
- `.env*`

Required checks:

- Explain forward migration and rollback.
- Verify table/column names match `src/services/*`.
- Review RLS and storage policy implications.

### QA/Test Agent

Allowed to edit:

- Test files and test configuration, if a test framework exists or is part of the assigned task
- QA documentation

Must never edit:

- Product logic unless explicitly assigned
- Supabase schema/functions unless explicitly assigned

Required checks:

- `npm run typecheck`
- `npm run lint`
- `npm run build` when release-facing
- Focused manual regression checklist.

### Code Review Agent

Allowed to edit:

- Nothing by default. Review only unless asked to fix.

Must check:

- Data loss risk
- Auth/security regressions
- Storage bucket/path regressions
- Invoice numbering and status behavior
- Print/PDF behavior
- Missing typecheck/lint/build evidence

### Release Manager Agent

Allowed to edit:

- Release notes/checklists
- package metadata only if assigned

Must never edit:

- Feature code
- Schema/function logic
- `.env*`

Required checks:

- Confirm branch, changed files, check results, manual QA, migration notes, rollback plan.

## Completion Checklist

Before any change is complete:

1. Confirm only assigned files were changed.
2. Run `git status --short` and mention unrelated pre-existing changes if present.
3. Run required commands for the change scope.
4. For UI work, manually check affected responsive states.
5. For invoice work, verify create/edit/view/print/PDF behavior as applicable.
6. For Supabase work, document required remote setup: migrations, RPCs, buckets, RLS, secrets.
7. Report any failing checks with exact error summaries.
8. Do not claim success for checks that were not run.

## Known Current Gaps

- No automated test suite is present.
- `supabase-schema.sql` appears older than the current app surface.
- Email sending is a placeholder service.
- The repo may have pre-existing worktree changes. Do not revert them unless explicitly requested.
