import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import { ArrowLeft, Check, Download, Eye, FileImage, FileText, Image as ImageIcon, Moon, Plus, RotateCcw, Search, Sun, Upload, X } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";

type Currency = "SYP" | "USD";
type PaymentType = "credit" | "debit";
type Payment = { id: number; name: string; amount: number; currency: Currency; type: PaymentType; date: string };
type Account = { id: number; name: string; owner: string; payments: Payment[] };
type Row = Payment & { accountName: string };
type TemplatePage = { label: string; image: string };
type TemplateFile = { id: string; name: string; pages: TemplatePage[] };
type Position = { x: number; y: number };

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
      const oldScript = document.querySelector<HTMLScriptElement>('script[data-aleppo-pdfjs="1"]');
      if (oldScript) {
        oldScript.addEventListener("load", () => resolve(), { once: true });
        oldScript.addEventListener("error", () => reject(new Error("تعذر تحميل قارئ PDF")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.dataset.aleppoPdfjs = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("تعذر تحميل قارئ PDF. تحقق من الإنترنت."));
      document.head.appendChild(script);
    });
  }
  if (!w.pdfjsLib) throw new Error("قارئ PDF غير جاهز");
  w.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return w.pdfjsLib;
}

async function renderTemplateFile(file: File): Promise<TemplatePage[]> {
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
  const [positions, setPositions] = useState<Record<number, Position>>({});
  const [meters, setMeters] = useState<Record<number, string>>({});
  const [templateFiles, setTemplateFiles] = useState<TemplateFile[]>([]);
  const [templateFileId, setTemplateFileId] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [logo, setLogo] = useState("");
  const [logoCorner, setLogoCorner] = useState("top-right");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const templateRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => accounts.flatMap((a) => a.payments.map((p) => ({ ...p, accountName: a.name }))).sort((a, b) => b.date.localeCompare(a.date)), [accounts]);
  const filtered = useMemo(() => rows.filter((r) => (r.name + " " + r.accountName).toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const chosen = rows.filter((r) => selected.includes(r.id));
  const totals = chosen.reduce((a, r) => ({ ...a, [r.currency]: (a[r.currency] || 0) + r.amount }), {} as Record<Currency, number>);
  const activeRow = activeId === null ? null : rows.find((r) => r.id === activeId) || null;
  const activePosition = activeId === null ? { x: 50, y: 50 } : positions[activeId] || { x: 50, y: 50 };
  const activeFile = templateFiles.find((f) => f.id === templateFileId);
  const activePage = activeFile?.pages[pageIndex];

  const toggle = (id: number) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const chooseRow = (id: number) => { setActiveId(id); if (!selected.includes(id)) setSelected((s) => [...s, id]); };
  const toggleAll = () => setSelected((s) => s.length === filtered.length ? s.filter((id) => !filtered.some((r) => r.id === id)) : Array.from(new Set([...s, ...filtered.map((r) => r.id)])));

  const chooseTemplates = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      const loaded: TemplateFile[] = [];
      for (const file of files) {
        loaded.push({ id: crypto.randomUUID(), name: file.name, pages: await renderTemplateFile(file) });
      }
      setTemplateFiles((current) => [...current, ...loaded]);
      setTemplateFileId(loaded[0].id);
      setPageIndex(0);
      toast.success(`تم تحميل ${loaded.length} ملف قالب`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل القوالب");
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

  const applyTemplate = () => {
    if (activeId === null) return toast.error("حدد الدفعة التي تريد وضع الصورة عليها");
    if (!activePage) return toast.error("اختر ملف قالب وعرضاً أولاً");
    setImages((x) => ({ ...x, [activeId]: activePage.image }));
    setImageLabels((x) => ({ ...x, [activeId]: activeFile?.name + " — " + activePage.label }));
    setPositions((x) => ({ ...x, [activeId]: { x: 50, y: 50 } }));
    toast.success(`تم تعيين القالب للدفعة: ${activeRow?.name || ""}`);
  };

  const resetPosition = () => {
    if (activeId === null) return;
    setPositions((x) => ({ ...x, [activeId]: { x: 50, y: 50 } }));
  };

  const moveImage = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging || activeId === null || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.max(10, Math.min(90, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(10, Math.min(90, ((event.clientY - rect.top) / rect.height) * 100));
    setPositions((current) => ({ ...current, [activeId]: { x, y } }));
  };

  const exportPdf = async () => {
    if (!chosen.length) return toast.error("اختار دفعة واحدة على الأقل");
    if (!invoiceNumber.trim()) return toast.error("اكتب رقم الفاتورة أولاً");
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
          + '<div style="text-align:center;margin:18px 70px 0;"><div style="font-size:25px;font-weight:800;color:#173f47;">فاتورة رقم ' + esc(invoiceNumber) + '</div>'
          + '<div style="font-size:12px;color:#78908b;margin-top:6px;">' + (customer ? esc("العميل: " + customer) : "") + '</div>'
          + '<div style="font-size:11px;color:#9aa9a5;margin-top:4px;">التاريخ: ' + esc(dateText(invoiceDate)) + '</div></div>'
          + (logo ? '<img src="' + logo + '" style="position:absolute;width:70px;height:70px;object-fit:contain;border-radius:50%;' + (logoCorner.includes("right") ? "right:42px;" : "left:42px;") + (logoCorner.includes("bottom") ? "bottom:42px;" : "top:34px;") + '" />' : "")
          + '<div style="margin-top:24px;border:1px solid #dfe7e2;border-radius:9px;overflow:hidden;">'
          + '<div style="display:grid;grid-template-columns:1.15fr 1.25fr 1.35fr .85fr .75fr .8fr .65fr;background:#173f47;color:#fff;font-size:10px;font-weight:700;padding:10px;">'
          + '<div>الحساب</div><div>اسم القالب</div><div style="text-align:center;">صورة القالب</div><div>السعر</div><div>النوع</div><div>التاريخ</div><div>امتار</div></div>'
          + batch.map((r, i) => {
            const p = positions[r.id] || { x: 50, y: 50 };
            return '<div style="display:grid;grid-template-columns:1.15fr 1.25fr 1.35fr .85fr .75fr .8fr .65fr;min-height:88px;padding:7px 10px;align-items:center;border-top:1px solid #e7eeeb;background:' + (i % 2 ? "#fff" : "#fbfcfb") + ';font-size:10px;">'
              + '<div style="font-weight:700;">' + esc(r.accountName) + '</div>'
              + '<div style="font-weight:700;">' + esc(r.name) + (imageLabels[r.id] ? '<div style="font-size:7px;color:#91a29e;margin-top:3px;">' + esc(imageLabels[r.id]) + '</div>' : "") + '</div>'
              + '<div style="height:72px;position:relative;overflow:hidden;"><div style="position:absolute;left:' + p.x + '%;top:' + p.y + '%;transform:translate(-50%,-50%);width:92px;height:68px;display:flex;align-items:center;justify-content:center;"><img src="' + (images[r.id] || "") + '" style="max-width:92px;max-height:68px;object-fit:contain;" /></div></div>'
              + '<div style="font-weight:800;">' + esc(money(r.amount, r.currency)) + '</div>'
              + '<div style="font-weight:800;color:' + (r.type === "credit" ? "#4d9b7b" : "#b66d52") + ';">' + (r.type === "credit" ? "له" : "عليه") + '</div>'
              + '<div style="font-size:9px;color:#718883;">' + esc(dateText(r.date)) + '</div>'
              + '<div style="font-weight:800;">' + esc(meters[r.id] || "—") + '</div></div>';
          }).join("")
          + '</div><div style="display:flex;justify-content:space-between;margin-top:16px;padding:12px 15px;background:#f1f6f3;border:1px solid #dfe9e4;border-radius:9px;font-weight:800;">'
          + '<span>الإجمالي</span><span style="color:#2f896d;">' + esc([totals.SYP ? money(totals.SYP, "SYP") : "", totals.USD ? money(totals.USD, "USD") : ""].filter(Boolean).join("   |   ") || "0") + '</span></div>'
          + '<div style="position:absolute;bottom:15px;left:0;right:0;text-align:center;font-size:9px;color:#9aa9a5;">Aleppo Center Cash</div></div>';
        const canvas = await html2canvas(host.firstElementChild as HTMLElement, { scale: 2, backgroundColor: "#fff", logging: false });
        if (start > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      }
      pdf.save("aleppo-center-invoice-" + invoiceNumber + ".pdf");
      toast.success("تم استخراج الفاتورة PDF");
    } catch (error) {
      console.error(error);
      toast.error("تعذر إنشاء ملف PDF");
    } finally {
      host.remove();
      setBusy(false);
    }
  };

  const previewRows = chosen.slice(0, 8);

  return <main className="invoice-maker page-enter" dir="rtl">
    <header className="invoice-maker-head">
      <div><button className="text-btn invoice-back" onClick={onBack}><ArrowLeft size={16} /> رجوع</button><div className="eyebrow">ALEPPO CENTER <span>•</span> INVOICE MAKER</div><h1>صانع الفواتير</h1><p>اختار الدفعات مثل Excel، اربط أكثر من ملف قالب، راجع الفاتورة ثم استخرجها.</p></div>
      <div className="invoice-head-actions"><button className="icon-btn bordered" onClick={onToggleTheme} aria-label="تبديل الوضع">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button><button className="secondary-btn" disabled={!chosen.length} onClick={() => setShowPreview(true)}><Eye size={17} /> معاينة</button><button className="primary-btn" disabled={busy || !chosen.length} onClick={() => void exportPdf()}><Download size={17} /> استخراج PDF</button></div>
    </header>

    <section className="invoice-toolbar surface-card">
      <div className="invoice-field"><label>رقم الفاتورة</label><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="مثلاً 28" /></div>
      <div className="invoice-field"><label>العميل</label><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="اختياري" /></div>
      <div className="invoice-field"><label>التاريخ</label><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
      <div className="invoice-field"><label>زاوية الشعار</label><select value={logoCorner} onChange={(e) => setLogoCorner(e.target.value)}><option value="top-right">أعلى اليمين</option><option value="top-left">أعلى اليسار</option><option value="bottom-right">أسفل اليمين</option><option value="bottom-left">أسفل اليسار</option></select></div>
      <button className="secondary-btn invoice-logo-btn" onClick={() => logoRef.current?.click()}><ImageIcon size={16} /> {logo ? "تغيير الشعار" : "اختيار الشعار"}</button><input ref={logoRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void chooseLogo(e)} />
    </section>

    <div className="invoice-maker-grid">
      <section className="surface-card invoice-payments-panel">
        <div className="section-head"><div><h2>الدفعات</h2><p>{chosen.length} مختارة من {rows.length}</p></div><button className="text-btn" onClick={toggleAll}>{chosen.length === filtered.length && filtered.length ? "إلغاء تحديد الكل" : "تحديد الكل"}</button></div>
        <div className="invoice-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم القالب أو الحساب..." /></div>
        <div className="invoice-table-wrap"><table className="invoice-table"><thead><tr><th><input type="checkbox" checked={Boolean(filtered.length) && filtered.every((r) => selected.includes(r.id))} onChange={toggleAll} /></th><th>اسم القالب</th><th>الحساب</th><th>السعر</th><th>العملة</th><th>النوع</th><th>امتار</th><th>الصورة</th></tr></thead><tbody>{filtered.map((r) => <tr key={r.id} className={selected.includes(r.id) ? "selected" : ""} onClick={() => chooseRow(r.id)}><td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => chooseRow(r.id)} onClick={(e) => e.stopPropagation()} /></td><td><strong>{r.name}</strong><small>{dateText(r.date)}</small></td><td>{r.accountName}</td><td>{r.amount.toLocaleString("en-US")}</td><td>{r.currency === "SYP" ? "ل.س" : "$"}</td><td><span className={"invoice-type " + r.type}>{r.type === "credit" ? "له" : "عليه"}</span></td><td><input className="invoice-meters" inputMode="decimal" value={meters[r.id] || ""} onChange={(e) => setMeters((x) => ({ ...x, [r.id]: e.target.value }))} onClick={(e) => e.stopPropagation()} placeholder="—" /></td><td>{images[r.id] ? <img className="invoice-row-thumb" src={images[r.id]} alt="قالب" /> : <span className="invoice-no-image">—</span>}</td></tr>)}</tbody></table>{!filtered.length && <div className="invoice-empty"><FileText size={25} /><strong>ما في دفعات</strong><span>أضف دفعات من الحسابات أولاً.</span></div>}</div>
      </section>

      <aside className="invoice-template-panel">
        <section className="surface-card invoice-template-card">
          <div className="section-head"><div><h2>قوالب العرض</h2><p>حمّل عدة ملفات PDF ثم اختر الملف والصفحة لكل دفعة.</p></div><FileImage size={19} /></div>
          <button className="template-dropzone" onClick={() => templateRef.current?.click()} disabled={busy}><Upload size={22} /><strong>{templateFiles.length ? "إضافة ملفات قوالب" : "اختيار ملفات القوالب"}</strong><span>PDF متعدد الصفحات أو PNG / JPG — يمكنك اختيار عدة ملفات</span></button>
          <input ref={templateRef} hidden multiple type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => void chooseTemplates(e)} />
          {templateFiles.length > 0 && <>
            <div className="template-library">{templateFiles.map((file) => <button key={file.id} className={"template-file-chip " + (file.id === templateFileId ? "active" : "")} onClick={() => { setTemplateFileId(file.id); setPageIndex(0); }}><FileText size={14} /><span>{file.name}</span><b>{file.pages.length}</b></button>)}</div>
            <div className="template-page-picker"><label>العرض داخل الملف</label><select value={pageIndex} onChange={(e) => setPageIndex(Number(e.target.value))}>{(activeFile?.pages || []).map((p, i) => <option key={i} value={i}>{p.label}</option>)}</select></div>
            {activePage && <div className="template-preview"><img src={activePage.image} alt="معاينة القالب" /></div>}
            <button className="primary-btn full" onClick={applyTemplate} disabled={!activePage}><Check size={17} /> Apply — عيّن الصورة للدفعة المحددة</button>
          </>}
          <div className="template-target">{activeRow ? <><Check size={15} /> الدفعة المحددة: <strong>{activeRow.name}</strong></> : <><Plus size={15} /> حدد دفعة من الجدول</>}</div>
        </section>

        {activeRow && images[activeRow.id] && <section className="surface-card invoice-position-card">
          <div className="section-head"><div><h2>وضع صورة القالب</h2><p>اسحب الصورة داخل الإطار. موضعها يحفظ لهذه الدفعة فقط.</p></div><RotateCcw size={18} /></div>
          <div ref={stageRef} className="invoice-image-stage" onPointerMove={moveImage} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
            <img src={images[activeRow.id]} alt="قالب الدفعة" style={{ left: activePosition.x + "%", top: activePosition.y + "%" }} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); }} />
          </div>
          <div className="position-actions"><span>الموضع: {Math.round(activePosition.x)}% / {Math.round(activePosition.y)}%</span><button className="text-btn" onClick={resetPosition}><RotateCcw size={14} /> إرجاع للمنتصف</button></div>
        </section>}

        <section className="surface-card invoice-summary-card"><div className="section-head"><div><h2>ملخص التصدير</h2><p>راجع الفاتورة قبل استخراجها.</p></div></div><div className="invoice-summary-row"><span>الدفعات</span><strong>{chosen.length}</strong></div>{totals.SYP ? <div className="invoice-summary-row"><span>ليرة سورية</span><strong>{money(totals.SYP, "SYP")}</strong></div> : null}{totals.USD ? <div className="invoice-summary-row"><span>دولار</span><strong>{money(totals.USD, "USD")}</strong></div> : null}</section>
      </aside>
    </div>

    {showPreview && <div className="invoice-preview-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowPreview(false); }}>
      <div className="invoice-preview-modal" dir="rtl">
        <header><div><span className="eyebrow">PREVIEW</span><h2>معاينة الفاتورة</h2><p>هذه معاينة قبل إنشاء ملف PDF.</p></div><button className="icon-btn bordered" onClick={() => setShowPreview(false)}><X size={18} /></button></header>
        <div className="invoice-preview-page">
          <div className="invoice-preview-top"><div><h1>فاتورة رقم {invoiceNumber || "—"}</h1>{customer && <p>العميل: {customer}</p>}<small>{dateText(invoiceDate)}</small></div>{logo && <img className="invoice-preview-logo" src={logo} alt="الشعار" />}</div>
          <div className="invoice-preview-table"><div className="invoice-preview-head"><span>الحساب</span><span>اسم القالب</span><span>الصورة</span><span>السعر</span><span>النوع</span><span>امتار</span></div>
            {previewRows.map((r) => { const p = positions[r.id] || { x: 50, y: 50 }; return <div className="invoice-preview-row" key={r.id}><span>{r.accountName}</span><span><b>{r.name}</b>{imageLabels[r.id] && <small>{imageLabels[r.id]}</small>}</span><span className="preview-image-cell"><img src={images[r.id] || ""} alt="" style={{ left: p.x + "%", top: p.y + "%" }} /></span><span>{money(r.amount, r.currency)}</span><span>{r.type === "credit" ? "له" : "عليه"}</span><span>{meters[r.id] || "—"}</span></div>; })}
          </div>
          <div className="invoice-preview-total"><span>الإجمالي</span><strong>{[totals.SYP ? money(totals.SYP, "SYP") : "", totals.USD ? money(totals.USD, "USD") : ""].filter(Boolean).join("   |   ") || "0"}</strong></div>
        </div>
        <footer><button className="secondary-btn" onClick={() => setShowPreview(false)}>إغلاق</button><button className="primary-btn" disabled={busy || !chosen.length || !invoiceNumber.trim()} onClick={() => { setShowPreview(false); void exportPdf(); }}><Download size={16} /> اعتماد واستخراج PDF</button></footer>
      </div>
    </div>}
  </main>;
}
