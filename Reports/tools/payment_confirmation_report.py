#!/usr/bin/env python
"""Payment confirmation report per customer: monthly statement (PDF) -> invoices -> payments in the bank file.

One workbook, one sheet per statement month. Every sheet has three parts:
  1. the statement as issued (picture of the PDF),
  2. every invoice of the statement broken down into the bank payments that settled it (live formulas),
  3. a picture of the matching rows of the bank file (TransactionHistory.csv) as proof that the money arrived.

Payment -> invoice matching (in this order):
  a. a reference that names invoice numbers ("INV-305 part 1", "inv 289, 290") -> that invoice(s); a payment naming
     several invoices must equal the sum of what is still open on them,
  b. a payment without any reference -> the one open invoice with exactly the same amount (marked yellow),
  c. a payment that was refunded ("refund ra-626" debit in the bank file) -> not an invoice payment, shown separately.
Anything that cannot be matched is listed in the sheet instead of being forced onto an invoice.

Usage (from anywhere):
    python Reports/tools/payment_confirmation_report.py --company nordiventa
Optional: --bank <TransactionHistory.csv>, --out <file.xlsx>, --png-dir <folder> (also save the pictures)
Needs openpyxl, pdfplumber and Pillow. Statements: statements/<company>/<company> MM.YYYY.pdf
"""
import argparse
import calendar
import collections
import csv
import datetime as dt
import glob
import io
import math
import os
import re
import sys
from decimal import Decimal as D

import pdfplumber
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Font
from openpyxl.worksheet.properties import PageSetupProperties
from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import xlsx_formula_cache  # noqa: E402
from report_common import *  # noqa: E402,F401,F403

# ---------------------------------------------------------------- configuration
COMPANIES = {
    "nordiventa": dict(name="NORDIVENTA OÜ", bank_re=r"NORDIVENTA"),
}
BANK_COLS = [("Date (MM/DD/YYYY)", "*Date (MM/DD/YYYY)", "l"), ("Time (UTC+0)", "Time (UTC+0)", "l"),
             ("Type", "Type", "l"), ("Currency", "Currency", "l"), ("*Amount", "*Amount", "r"),
             ("Description", "Description", "l"), ("Transaction ID", "Transaction ID", "l"),
             ("Reference", "Reference", "l")]
f_grey = Font(name=F, size=10, color="808080")
STATEMENT_W = 700      # display width of the statement picture in the sheet (px)
BANK_SCALE = 0.85      # display scale of the bank extract picture
ROW_PX = 20            # one default row (15 pt) in px


def money(d):
    return "{:,.2f}".format(d)


def dstr(d):
    return d.strftime("%d.%m.%Y")


# ---------------------------------------------------------------- statements
def parse_statement(path):
    with pdfplumber.open(path) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
        pages = []
        for page in pdf.pages:
            im = page.to_image(resolution=130).original.convert("RGB")
            diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L")
            bbox = diff.point(lambda p: 255 if p > 12 else 0).getbbox()
            if bbox:  # skip blank pages
                pages.append((im, bbox))
    # one common left/right edge, so a continuation page keeps its horizontal position under page 1
    m = 14
    cx0 = max(0, min(b[0] for _, b in pages) - m)
    cx1 = min(pages[0][0].width, max(b[2] for _, b in pages) + m)
    parts = [im.crop((cx0, max(0, b[1] - m), cx1, min(im.height, b[3] + m))) for im, b in pages]
    w = max(p.width for p in parts)
    sheet = Image.new("RGB", (w, sum(p.height for p in parts)), (255, 255, 255))
    y = 0
    for p in parts:
        sheet.paste(p, (0, y))
        y += p.height
    lines = []
    for m in re.finditer(r"(\d\d)/(\d\d)/(\d{4}) Invoice No\.(INV-?\d+) ([\d,]+\.\d\d) ([\d,]+\.\d\d)", text):
        d, mo, yr, no, amt, rcv = m.groups()
        lines.append(dict(date=dt.date(int(yr), int(mo), int(d)), no=re.sub(r"INV-?", "INV-", no),
                          amount=D(amt.replace(",", "")), received=D(rcv.replace(",", ""))))
    tot = re.search(r"EUR ([\d,]+\.\d\d)\s+EUR ([\d,]+\.\d\d)", text)
    if not (lines and tot):
        raise SystemExit("Statement not parsed (no invoice lines or total): %s" % path)
    no = re.search(r"STATEMENT NO\.\s*(\d+)", text)
    sd = re.search(r"DATE\s+(\d\d)/(\d\d)/(\d{4})", text)
    buf = io.BytesIO()
    sheet.save(buf, "PNG", optimize=True)
    st = dict(path=path, lines=lines, total=D(tot.group(1).replace(",", "")), received=D(tot.group(2).replace(",", "")),
              number=no.group(1) if no else "", png=buf.getvalue(), size=sheet.size,
              date=dt.date(int(sd.group(3)), int(sd.group(2)), int(sd.group(1))) if sd else None)
    if sum(l["amount"] for l in lines) != st["total"] or sum(l["received"] for l in lines) != st["received"]:
        raise SystemExit("Statement lines do not add up to the printed totals: %s" % path)
    return st


