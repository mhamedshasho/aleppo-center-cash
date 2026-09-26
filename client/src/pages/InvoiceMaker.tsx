import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { ArrowLeft, Check, Download, FileImage, FileText, Image as ImageIcon, Moon, Plus, Search, Sun, Upload } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";

type Currency = "SYP" | "USD";
type PaymentType = "credit" | "debit";
type Payment = { id: number; name: string; amount: number; currency: Currency; type: PaymentType; date: string };
type Account = { id: number; name: string; owner: string; payments: Payment[] };
type Row = Payment & { accountName: string };
type TemplatePage = { label: string; image: string };

const money = (n: number, c: Currency) => new Intl.NumberFormat(c === "SYP" ? "ar-SY" : "en-US", { maximumFractionDigits: c === "SYP" ? 0 : 2 }).format(n) + " " + (c === "SYP" ? "ل.س" : "$");
const dateText = (d: string) => new Intl.DateTimeFormat("ar-SY", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d + "T12:00:00"));
const esc = (v: string) => v.replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x] || x);

async function fileData(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("تعذر قراءة الملف"));
    r.readAsDataURL(file);
  });
}

async function loadPdfJs(): Promise<any> {
  const w = window as Window & { pdfjsLib?: any };
  if (!w.pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const old = document.querySelector<HTMLScriptElement>('script[data-aleppo-pdfjs="1"]');
      if (old) {
        old.addEventListener("load", () => resolve(), { once: true });
        old.addEventListener("error", () => reject(new Error("تعذر تحميل قارئ PDF")), { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.dataset.aleppoPdfjs = "1";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("تعذر تحميل قارئ PDF. تحقق من الإنترنت."));
      document.head.appendChild(s);
    });
  }
  if (!w.pdfjsLib) throw new Error("قارئ PDF غير جاهز");
  w.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return w.pdfjsLib;
}

async function templatePages(file: File): Promise<TemplatePage[]> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const result: TemplatePage[] = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      result.push({ label: "صفحة " + i, image: canvas.toDataURL("image/png") });
    }
    return result;
  }
  return [{ label: "الصورة", image: await fileData(file) }];
}

