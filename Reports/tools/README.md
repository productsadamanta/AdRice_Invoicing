# Report generators (Reports/tools)

Both scripts read the Invoicing Hub backup (newest `ArchiveBackups/adrice_backup_*.json` unless `--backup` is given),
write an `.xlsx` with live formulas into `Reports/`, and fill in the cached values so the numbers also show in previews.
Run them from the `Invoicing` folder. Python needs `openpyxl`, `pdfplumber` and `Pillow`.

Before running, export a fresh backup from the Hub ("Zapisz backup") into `ArchiveBackups/`, otherwise the report is based on an older state.

## 1. Full-Month Lead Reconciliation  (`full_month_reconciliation.py`)

Revenue of ONE lead month per advertiser (TrendiSupply, TradeExpress, SmartMediaSolving), explained by invoices and adjustments.

```
python Reports/tools/full_month_reconciliation.py --month 2026-05
```
Output: `Reports/Full_Month_Reconciliation_2026-05.xlsx`

- (A) lead revenue on the month's invoices, (B) adjustments for that month billed on LATER invoices, FINAL = A + B.
- Memo: adjustments for EARLIER months that rode on this month's invoices (not part of FINAL).
- A + B + memo = the "Wartość całkowita" card of the Hub History Center (bridge table on the Summary sheet).
- Sheets: Summary, By country, Invoices, Adjustments, Invoice lines, Adjustment lines, By offer, Notes & checks.
- "Notes & checks": every difference in the top table must be 0.00. The origin tie-out below it is information only
  (reconciliation-tool or reconstructed adjustments may have no matching Hub log).
- Sample: the May 2026 report is reproduced exactly by this script (verified against the delivered file).

## 2. Monthly Invoicing Recap  (`monthly_invoicing_recap.py`)

Explains the QuickBooks statement totals (invoices dated in the month) by invoice, AdRice offer (campaign) and leads.
One workbook: `Summary` + one sheet per advertiser, each with the statement PDF embedded as a picture.

```
python Reports/tools/monthly_invoicing_recap.py --month 2026-05 --statements "trendi may.pdf" "tradeexpress may.pdf" "smartmedia may.pdf"
```
Output: `Reports/Monthly_Invoicing_Recap_2026-05.xlsx`

- The advertiser is recognised from the PDF text (TrendiSupply / TRADEXPERESS / SmartMediaSolving); one PDF per advertiser.
- Every invoice on a statement is matched to the Hub by number. An invoice the Hub does not know (e.g. INV-110 in May 2026)
  becomes a single yellow line without breakdown, so the total still ties to the PDF and the gap stays visible.
- Invoices dated in the month can bill leads of the previous month and carry corrections; both are labelled in the "Category" column.
- The Summary sheet ties each advertiser to the total printed on its PDF (difference must be 0.00).

### Reviewed notes (annotations)
Anything the script cannot know (why a credit exists, what an unknown invoice is) can be written down once in
`Reports/annotations/<YYYY-MM>.json`; the generator picks the file up automatically (or pass `--annotations <file>`):
- `advertiser_notes` -> yellow note box under the title of that advertiser's sheet,
- `resolved_warnings` -> a generated warning containing the given text is shown as "Checked: ..." instead of "ATTENTION: ...",
- `summary_notes` -> extra lines in the Summary notes.
Example: `Reports/annotations/2026-05.json` (explains the credit lines on INV-068).

## 3. Payment Confirmation  (`payment_confirmation_report.py`)

Customer statements (`statements/<company>/<company> MM.YYYY.pdf`) -> invoices -> the bank payments that settled them
(`statements/TransactionHistory.csv`). It does not use the Hub backup.

```
python Reports/tools/payment_confirmation_report.py --company nordiventa
```
Output: `Reports/Payment_Confirmation_nordiventa.xlsx` (add `--png-dir <folder>` to also save the pictures).

- One sheet per statement month: (1) the statement as a picture, (2) one row per payment under each invoice (live formulas
  for totals and the open balance per invoice), (3) a picture of the matching bank rows incl. the Receiving Fee rows.
- The bank picture is rendered from the CSV in the bank's own wording; it is labelled as an extract, not a screenshot.
- Matching: reference naming the invoice(s) -> exact; "inv 289, 290" -> one payment split by invoice amounts; payment without
  reference -> the open invoice with exactly that amount (yellow); a payment refunded by a "refund ra-NNN" debit -> listed under
  "Not related to invoices". Nothing is forced: unmatched payments are printed and listed on the sheet.
- The script stops if a statement's lines do not add up to its printed total and asserts that every payment from the
  company is accounted for (invoice payment, refund or unmatched). Console summary: statement vs bank per month.
- Months are the statement months (invoice date), payments may be dated later. Add a company to `COMPANIES` (name + bank regex);
  the statement layout is assumed to be the same QuickBooks one.

## Shared files
- `report_common.py` - constants (advertiser mapping, countries) and Excel styling.
- `xlsx_formula_cache.py` - evaluates the formulas the reports use and stores the results in the file. It also acts as a check that
  every formula evaluates without errors. This is needed because this machine has no Excel/LibreOffice to recalculate;
  Excel recalculates everything when the file is opened.

## Conventions in the workbooks
Blue = values taken from the Hub or the statements, black = formulas, green = links to another sheet, yellow = needs attention
(no Hub breakdown, amount-only correction, or a real invoice number that can be filled in).
