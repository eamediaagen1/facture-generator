# Quick Action AI - Scope & Routing Rules

## APPROVED ACTIONS (3 ONLY)

### 1. `create_document`
**Status:** ✅ IMPLEMENTED  
**Trigger keywords:** facture, devis, quote, bon de livraison, BL  
**Route:** InvoiceAIModal → extractInvoiceDraftWithAI() → create facture/devis/BL  
**File:** src/InvoiceAIModal.tsx  
**Backend:** supabase/functions/extract-achat (invoice_draft intent)  

### 2. `import_expenses` (NOT YET IMPLEMENTED)
**Status:** ⏳ Future  
**Trigger keywords:** achat, expense, dépense, receipt, supplier invoice  
**Route:** [Would route to AchatForm or expense upload]  
**Backend:** supabase/functions/extract-achat (existing achat extraction)  
**Reuse:** extractAchatFromFile() from achatAIService  

### 3. `upload_bank_statement` (NOT YET IMPLEMENTED)
**Status:** ⏳ Future  
**Trigger keywords:** bank statement, relevé bancaire, bank, releve  
**Route:** [Would route to BankStatements upload]  
**Backend:** supabase/functions/extract-bank-statement (if available)  
**Reuse:** Existing bank statement import logic  

---

## FORBIDDEN ACTIONS

❌ Booking  
❌ Prepare booking  
❌ Any other actions not in the 3 approved list  

---

## ROUTING LOGIC (IF EXPANDED TO MULTI-ACTION)

```
User input prompt:
  ↓
[1] Check for keywords:
  - Bank statement keywords? → upload_bank_statement
  - Expense/achat keywords? → import_expenses
  - Document keywords? → create_document
  - No match or ambiguous? → Ask user
  ↓
[2] Route to appropriate handler:
  - create_document: InvoiceAIModal
  - import_expenses: [Future expense modal]
  - upload_bank_statement: [Future bank modal]
  ↓
[3] Reuse existing backend/frontend logic
  - No duplicate extraction code
  - No new databases
  - No changes to core logic
```

---

## FILE UPLOAD HANDLING

**If file uploaded with no text:**
```
Show user choice:
"What is this document?
  ☐ Bank statement (relevé bancaire)
  ☐ Expense / Supplier invoice (achat)
  ☐ Document to create (facture/devis)"
```

**OR** infer from file content if backend already supports it safely.

---

## CURRENT IMPLEMENTATION STATUS

### ✅ IMPLEMENTED
- `create_document` via "Create with AI" button
- Feature flag: ENABLE_AI_DOCUMENT_CREATION
- Scoped to document creation only
- Reuses existing client linking & numbering

### ❌ NOT IMPLEMENTED (And will not be without explicit request)
- Multi-action dashboard widget
- Bank statement upload via AI
- Expense import via AI
- File upload handling
- Booking or any other actions

---

## REVERSIBILITY CHECKLIST

✅ One-line config flag to disable  
✅ No core logic modifications  
✅ No new database tables  
✅ No changes to existing routes  
✅ Easy to remove (delete InvoiceAIModal.tsx + config.ts)  
✅ All backend logic is reused, not duplicated  

---

## TO EXPAND LATER (If needed)

If you want to add actions #1 or #2:
1. Create new modal components (AchatAIModal, BankStatementAIModal)
2. Add a routing component (QuickActionAIRouter or main dashboard modal)
3. Use ENABLE_AI_DOCUMENT_CREATION pattern for each
4. Reuse existing backend functions
5. No new database or schema changes

**Do NOT:**
- Add booking logic
- Create duplicate extraction functions
- Modify core invoice/achat/bank logic
- Change Supabase schemas or RLS policies