# ---------------------------------------------------------------- bank file
def load_bank(path, bank_re):
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig", newline="")))
    for r in rows:
        r["_ts"] = dt.datetime.strptime(r["*Date (MM/DD/YYYY)"] + " " + r["Time (UTC+0)"], "%m/%d/%Y %H:%M:%S")
        r["_amt"] = D(r["*Amount"])
    ids = {r["Transaction ID"] for r in rows if re.search(bank_re, r["Description"] + " " + (r["Beneficiary"] or ""), re.I)}
    txns = {}
    for r in rows:
        if r["Transaction ID"] in ids:
            txns.setdefault(r["Transaction ID"], []).append(r)
    out = []
    for tid, rs in txns.items():
        rs.sort(key=lambda r: 0 if r["Description"].startswith(("Payment", "Transfer")) else 1)
        main = rs[0]
        kind = "payment" if main["Type"] == "Credit" and main["Description"].startswith("Payment") else \
            "debit" if main["Type"] == "Debit" else "other"
        out.append(dict(id=tid, rows=rs, main=main, kind=kind, ts=main["_ts"], amount=main["_amt"], ref=main["Reference"].strip()))
    out.sort(key=lambda t: (t["ts"], t["id"]))
    return rows, out


# ---------------------------------------------------------------- matching
def match(invoices, txns):
    """Fill invoices[no]['allocs']; return (refunds, unmatched). refunds = [(payment txn, refund txn)]."""
    for inv in invoices.values():
        inv["allocs"] = []

    def open_amt(no):
        return invoices[no]["amount"] - sum(a["amount"] for a in invoices[no]["allocs"])

    pays = [t for t in txns if t["kind"] == "payment"]
    debits = [t for t in txns if t["kind"] == "debit"]
    refunds, unmatched, rest = [], [], []
    # c. refunded payments
    for p in pays:
        tok = re.findall(r"ra-\d+", p["ref"], re.I)
        ref_tx = next((d for d in debits if tok and any(t.lower() in d["ref"].lower() for t in tok)), None)
        if ref_tx:
            refunds.append((p, ref_tx))
        else:
            rest.append(p)
    # a. references that name invoices
    todo = []
    for p in rest:
        nums = [("INV-%s" % n) for n in re.findall(r"(?<!\d)(\d{3,4})(?!\d)", p["ref"]) if ("INV-%s" % n) in invoices]
        nums = list(dict.fromkeys(nums))
        if len(nums) == 1:
            invoices[nums[0]]["allocs"].append(dict(txn=p, amount=p["amount"], how="ref", group=nums))
        elif len(nums) > 1:
            need = [open_amt(n) for n in nums]
            if sum(need) == p["amount"]:
                for n, a in zip(nums, need):
                    invoices[n]["allocs"].append(dict(txn=p, amount=a, how="multi", group=nums))
            else:
                unmatched.append((p, "names %s but the amounts differ (open %s)" % (", ".join(nums), money(sum(need)))))
        else:
            todo.append(p)
    # b. no usable reference -> same amount, one open invoice
    for p in todo:
        cands = [n for n in invoices if open_amt(n) == p["amount"] and open_amt(n) > 0]
        if len(cands) == 1:
            invoices[cands[0]]["allocs"].append(dict(txn=p, amount=p["amount"], how="amount", group=cands))
        else:
            unmatched.append((p, "no invoice reference and %d open invoices with this amount" % len(cands)))
    for inv in invoices.values():
        inv["allocs"].sort(key=lambda a: a["txn"]["ts"])
    return refunds, unmatched