export default function InvoiceMaker({ accounts, onBack, onToggleTheme, theme }: { accounts: Account[]; onBack: () => void; onToggleTheme: () => void; theme: "light" | "dark" }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [images, setImages] = useState<Record<number, string>>({});
  const [imageLabels, setImageLabels] = useState<Record<number, string>>({});
  const [pages, setPages] = useState<TemplatePage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [logo, setLogo] = useState("");
  const [logoCorner, setLogoCorner] = useState("top-right");
  const [title, setTitle] = useState("فاتورة رقم 28");
  const [customer, setCustomer] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const templateRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const rows = useMemo<Row[]>(() => accounts.flatMap((a) => a.payments.map((p) => ({ ...p, accountName: a.name }))).sort((a, b) => b.date.localeCompare(a.date)), [accounts]);
  const filtered = useMemo(() => rows.filter((r) => (r.name + " " + r.accountName).toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const chosen = rows.filter((r) => selected.includes(r.id));
  const totals = chosen.reduce((a, r) => ({ ...a, [r.currency]: (a[r.currency] || 0) + r.amount }), {} as Record<Currency, number>);

  const toggle = (id: number) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleAll = () => setSelected((s) => s.length === filtered.length ? s.filter((id) => !filtered.some((r) => r.id === id)) : Array.from(new Set([...s, ...filtered.map((r) => r.id)])));

  const chooseTemplate = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      setPages(await templatePages(file));
      setPageIndex(0);
      toast.success("تم تحميل القالب");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل القالب");
    } finally {
      setBusy(false);
    }
  };

  const chooseLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { setLogo(await fileData(file)); toast.success("تم اختيار الشعار"); } catch { toast.error("تعذر قراءة الشعار"); }
  };

  const apply = () => {
    if (activeId === null) return toast.error("حدد حركة من الجدول أولاً");
    const page = pages[pageIndex];
    if (!page) return toast.error("حمّل ملف القالب واختر العرض أولاً");
    setImages((x) => ({ ...x, [activeId]: page.image }));
    setImageLabels((x) => ({ ...x, [activeId]: page.label }));
    toast.success("تم تطبيق صورة القالب");
  };

  const exportPdf = async () => {
    if (!chosen.length) return toast.error("اختار حركة واحدة على الأقل");
    setBusy(true);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;";
    document.body.appendChild(host);
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      for (let start = 0; start < chosen.length; start += 10) {
        const batch = chosen.slice(start, start + 10);
        host.innerHTML = '<div dir="rtl" style="width:794px;height:1123px;box-sizing:border-box;padding:34px 42px;background:#fff;color:#18353a;font-family:Cairo,Arial,sans-serif;position:relative;">'
          + '<div style="height:7px;background:#173f47;border-radius:4px;"></div>'
          + '<div style="text-align:center;margin:18px 70px 0;"><div style="font-size:25px;font-weight:800;color:#173f47;">' + esc(title || "فاتورة") + '</div>'
          + '<div style="font-size:12px;color:#78908b;margin-top:6px;">' + (customer ? esc("العميل: " + customer) : "") + '</div>'
          + '<div style="font-size:11px;color:#9aa9a5;margin-top:4px;">التاريخ: ' + esc(dateText(invoiceDate)) + '</div></div>'
          + (logo ? '<img src="' + logo + '" style="position:absolute;width:70px;height:70px;object-fit:contain;' + (logoCorner.includes("right") ? "right:42px;" : "left:42px;") + (logoCorner.includes("bottom") ? "bottom:42px;" : "top:34px;") + '" />' : "")
          + '<div style="margin-top:24px;border:1px solid #dfe7e2;border-radius:9px;overflow:hidden;">'
          + '<div style="display:grid;grid-template-columns:1.25fr 1.25fr 1.35fr 1fr .75fr .8fr;background:#173f47;color:#fff;font-size:11px;font-weight:700;padding:10px;">'
          + '<div>الحساب</div><div>اسم القالب</div><div style="text-align:center;">صورة القالب</div><div>السعر</div><div>النوع</div><div>التاريخ</div></div>'
          + batch.map((r, i) => '<div style="display:grid;grid-template-columns:1.25fr 1.25fr 1.35fr 1fr .75fr .8fr;min-height:88px;padding:7px 10px;align-items:center;border-top:1px solid #e7eeeb;background:' + (i % 2 ? "#fff" : "#fbfcfb") + ';font-size:10px;">'
            + '<div style="font-weight:700;">' + esc(r.accountName) + '</div>'
            + '<div style="font-weight:700;">' + esc(r.name) + (imageLabels[r.id] ? '<div style="font-size:8px;color:#91a29e;margin-top:3px;">' + esc(imageLabels[r.id]) + '</div>' : "") + '</div>'
            + '<div style="height:72px;display:flex;align-items:center;justify-content:center;">' + (images[r.id] ? '<img src="' + images[r.id] + '" style="max-width:92px;max-height:68px;object-fit:contain;" />' : '<span style="font-size:9px;color:#a7b5b1;">بدون صورة</span>') + '</div>'
            + '<div style="font-weight:800;">' + esc(money(r.amount, r.currency)) + '</div>'
            + '<div style="font-weight:800;color:' + (r.type === "credit" ? "#4d9b7b" : "#b66d52") + ';">' + (r.type === "credit" ? "له" : "عليه") + '</div>'
            + '<div style="font-size:9px;color:#718883;">' + esc(dateText(r.date)) + '</div></div>').join("")
          + '</div><div style="display:flex;justify-content:space-between;margin-top:16px;padding:12px 15px;background:#f1f6f3;border:1px solid #dfe9e4;border-radius:9px;font-weight:800;">'
          + '<span>الإجمالي</span><span style="color:#2f896d;">' + esc([totals.SYP ? money(totals.SYP, "SYP") : "", totals.USD ? money(totals.USD, "USD") : ""].filter(Boolean).join("   |   ") || "0") + '</span></div>'
          + '<div style="position:absolute;bottom:15px;left:0;right:0;text-align:center;font-size:9px;color:#9aa9a5;">Aleppo Center Cash</div></div>';
        const canvas = await html2canvas(host.firstElementChild as HTMLElement, { scale: 2, backgroundColor: "#fff", logging: false });
        if (start > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      }
      pdf.save("aleppo-center-invoice-" + invoiceDate + ".pdf");
      toast.success("تم استخراج الفاتورة PDF");
    } catch (error) {
      console.error(error);
      toast.error("تعذر إنشاء ملف PDF");
    } finally {
      host.remove();
      setBusy(false);
    }
  };

  return <main className="invoice-maker page-enter" dir="rtl">
    <header className="invoice-maker-head">
      <div><button className="text-btn invoice-back" onClick={onBack}><ArrowLeft size={16} /> رجوع</button><div className="eyebrow">ALEPPO CENTER <span>•</span> INVOICE MAKER</div><h1>صانع الفواتير</h1><p>اختار الحركات مثل Excel، اربط صور القوالب، وبعدها استخرج فاتورة مرتبة.</p></div>
      <div className="invoice-head-actions"><button className="icon-btn bordered" onClick={onToggleTheme}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button><button className="primary-btn" disabled={busy || !chosen.length} onClick={() => void exportPdf()}><Download size={17} /> استخراج PDF</button></div>
    </header>

    <section className="invoice-toolbar surface-card">
      <div className="invoice-field"><label>عنوان الفاتورة</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="invoice-field"><label>العميل</label><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="اختياري" /></div>
      <div className="invoice-field"><label>التاريخ</label><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
      <div className="invoice-field"><label>زاوية الشعار</label><select value={logoCorner} onChange={(e) => setLogoCorner(e.target.value)}><option value="top-right">أعلى اليمين</option><option value="top-left">أعلى اليسار</option><option value="bottom-right">أسفل اليمين</option><option value="bottom-left">أسفل اليسار</option></select></div>
      <button className="secondary-btn invoice-logo-btn" onClick={() => logoRef.current?.click()}><ImageIcon size={16} /> {logo ? "تغيير الشعار" : "اختيار الشعار"}</button><input ref={logoRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void chooseLogo(e)} />
    </section>

    <div className="invoice-maker-grid">
      <section className="surface-card invoice-payments-panel">
        <div className="section-head"><div><h2>الحركات</h2><p>{chosen.length} مختارة من {rows.length}</p></div><button className="text-btn" onClick={toggleAll}>{chosen.length === filtered.length && filtered.length ? "إلغاء تحديد الكل" : "تحديد الكل"}</button></div>
        <div className="invoice-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم القالب أو الحساب..." /></div>
        <div className="invoice-table-wrap"><table className="invoice-table"><thead><tr><th><input type="checkbox" checked={Boolean(filtered.length) && filtered.every((r) => selected.includes(r.id))} onChange={toggleAll} /></th><th>اسم القالب</th><th>الحساب</th><th>السعر</th><th>العملة</th><th>النوع</th><th>الصورة</th></tr></thead><tbody>{filtered.map((r) => <tr key={r.id} className={selected.includes(r.id) ? "selected" : ""} onClick={() => { setActiveId(r.id); toggle(r.id); }}><td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} /></td><td><strong>{r.name}</strong><small>{dateText(r.date)}</small></td><td>{r.accountName}</td><td>{r.amount.toLocaleString("en-US")}</td><td>{r.currency === "SYP" ? "ل.س" : "$"}</td><td><span className={"invoice-type " + r.type}>{r.type === "credit" ? "له" : "عليه"}</span></td><td>{images[r.id] ? <img className="invoice-row-thumb" src={images[r.id]} alt="قالب" /> : <span className="invoice-no-image">—</span>}</td></tr>)}</tbody></table>{!filtered.length && <div className="invoice-empty"><FileText size={25} /><strong>ما في حركات</strong><span>أضف دفعات من الحسابات أولاً.</span></div>}</div>
      </section>

      <aside className="invoice-template-panel">
        <section className="surface-card invoice-template-card">
          <div className="section-head"><div><h2>صورة القالب</h2><p>اختار الحركة ثم حمّل PDF أو صورة</p></div><FileImage size={19} /></div>
          <button className="template-dropzone" onClick={() => templateRef.current?.click()} disabled={busy}><Upload size={22} /><strong>{pages.length ? "تغيير ملف القالب" : "اختيار ملف القالب"}</strong><span>PDF متعدد الصفحات أو PNG / JPG</span></button>
          <input ref={templateRef} hidden type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => void chooseTemplate(e)} />
          {pages.length > 0 && <><div className="template-page-picker"><label>العرض</label><select value={pageIndex} onChange={(e) => setPageIndex(Number(e.target.value))}>{pages.map((p, i) => <option key={i} value={i}>{p.label}</option>)}</select></div><div className="template-preview"><img src={pages[pageIndex].image} alt="معاينة القالب" /></div><button className="primary-btn full" onClick={apply}><Check size={17} /> Apply — حط الصورة بالحركة المختارة</button></>}
          <div className="template-target">{activeId !== null ? <><Check size={15} /> الحركة المحددة: <strong>{rows.find((r) => r.id === activeId)?.name || "—"}</strong></> : <><Plus size={15} /> حدد حركة من الجدول لتطبيق الصورة عليها</>}</div>
        </section>
        <section className="surface-card invoice-summary-card"><div className="section-head"><div><h2>ملخص التصدير</h2><p>فقط الحركات المحددة ستخرج</p></div></div><div className="invoice-summary-row"><span>الحركات</span><strong>{chosen.length}</strong></div>{totals.SYP ? <div className="invoice-summary-row"><span>ليرة سورية</span><strong>{money(totals.SYP, "SYP")}</strong></div> : null}{totals.USD ? <div className="invoice-summary-row"><span>دولار</span><strong>{money(totals.USD, "USD")}</strong></div> : null}</section>
      </aside>
    </div>
  </main>;
}