# ---------------------------------------------------------------- bank extract picture
def _font(bold, size):
    names = ["arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "Arial.ttf", "DejaVuSans.ttf"]
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap(text, font, maxw):
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if cur and font.getlength(t) > maxw:
            lines.append(cur)
            cur = w
        else:
            cur = t
    return lines + [cur]


def render_bank_png(title, subtitle, sections, footer):
    """sections: [(label, [txn, ...], style)] - style 'pay' (green tint) or 'other' (orange tint)."""
    S = 2
    pad, lh = 8 * S, 17 * S
    fr, fb, ft, fs = _font(False, 13 * S), _font(True, 13 * S), _font(True, 16 * S), _font(False, 12 * S)
    fix = lambda s: s.replace("�", "?")  # noqa: E731  (the bank file lost an umlaut: '?' is honest, '�' has no glyph)
    max_ref = 270 * S
    widths = []
    for label, key, _ in BANK_COLS:
        w = fb.getlength(label)
        for sec in sections:
            for t in sec[1]:
                for r in t["rows"]:
                    w = max(w, fr.getlength(fix(r[key])))
        widths.append(min(w, max_ref) + 2 * pad if key == "Reference" else w + 2 * pad)
    W = int(sum(widths))
    # lay out rows
    items = []   # (kind, payload, height)
    for label, txs, style in sections:
        if not txs:
            continue
        items.append(("label", label, lh + 8 * S))
        for t in txs:
            for r in t["rows"]:
                fee = not r["Description"].startswith(("Payment", "Transfer"))
                cells = []
                for (lab, key, al), w in zip(BANK_COLS, widths):
                    txt = fix(r[key])
                    cells.append(_wrap(txt, fr, w - 2 * pad) if key == "Reference" else [txt])
                n = max(len(c) for c in cells)
                items.append(("row", (cells, "fee" if fee else style), n * lh + 8 * S))
    head_h = 62 * S
    foot_lines = footer
    H = int(head_h + (lh + 12 * S) + sum(i[2] for i in items) + len(foot_lines) * lh + 20 * S)
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    d.text((pad, 10 * S), title, font=ft, fill=(31, 56, 100))
    d.text((pad, 10 * S + 24 * S), subtitle, font=fs, fill=(89, 89, 89))
    y = head_h
    d.rectangle([0, y, W, y + lh + 12 * S], fill=(31, 56, 100))
    x = 0
    for (lab, key, al), w in zip(BANK_COLS, widths):
        tx = x + w - pad - fb.getlength(lab) if al == "r" else x + pad
        d.text((tx, y + 6 * S), lab, font=fb, fill="white")
        x += w
    y += lh + 12 * S
    stripe = 0
    for kind, pay, h in items:
        if kind == "label":
            d.rectangle([0, y, W, y + h], fill=(217, 225, 242))
            d.text((pad, y + 5 * S), pay, font=fb, fill=(31, 56, 100))
            stripe = 0
        else:
            cells, style = pay
            bg = {"pay": (255, 255, 255) if stripe % 2 == 0 else (244, 248, 241), "fee": (247, 247, 247),
                  "other": (252, 228, 214)}[style]
            col = (120, 120, 120) if style == "fee" else (0, 0, 0)
            d.rectangle([0, y, W, y + h], fill=bg)
            x = 0
            for (lab, key, al), w, lines in zip(BANK_COLS, widths, cells):
                for k, line in enumerate(lines):
                    tx = x + w - pad - fr.getlength(line) if al == "r" else x + pad
                    d.text((tx, y + 4 * S + k * lh), line, font=fb if (key == "*Amount" and style != "fee") else fr, fill=col)
                x += w
            stripe += 1
        d.line([0, y + h, W, y + h], fill=(210, 210, 210), width=1)
        y += h
    y += 8 * S
    for line in foot_lines:
        d.text((pad, y), line, font=fs, fill=(64, 64, 64))
        y += lh
    d.rectangle([0, 0, W - 1, H - 1], outline=(150, 150, 150), width=1)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue(), (W // S, H // S)


# ---------------------------------------------------------------- workbook
def reserve_rows(ws, r0, px_h):
    n = int(math.ceil(px_h / ROW_PX)) + 1
    for r in range(r0, r0 + n):
        ws.row_dimensions[r].height = 15
    return n


def month_title(mk):
    y, m = mk.split("-")
    return "%s %s" % (calendar.month_name[int(m)], y)


def build_sheet(wb, mk, st, invoices, ctx):
    comp, bank_end, txn_rows = ctx["company"], ctx["bank_end"], ctx["txns"]
    ws = wb.create_sheet(month_title(mk))
    ws.sheet_view.showGridLines = False
    ws.sheet_format.defaultRowHeight = 15
    ws.sheet_format.customHeight = True
    for col, w in zip("ABCDEFGHI", (14, 13, 18, 14, 18, 34, 16, 18, 64)):
        ws.column_dimensions[col].width = w
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)

    invs = [invoices[l["no"]] for l in st["lines"]]
    n_rows = sum(max(1, len(i["allocs"])) for i in invs)
    # ---- layout (rows are fixed up front so the formulas can point at the table)
    sec1 = 13
    sw = STATEMENT_W
    sh = int(st["size"][1] * sw / st["size"][0])
    n1 = int(math.ceil(sh / ROW_PX)) + 1
    sec2 = sec1 + 1 + n1 + 1
    hdr = sec2 + 1
    first = hdr + 1
    last = first + n_rows - 1
    tot = last + 1
    notes0 = tot + 2

    # ---- title + summary
    put(ws, 1, 1, "%s - Statement and payment confirmation - %s" % (comp["name"], month_title(mk)), font=f_title)
    put(ws, 2, 1, "Statement no. %s dated %s, issued by Ad Rice LLC FZ. Payments are taken from the bank file TransactionHistory.csv."
        % (st["number"], dstr(st["date"])), font=f_sub)
    paid_bank = sum(a["amount"] for i in invs for a in i["allocs"])
    summ = [
        (4, "Statement total (per PDF)", float(st["total"]), f_in, None),
        (5, "Received per statement (per PDF)", float(st["received"]), f_in, None),
        (6, "Paid per bank (payments in table 2)", "=E%d" % tot, f_bold, None),
        (7, "Open balance (statement total - paid per bank)", "=E4-E6", f_bold, fill_warn if st["total"] - paid_bank != 0 else fill_key),
        (8, "Check: invoices in table 2 - statement total (should be -)", "=C%d-E4" % tot, f_sub, None),
        (9, "Check: paid per bank - 'received' per statement (should be -)", "=E6-E5", f_sub, None),
    ]
    for r, label, v, font, fill in summ:
        put(ws, r, 1, label, font=f_bold if font is f_bold else f_norm)
        put(ws, r, 5, v, font=font, fmt=EUR, fill=fill)
    put(ws, 11, 1, "Jump to:", font=f_sub)
    link(ws, 11, 2, "1. Statement", ws.title, "A%d" % sec1)
    link(ws, 11, 3, "2. Payments", ws.title, "A%d" % sec2)
    link(ws, 11, 4, "3. Bank proof", ws.title, "A%d" % (notes0 + ctx["n_notes"] + 1))

    # ---- 1. statement picture
    put(ws, sec1, 1, "1. Statement as issued", font=f_sec)
    img = XLImage(io.BytesIO(st["png"]))
    img.width, img.height = sw, sh
    ws.add_image(img, "A%d" % (sec1 + 1))
    for r in range(sec1 + 1, sec1 + 1 + n1):
        ws.row_dimensions[r].height = 15

    # ---- 2. invoices and payments
    put(ws, sec2, 1, "2. Invoices and the payments that settled them", font=f_sec)
    header(ws, hdr, 1, ["Invoice", "Invoice date", "Invoice amount (EUR)", "Payment date", "Payment amount (EUR)",
                        "Bank reference (as sent by payer)", "Bank transaction ID", "Open balance (EUR)", "Note"])
    r = first
    for inv in invs:
        allocs = inv["allocs"] or [None]
        for k, a in enumerate(allocs):
            notes, warn = [], False
            put(ws, r, 1, inv["no"], font=f_norm if k == 0 else f_grey)
            if k == 0:
                put(ws, r, 2, inv["date"], font=f_in, fmt=DATE)
                put(ws, r, 3, float(inv["amount"]), font=f_in, fmt=EUR)
                put(ws, r, 8, "=C%d-SUMIFS($E$%d:$E$%d,$A$%d:$A$%d,A%d)" % (r, first, last, first, last, r), fmt=EUR,
                    fill=fill_warn if inv["amount"] != sum(x["amount"] for x in inv["allocs"]) else None)
            if a is None:
                notes.append("Not paid yet - no payment from %s in the bank file (file ends %s)" % (comp["name"], bank_end.strftime("%d.%m.%Y %H:%M UTC")))
                warn = True
            else:
                t = a["txn"]
                put(ws, r, 4, t["ts"].date(), font=f_in, fmt=DATE)
                put(ws, r, 5, float(a["amount"]), font=f_in, fmt=EUR)
                put(ws, r, 6, t["ref"], font=f_in)
                put(ws, r, 7, t["id"], font=f_in)
                if len(inv["allocs"]) > 1:
                    notes.append("Part payment (invoice settled in %d payments)" % len(inv["allocs"]))
                if a["how"] == "multi":
                    notes.append("One bank payment of %s covers %s (split by invoice amounts)" % (money(t["amount"]), " + ".join(a["group"])))
                if a["how"] == "amount":
                    notes.append("No reference in the bank file - matched by exact amount")
                    warn = True
            if k == len(allocs) - 1 and inv["received"] != sum(x["amount"] for x in inv["allocs"]):
                notes.append("ATTENTION: statement shows %s received, bank payments %s" % (money(inv["received"]), money(sum(x["amount"] for x in inv["allocs"]))))
                warn = True
            put(ws, r, 9, "; ".join(notes), font=f_norm, fill=fill_warn if warn else None)
            for c in range(1, 10):
                ws.cell(r, c).border = b_all
            r += 1
    put(ws, tot, 1, "Total", bold=True, fill=fill_tot)
    for c in range(2, 10):
        ws.cell(tot, c).fill = fill_tot
    put(ws, tot, 3, "=SUM(C%d:C%d)" % (first, last), bold=True, fmt=EUR, fill=fill_tot)
    put(ws, tot, 5, "=SUM(E%d:E%d)" % (first, last), bold=True, fmt=EUR, fill=fill_tot)
    put(ws, tot, 8, "=SUM(H%d:H%d)" % (first, last), bold=True, fmt=EUR, fill=fill_tot)
    for c in range(1, 10):
        ws.cell(tot, c).border = b_all

    # ---- notes
    rr = notes0
    for n in ctx["notes"]:
        put(ws, rr, 1, n, font=f_sub)
        rr += 1
    sec3 = rr + 1

    # ---- 3. bank proof
    put(ws, sec3, 1, "3. Bank proof - matching rows of TransactionHistory.csv", font=f_sec)
    if ctx["bank_png"]:
        png, (bw, bh) = ctx["bank_png"]
        img = XLImage(io.BytesIO(png))
        img.width, img.height = int(bw * BANK_SCALE), int(bh * BANK_SCALE)
        ws.add_image(img, "A%d" % (sec3 + 1))
        reserve_rows(ws, sec3 + 1, img.height)
    else:
        put(ws, sec3 + 1, 1, "No payments from %s for these invoices are in the bank file yet (it ends %s), so there is nothing to confirm."
            % (comp["name"], bank_end.strftime("%d.%m.%Y %H:%M UTC")), font=f_norm)
    return dict(first=first, last=last, tot=tot, sec3=sec3)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--company", required=True, choices=sorted(COMPANIES))
    ap.add_argument("--bank", default=os.path.join(ROOT, "statements", "TransactionHistory.csv"))
    ap.add_argument("--out")
    ap.add_argument("--png-dir", help="also save the statement / bank pictures here")
    a = ap.parse_args()
    comp = COMPANIES[a.company]
    out = a.out or os.path.join(ROOT, "Reports", "Payment_Confirmation_%s.xlsx" % a.company)

    # statements
    stmts = {}
    for p in sorted(glob.glob(os.path.join(ROOT, "statements", a.company, "*.pdf"))):
        m = re.search(r"(\d\d)\.(\d{4})\.pdf$", p)
        if not m:
            print("skipped (month not in the file name): %s" % p)
            continue
        mk = "%s-%s" % (m.group(2), m.group(1))
        stmts[mk] = parse_statement(p)
    if not stmts:
        raise SystemExit("No statements found in statements/%s" % a.company)
    invoices = {}
    for mk, st in sorted(stmts.items()):
        for l in st["lines"]:
            if l["no"] in invoices:
                raise SystemExit("%s appears on two statements" % l["no"])
            if l["date"].strftime("%Y-%m") != mk:
                print("note: %s is dated %s but sits on the %s statement" % (l["no"], l["date"], mk))
            invoices[l["no"]] = dict(l, month=mk)

    # bank
    rows, txns = load_bank(a.bank, comp["bank_re"])
    bank_end = max(r["_ts"] for r in rows)
    bank_start = min(r["_ts"] for r in rows)
    refunds, unmatched = match(invoices, txns)
    for p, why in unmatched:
        print("UNMATCHED payment %s %s %s ref=%r: %s" % (p["ts"], p["id"], money(p["amount"]), p["ref"], why))

    # every payment accounted for exactly once
    all_pay = sum(t["amount"] for t in txns if t["kind"] == "payment")
    alloc_tx = {a_["txn"]["id"]: a_["txn"] for i in invoices.values() for a_ in i["allocs"]}
    acc = sum(t["amount"] for t in alloc_tx.values()) + sum(p["amount"] for p, _ in refunds) + sum(p["amount"] for p, _ in unmatched)
    assert acc == all_pay, (acc, all_pay)

    wb = Workbook()
    wb.remove(wb.active)
    summary = []
    for mk, st in sorted(stmts.items()):
        invs = [invoices[l["no"]] for l in st["lines"]]
        month_txns = {}
        for i in invs:
            for al in i["allocs"]:
                month_txns[al["txn"]["id"]] = al["txn"]
        month_txns = sorted(month_txns.values(), key=lambda t: (t["ts"], t["id"]))
        # not an invoice payment: refunded payments (+ their refund), unmatched payments - on the sheet of the payment month
        other, notes = [], []
        for p, rf in refunds:
            if p["ts"].strftime("%Y-%m") == mk:
                other += [p, rf]
                notes.append("Not an invoice payment: the payer sent %s on %s (ref '%s') by mistake; %s was sent back on %s (ref '%s'). "
                             "Shown in section 3 under 'Not related to invoices'." % (money(p["amount"]), dstr(p["ts"]), p["ref"], money(-rf["amount"]), dstr(rf["ts"]), rf["ref"]))
        for p, why in unmatched:
            if p["ts"].strftime("%Y-%m") == mk:
                other.append(p)
                notes.append("ATTENTION: payment %s of %s on %s (ref '%s') could not be matched to an invoice: %s." % (p["id"], money(p["amount"]), dstr(p["ts"]), p["ref"], why))
        other.sort(key=lambda t: (t["ts"], t["id"]))
        allocs = [al for i in invs for al in i["allocs"]]
        base = ["Invoices are grouped by the invoice date on the statement; a payment can be dated in a later month (see 'Payment date').",
                "Bank fees (Receiving Fee) are charged on top of each payment and are not part of the invoice amounts; they are visible in the bank proof."]
        if any(al["how"] == "amount" for al in allocs):
            base.append("Payments without any reference in the bank file were matched to the open invoice with exactly the same amount (yellow).")
        if any(al["how"] == "multi" for al in allocs):
            base.append("A payment that settles two invoices is shown on each invoice with that invoice's share; the bank booked it as one transaction.")
        base.append("Blue = values taken from the statement PDF / bank file, black = formulas, yellow = needs attention.")
        notes = base + notes

        bank_png = None
        if month_txns or other:
            paid = sum(t["amount"] for t in month_txns)
            sections = [("Payments for the invoices above", month_txns, "pay")]
            if other:
                sections.append(("Not related to invoices", other, "other"))
            foot = ["Payments shown above: %d bank transactions, total %s EUR%s." % (
                len(month_txns), money(paid), "" if paid == sum(al["amount"] for al in allocs) else " (some also settle invoices of another month)"),
                "Source: bank file TransactionHistory.csv (entries from %s to %s), rows copied as they are. Extract of the bank's export, not a screenshot of the bank application."
                % (bank_start.strftime("%m/%d/%Y"), bank_end.strftime("%m/%d/%Y"))]
            bank_png = render_bank_png("Bank transaction history - %s - %s" % (comp["name"], month_title(mk)),
                                       "Extract of TransactionHistory.csv: payments received for the invoices of the %s statement" % month_title(mk),
                                       sections, foot)
            if a.png_dir:
                os.makedirs(a.png_dir, exist_ok=True)
                open(os.path.join(a.png_dir, "bank_%s.png" % mk), "wb").write(bank_png[0])
        if a.png_dir:
            os.makedirs(a.png_dir, exist_ok=True)
            open(os.path.join(a.png_dir, "statement_%s.png" % mk), "wb").write(st["png"])
        info = build_sheet(wb, mk, st, invoices, dict(company=comp, bank_end=bank_end, txns=txns, bank_png=bank_png,
                                                      notes=notes, n_notes=len(notes)))
        summary.append((mk, st, invs, info))

    wb.calculation.fullCalcOnLoad = True
    wb.save(out)
    written, total = xlsx_formula_cache.add_cached_values(out)

    print("\nSaved %s  (formulas: %d, cached values written: %d)" % (out, total, written))
    print("%-9s %5s %14s %14s %12s  %s" % ("month", "inv", "statement", "paid (bank)", "open", "flags"))
    for mk, st, invs, info in summary:
        paid = sum(al["amount"] for i in invs for al in i["allocs"])
        flags = []
        n_amt = sum(1 for i in invs for al in i["allocs"] if al["how"] == "amount")
        n_mul = len({al["txn"]["id"] for i in invs for al in i["allocs"] if al["how"] == "multi"})
        bad = [i["no"] for i in invs if i["received"] != sum(al["amount"] for al in i["allocs"])]
        if n_amt:
            flags.append("%d matched by amount" % n_amt)
        if n_mul:
            flags.append("%d grouped payments" % n_mul)
        if bad:
            flags.append("statement/bank mismatch: %s" % ", ".join(bad))
        print("%-9s %5d %14s %14s %12s  %s" % (mk, len(invs), money(st["total"]), money(paid), money(st["total"] - paid), "; ".join(flags)))
    print("bank payments from %s: %d transactions, %s EUR; refunded: %d; unmatched: %d"
          % (comp["name"], sum(1 for t in txns if t["kind"] == "payment"), money(all_pay), len(refunds), len(unmatched)))


if __name__ == "__main__":
    main()
