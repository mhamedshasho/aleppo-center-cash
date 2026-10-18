import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import { ArrowLeft, Check, Download, Eye, FileImage, FileText, Heart, Image as ImageIcon, Moon, Palette, Plus, RotateCcw, Search, Sparkles, Sun, Upload, X } from "lucide-react";
import { jsPDF } from "jspdf";
import { Capacitor, registerPlugin } from "@capacitor/core";
import html2canvas from "html2canvas";
import { toast } from "sonner";

type Currency = "SYP" | "USD";
type PaymentType = "credit" | "debit";
type Payment = { id: number; name: string; amount: number; currency: Currency; type: PaymentType; date: string };
type Account = { id: number; name: string; owner: string; payments: Payment[] };
type Row = Payment & { accountId: number; accountName: string };
type TemplatePage = { label: string; image: string };
type TemplateFile = { id: string; name: string; pages: TemplatePage[] };
type Position = { x: number; y: number };
type InvoiceTheme = "light" | "dark" | "gold" | "red" | "yellow-black";
type InvoicePalette = {
  accent: string; text: string; background: string; bodyText: string; accentSoft: string;
  borderSoft: string; rowBackground: string; rowAltBackground: string; rowBorder: string;
  totalAccent: string; credit: string; debit: string; metaText: string; footerText: string;
};
const invoiceThemeOptions: { id: InvoiceTheme; label: string; color: string }[] = [
  { id: "light", label: "كلاسيكي", color: "#173f47" },
  { id: "gold", label: "ذهبي", color: "#b8891f" },
  { id: "red", label: "أحمر", color: "#8f1d2c" },
  { id: "dark", label: "داكن", color: "#242424" },
  { id: "yellow-black", label: "أصفر وأسود", color: "#f2c300" },
];
const invoicePalettes: Record<InvoiceTheme, InvoicePalette> = {
  light: {
    accent: "#173f47", text: "#ffffff", background: "#ffffff", bodyText: "#18353a",
    accentSoft: "#f1f6f3", borderSoft: "#dfe9e4", rowBackground: "#ffffff",
    rowAltBackground: "#fbfcfb", rowBorder: "#e7eeeb", totalAccent: "#2f896d",
    credit: "#4d9b7b", debit: "#b66d52", metaText: "#617873", footerText: "#7f938f",
  },
  gold: {
    accent: "#b8891f", text: "#ffffff", background: "#ffffff", bodyText: "#18353a",
    accentSoft: "#fbf3d9", borderSoft: "#ead9a7", rowBackground: "#ffffff",
    rowAltBackground: "#fbfcfb", rowBorder: "#ead9a7", totalAccent: "#a87812",
    credit: "#9f7417", debit: "#b66d52", metaText: "#786b4d", footerText: "#8a7b56",
  },
  red: {
    accent: "#8f1d2c", text: "#ffffff", background: "#ffffff", bodyText: "#18353a",
    accentSoft: "#f7e7e5", borderSoft: "#e7c8c5", rowBackground: "#ffffff",
    rowAltBackground: "#fcf7f6", rowBorder: "#e7c8c5", totalAccent: "#2f896d",
    credit: "#4d9b7b", debit: "#b66d52", metaText: "#806568", footerText: "#8c7779",
  },
  dark: {
    accent: "#f2c300", text: "#111111", background: "#0b0b0b", bodyText: "#f5f5f5",
    accentSoft: "#1b1b1b", borderSoft: "#3a3a3a", rowBackground: "#111111",
    rowAltBackground: "#171717", rowBorder: "#303030", totalAccent: "#f2c300",
    credit: "#f2c300", debit: "#ff7b7b", metaText: "#b0b0b0", footerText: "#8a8a8a",
  },
  "yellow-black": {
    accent: "#f2c300", text: "#111111", background: "#0b0b0b", bodyText: "#f5f5f5",
    accentSoft: "#1b1b1b", borderSoft: "#3a3a3a", rowBackground: "#111111",
    rowAltBackground: "#171717", rowBorder: "#303030", totalAccent: "#f2c300",
    credit: "#f2c300", debit: "#ff7b7b", metaText: "#b0b0b0", footerText: "#8a8a8a",
  },
};

type NativeFileSaverPlugin = { savePdf(options: { filename: string; base64: string }): Promise<{ uri: string }> };
const NativeFileSaver = registerPlugin<NativeFileSaverPlugin>("NativeFileSaver");

async function saveInvoicePdf(pdf: jsPDF, filename: string) {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const dataUrl = pdf.output("datauristring");
    const base64 = dataUrl.split(",")[1] || "";
    if (!base64) throw new Error("تعذر تجهيز ملف PDF");
    await NativeFileSaver.savePdf({ filename, base64 });
    return "android-download";
  }
  pdf.save(filename);
  return "browser-download";
}

const money = (n: number, c: Currency) => new Intl.NumberFormat(c === "SYP" ? "ar-SY" : "en-US", { maximumFractionDigits: c === "SYP" ? 0 : 2 }).format(n) + " " + (c === "SYP" ? "ل.س" : "$");
const dateText = (d: string) => new Intl.DateTimeFormat("ar-SY", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d + "T12:00:00"));
const esc = (v: string) => v.replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x] || x);

const LOGO_CANVAS_SIZE = 200;
const LOGO_DISPLAY_SIZE = 90;

async function normalizeLogo(file: File) {
  const source = await fileData(file);
  return await new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = LOGO_CANVAS_SIZE;
      canvas.height = LOGO_CANVAS_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("تعذر تجهيز الشعار"));
      ctx.clearRect(0, 0, LOGO_CANVAS_SIZE, LOGO_CANVAS_SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.save();
      ctx.beginPath();
      ctx.arc(LOGO_CANVAS_SIZE / 2, LOGO_CANVAS_SIZE / 2, LOGO_CANVAS_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      const w = image.naturalWidth || LOGO_CANVAS_SIZE;
      const h = image.naturalHeight || LOGO_CANVAS_SIZE;
      const scale = Math.min(LOGO_CANVAS_SIZE / w, LOGO_CANVAS_SIZE / h);
      const dw = w * scale;
      const dh = h * scale;
      const dx = (LOGO_CANVAS_SIZE - dw) / 2;
      const dy = (LOGO_CANVAS_SIZE - dh) / 2;
      // Preserve the complete uploaded image. The circle is only a mask/window.
      ctx.drawImage(image, 0, 0, w, h, dx, dy, dw, dh);
      ctx.restore();
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("تعذر قراءة الشعار"));
    image.src = source;
  });
}
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

export default function InvoiceMaker({ accounts, onBack, settingsLogo, onSaveSettingsLogo, invoiceLogoCircleColor = "#25606a", invoiceTheme, onSaveInvoiceTheme }: { accounts: Account[]; onBack: () => void; settingsLogo?: string; onSaveSettingsLogo?: (logo: string) => Promise<void>; invoiceLogoCircleColor?: string; invoiceTheme: InvoiceTheme; onSaveInvoiceTheme: (theme: InvoiceTheme) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
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
  const [logoSource, setLogoSource] = useState<"settings" | "device">("settings");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const templateRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => accounts.flatMap((a) => a.payments.map((p) => ({ ...p, accountId: a.id, accountName: a.name }))).sort((a, b) => b.date.localeCompare(a.date)), [accounts]);
  const selectedAccount = useMemo(() => accounts.find((a) => String(a.id) === accountFilter) || null, [accounts, accountFilter]);
  const accountRows = useMemo(() => accountFilter ? rows.filter((r) => String(r.accountId) === accountFilter) : [], [rows, accountFilter]);
  const filtered = useMemo(() => accountRows.filter((r) => (r.name + " " + r.accountName).toLowerCase().includes(query.toLowerCase())), [accountRows, query]);
  const chosen = rows.filter((r) => selected.includes(r.id));
  const totals = chosen.reduce((a, r) => ({ ...a, [r.currency]: (a[r.currency] || 0) + (r.type === "debit" ? r.amount : -r.amount) }), {} as Record<Currency, number>);
  const activeRow = activeId === null ? null : rows.find((r) => r.id === activeId) || null;
  const activePosition = activeId === null ? { x: 50, y: 50 } : positions[activeId] || { x: 50, y: 50 };
  const activeFile = templateFiles.find((f) => f.id === templateFileId);
  const activePage = activeFile?.pages[pageIndex];
  const effectiveLogo = logoSource === "settings" ? (settingsLogo || "") : logo;
  const invoicePalette = invoicePalettes[invoiceTheme] || invoicePalettes.light;

  const toggle = (id: number) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const chooseRow = (id: number) => { setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]); setActiveId(id); };
  const chooseTarget = (id: number) => { if (selected.includes(id)) setActiveId(id); };
  const toggleAll = () => setSelected((s) => { const visibleSelected = filtered.filter((r) => s.includes(r.id)).length; return visibleSelected === filtered.length ? s.filter((id) => !filtered.some((r) => r.id === id)) : Array.from(new Set([...s, ...filtered.map((r) => r.id)])); });
  const changeAccount = (value: string) => { setAccountFilter(value); setQuery(""); setSelected([]); setActiveId(null); setImages({}); setImageLabels({}); setPositions({}); setMeters({}); };

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
    try { setLogo(await normalizeLogo(file)); toast.success("تم قص الشعار كنافذة دائرية مع الحفاظ على كامل الصورة"); } catch { toast.error("تعذر قراءة الشعار"); }
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
    const { accent: invoiceAccent, text: invoiceText, background: invoiceBackground, bodyText: invoiceBodyText, accentSoft: invoiceAccentSoft, borderSoft: invoiceBorderSoft, rowBackground, rowAltBackground, rowBorder, totalAccent } = invoicePalette;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;";
    document.body.appendChild(host);
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      for (let start = 0; start < chosen.length; start += 10) {
        const batch = chosen.slice(start, start + 10);
        const batchTotals = batch.reduce((sum, row) => ({ ...sum, [row.currency]: (sum[row.currency] || 0) + (row.type === "debit" ? row.amount : -row.amount) }), {} as Record<Currency, number>);
        const batchTotalText = [batchTotals.SYP ? money(batchTotals.SYP, "SYP") : "", batchTotals.USD ? money(batchTotals.USD, "USD") : ""].filter(Boolean).join("   |   ") || "0";
        host.innerHTML = '<div dir="rtl" style="width:794px;height:1123px;box-sizing:border-box;padding:30px 38px;background:' + invoiceBackground + ';color:' + invoiceBodyText + ';font-family:"Noto Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif;font-weight:800;position:relative;">'
          + '<div style="height:10px;background:' + invoiceAccent + ';border-radius:6px;"></div>'
          + '<div style="position:relative;height:136px;box-sizing:border-box;margin-top:18px;padding:18px 20px;border:1px solid ' + invoiceBorderSoft + ';border-radius:16px;background:' + invoiceAccentSoft + ';">'
          + '<div style="position:absolute;right:20px;top:50%;transform:translateY(-50%);width:30%;text-align:right;z-index:1;"><div style="font-size:32px;font-weight:900;color:' + invoiceAccent + ';line-height:1.2;">فاتورة</div><div style="font-size:18px;font-weight:900;margin-top:5px;color:' + invoiceBodyText + ';">رقم ' + esc(invoiceNumber) + '</div></div>'
          + (effectiveLogo ? '<div style="position:absolute;left:50%;top:50%;width:102px;height:102px;transform:translate(-50%,-50%);border-radius:50%;border:3px solid ' + invoiceAccent + ';box-sizing:border-box;background:' + invoiceLogoCircleColor + ';z-index:2;display:flex;align-items:center;justify-content:center;"><img src="' + effectiveLogo + '" style="display:block;width:96px;height:96px;object-fit:contain;object-position:50% 50%;border-radius:50%;" /></div>' : "")
          + '<div style="position:absolute;left:20px;top:50%;transform:translateY(-50%);width:30%;text-align:left;font-size:13px;font-weight:800;line-height:1.9;color:' + invoicePalette.metaText + ';z-index:1;">'
          + (customer ? '<div><strong style="color:' + invoiceBodyText + ';">العميل:</strong> ' + esc(customer) + '</div>' : "")
          + '<div><strong style="color:' + invoiceBodyText + ';">التاريخ:</strong> ' + esc(dateText(invoiceDate)) + '</div></div></div>'
          + '<table style="width:100%;table-layout:fixed;border-collapse:collapse;margin-top:20px;border:1px solid ' + invoiceBorderSoft + ';border-radius:14px;overflow:hidden;font-size:13px;font-weight:800;direction:rtl;">'
          + '<colgroup><col style="width:19%"><col style="width:23%"><col style="width:13%"><col style="width:16%"><col style="width:13%"><col style="width:16%"></colgroup>'
          + '<thead><tr style="background:' + invoiceAccent + ';color:' + invoiceText + ';font-weight:700;">'
          + '<th style="padding:14px 8px;text-align:right;font-size:13px;font-weight:900;">القالب</th><th style="padding:14px 8px;text-align:center;font-size:13px;font-weight:900;">الصورة</th><th style="padding:12px 7px;text-align:center;">الأمتار</th><th style="padding:12px 7px;text-align:center;">المبلغ</th><th style="padding:12px 7px;text-align:center;">الحالة</th><th style="padding:12px 7px;text-align:center;">التاريخ</th></tr></thead><tbody>'
          + batch.map((r, i) => {
            const p = positions[r.id] || { x: 50, y: 50 };
            const image = images[r.id] || "";
            return '<tr style="height:92px;background:' + (i % 2 ? rowBackground : rowAltBackground) + ';">'
              + '<td style="padding:7px;font-weight:900;font-size:13px;vertical-align:middle;word-break:break-word;border-top:1px solid ' + rowBorder + ';">' + esc(r.name) + (imageLabels[r.id] ? '<div style="font-size:9px;color:' + invoicePalette.metaText + ';margin-top:3px;line-height:1.25;word-break:break-word;">' + esc(imageLabels[r.id]) + '</div>' : "") + '</td>'
              + '<td style="padding:4px;vertical-align:middle;text-align:center;border-top:1px solid ' + rowBorder + ';"><div style="height:72px;position:relative;overflow:hidden;"><img src="' + image + '" style="position:absolute;left:' + p.x + '%;top:' + p.y + '%;transform:translate(-50%,-50%);max-width:92px;max-height:68px;object-fit:contain;" /></div></td>'
              + '<td style="padding:7px;font-weight:900;font-size:13px;text-align:center;vertical-align:middle;border-top:1px solid ' + rowBorder + ';">' + esc(meters[r.id] || "—") + '</td>'
              + '<td style="padding:7px;font-weight:900;font-size:15px;text-align:center;vertical-align:middle;word-break:break-word;border-top:1px solid ' + rowBorder + ';">' + esc(money(r.amount, r.currency)) + '</td>'
              + '<td style="padding:7px;font-weight:800;text-align:center;vertical-align:middle;color:' + (r.type === "credit" ? invoicePalette.credit : invoicePalette.debit) + ';border-top:1px solid ' + rowBorder + ';">' + (r.type === "credit" ? "له" : "عليه") + '</td>'
              + '<td style="padding:7px;font-size:11px;font-weight:800;color:' + invoicePalette.metaText + ';text-align:center;vertical-align:middle;border-top:1px solid ' + rowBorder + ';">' + esc(dateText(r.date)) + '</td></tr>';
          }).join("")
          + '</tbody></table><div style="display:flex;justify-content:space-between;gap:16px;margin-top:18px;padding:14px 16px;background:' + invoiceAccentSoft + ';border:1px solid ' + invoiceBorderSoft + ';border-radius:9px;font-weight:800;">'
          + '<span>الرصيد الصافي</span><span style="color:' + totalAccent + ';text-align:left;">' + esc(batchTotalText) + '</span></div>'
          + '<div style="position:absolute;bottom:16px;left:38px;right:38px;padding-top:8px;border-top:1px solid ' + invoiceBorderSoft + ';text-align:center;font-size:9px;font-weight:800;color:' + invoicePalette.footerText + ';">Aleppo Center Cash • فاتورة مالية</div></div>';
        const exportImages = Array.from(host.querySelectorAll("img"));
        await Promise.all(exportImages.map(async (img) => {
          try {
            if (img.complete && img.naturalWidth > 0) {
              if (typeof img.decode === "function") await img.decode();
              return;
            }
            await new Promise<void>((resolve, reject) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => reject(new Error("تعذر تحميل صورة داخل الفاتورة")), { once: true });
            });
          } catch (error) {
            if (img.src.startsWith("data:image/")) throw error;
          }
        }));
        const canvas = await html2canvas(host.firstElementChild as HTMLElement, { scale: 3, backgroundColor: invoiceBackground, logging: false, useCORS: true, imageTimeout: 15000 });
        if (start > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
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
      <div className="invoice-head-actions"><button className="secondary-btn" disabled={!chosen.length} onClick={() => setShowPreview(true)}><Eye size={17} /> معاينة</button><button className="primary-btn" disabled={busy || !chosen.length} onClick={() => void exportPdf()}><Download size={17} /> استخراج PDF</button></div>
    </header>

    <section className="invoice-theme-card surface-card" aria-label="تصميم الفاتورة">
      <div className="invoice-theme-heading"><div className="invoice-theme-heading-icon"><Palette size={19} /></div><div><h2>تصميم الفاتورة</h2><p>اختيار هذا التصميم يغيّر الفاتورة فقط، وليس مظهر التطبيق. يُحفظ تلقائياً لمساحة العمل.</p></div><span className="invoice-theme-current">{invoiceThemeOptions.find((option) => option.id === invoiceTheme)?.label || "كلاسيكي"}</span></div>
      <div className="invoice-theme-options" role="group" aria-label="اختر تصميم الفاتورة">
        {invoiceThemeOptions.map((option) => <button key={option.id} type="button" aria-pressed={invoiceTheme === option.id} className={"invoice-theme-option " + (invoiceTheme === option.id ? "active" : "")} onClick={() => { if (option.id !== invoiceTheme) void onSaveInvoiceTheme(option.id).catch(() => undefined); }}>
          <span className="invoice-theme-swatch" style={{ backgroundColor: option.color }}><span /></span><span className="invoice-theme-option-label">{option.label}</span>{invoiceTheme === option.id && <Check size={16} className="invoice-theme-option-check" />}
        </button>)}
      </div>
    </section>

    <section className="invoice-toolbar surface-card">
      <div className="invoice-field invoice-account-field"><label>حساب الفاتورة</label><select value={accountFilter} onChange={(e) => changeAccount(e.target.value)}><option value="">اختر الحساب أولاً</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <div className="invoice-field"><label>رقم الفاتورة</label><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="مثلاً 28" /></div>
      <div className="invoice-field"><label>العميل</label><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="اختياري" /></div>
      <div className="invoice-field"><label>التاريخ</label><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
      
      <div className="invoice-logo-source"><label>مصدر الشعار</label><div><button className={logoSource === "settings" ? "active" : ""} onClick={() => setLogoSource("settings")} disabled={!settingsLogo}><ImageIcon size={15} /> من الإعدادات</button><button className={logoSource === "device" ? "active" : ""} onClick={() => setLogoSource("device")}><Upload size={15} /> من الجهاز</button></div></div><button className="secondary-btn invoice-logo-btn" onClick={() => logoRef.current?.click()}><ImageIcon size={16} /> {logo ? "تغيير شعار الجهاز" : "اختيار من الجهاز"}</button><button className="secondary-btn" disabled={!logoSource || !onSaveSettingsLogo || !effectiveLogo} onClick={() => onSaveSettingsLogo?.(effectiveLogo)}>حفظ هذا الشعار في الإعدادات</button><input ref={logoRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void chooseLogo(e)} />
    </section>

    <div className="invoice-maker-grid">
      <section className="surface-card invoice-payments-panel">
        <div className="section-head"><div><h2>الدفعات</h2><p>{selectedAccount ? (chosen.length + " دفعة مختارة من " + filtered.length + " دفعة للحساب " + selectedAccount.name) : "اختر الحساب أولاً لعرض دفعاته"}</p></div><button className="text-btn" onClick={toggleAll}>{chosen.length === filtered.length && filtered.length ? "إلغاء تحديد الكل" : "تحديد الكل"}</button></div>
        <div className="invoice-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={selectedAccount ? "ابحث باسم القالب..." : "اختر الحساب أولاً"} disabled={!selectedAccount} /></div>
        <div className="invoice-table-wrap"><table className="invoice-table"><thead><tr><th><input type="checkbox" checked={Boolean(filtered.length) && filtered.every((r) => selected.includes(r.id))} onChange={toggleAll} /></th><th>اسم القالب</th><th>امتار</th><th>السعر</th><th>العملة</th><th>له/عليه</th><th>الصورة</th></tr></thead><tbody>{filtered.map((r) => <tr key={r.id} className={selected.includes(r.id) ? "selected" : ""} onClick={() => chooseRow(r.id)}><td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => chooseRow(r.id)} onClick={(e) => e.stopPropagation()} /></td><td><strong>{r.name}</strong><small>{dateText(r.date)}</small></td><td><input className="invoice-meters" inputMode="decimal" value={meters[r.id] || ""} onChange={(e) => setMeters((x) => ({ ...x, [r.id]: e.target.value }))} onClick={(e) => e.stopPropagation()} placeholder="—" /></td><td>{r.amount.toLocaleString("en-US")}</td><td>{r.currency === "SYP" ? "ل.س" : "$"}</td><td><span className={"invoice-type " + r.type}>{r.type === "credit" ? "له" : "عليه"}</span></td><td>{images[r.id] ? <img className="invoice-row-thumb" src={images[r.id]} alt="قالب" /> : <span className="invoice-no-image">—</span>}</td></tr>)}</tbody></table>{!filtered.length && <div className="invoice-empty">{!selectedAccount ? <><Plus size={25} /><strong>اختر الحساب</strong><span>حدد الحساب من الأعلى لعرض دفعاته فقط.</span></> : <><FileText size={25} /><strong>ما في دفعات لهذا الحساب</strong><span>هذا الحساب لا يملك دفعات تطابق البحث.</span></>}</div>}</div>
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
          <div className="template-target"><div className="template-target-label"><label>اختيار الدفعة لوضع الصورة</label><span>{chosen.length} دفعة مختارة</span></div><select value={activeId ?? ""} onChange={(e) => { const id = Number(e.target.value); if (id) chooseTarget(id); }}><option value="">اختر من الدفعات المختارة</option>{chosen.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.amount.toLocaleString("en-US")} {r.currency === "SYP" ? "ل.س" : "$"} — {r.type === "credit" ? "له" : "عليه"}</option>)}</select>{activeRow && selected.includes(activeRow.id) && <span className="template-target-current"><Check size={14} /> يتم تعديل: {activeRow.name}</span>}{!chosen.length && <span className="template-target-empty">حدد دفعة من الجدول أولاً</span>}</div>
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
        <header className="invoice-preview-header"><div><span className="eyebrow">PREVIEW</span><h2>معاينة الفاتورة</h2><p>هذه المعاينة مصممة لتطابق شكل ملف PDF النهائي.</p></div><div className="invoice-preview-header-actions"><div className="invoice-preview-zoom"><button className="icon-btn bordered" onClick={() => setPreviewZoom((z) => Math.max(.7, +(z - .1).toFixed(1)))}>−</button><span>{Math.round(previewZoom * 100)}%</span><button className="icon-btn bordered" onClick={() => setPreviewZoom((z) => Math.min(1.3, +(z + .1).toFixed(1)))}>+</button><button className="text-btn" onClick={() => setPreviewZoom(1)}>ملاءمة</button></div><button className="icon-btn bordered" onClick={() => setShowPreview(false)}><X size={18} /></button></div></header>
        <div className="invoice-preview-scroll"><div className={"invoice-preview-page invoice-preview-theme-" + invoiceTheme} style={{ transform: `scale(${previewZoom})`, backgroundColor: invoicePalette.background, color: invoicePalette.bodyText }}>
          <div className="invoice-preview-accent" style={{ backgroundColor: invoicePalette.accent }}></div>
          <div className="invoice-preview-paper-head" style={{ backgroundColor: invoicePalette.accentSoft, borderColor: invoicePalette.borderSoft }}>
            {effectiveLogo && <img className="invoice-preview-logo" src={effectiveLogo} alt="شعار الفاتورة" style={{ backgroundColor: invoiceLogoCircleColor, borderColor: invoicePalette.accent }} />}
            <div className="invoice-preview-title" style={{ color: invoicePalette.bodyText }}><h1 style={{ color: invoicePalette.accent }}>فاتورة</h1><strong style={{ color: invoicePalette.bodyText }}>رقم {invoiceNumber || "—"}</strong></div>
            <div className="invoice-preview-meta" style={{ color: invoicePalette.metaText }}>{customer && <div><b style={{ color: invoicePalette.bodyText }}>العميل:</b> {customer}</div>}<div><b style={{ color: invoicePalette.bodyText }}>التاريخ:</b> {dateText(invoiceDate)}</div></div>
          </div>
          <div className="invoice-preview-table" style={{ backgroundColor: invoicePalette.background, borderColor: invoicePalette.borderSoft }}>
            <div className="invoice-preview-head" style={{ backgroundColor: invoicePalette.accent, color: invoicePalette.text }}><span>القالب</span><span>الصورة</span><span>الأمتار</span><span>المبلغ</span><span>الحالة</span><span>التاريخ</span></div>
            {previewRows.map((r, index) => { const p = positions[r.id] || { x: 50, y: 50 }; return <div className="invoice-preview-row" key={r.id} style={{ backgroundColor: index % 2 ? invoicePalette.rowBackground : invoicePalette.rowAltBackground, borderColor: invoicePalette.rowBorder, color: invoicePalette.bodyText }}><span><b style={{ color: invoicePalette.bodyText }}>{r.name}</b>{imageLabels[r.id] && <small style={{ color: invoicePalette.metaText }}>{imageLabels[r.id]}</small>}</span><span className="preview-image-cell">{images[r.id] ? <img src={images[r.id]} alt="" style={{ left: p.x + "%", top: p.y + "%" }} /> : <em style={{ color: invoicePalette.metaText }}>—</em>}</span><span>{meters[r.id] || "—"}</span><span>{money(r.amount, r.currency)}</span><span style={{ color: r.type === "credit" ? invoicePalette.credit : invoicePalette.debit }} className={r.type === "credit" ? "preview-credit" : "preview-debit"}>{r.type === "credit" ? "له" : "عليه"}</span><span>{dateText(r.date)}</span></div>; })}
          </div>
          <div className="invoice-preview-total" style={{ backgroundColor: invoicePalette.accentSoft, borderColor: invoicePalette.borderSoft }}><span>الرصيد الصافي</span><strong style={{ color: invoicePalette.totalAccent }}>{[totals.SYP ? money(totals.SYP, "SYP") : "", totals.USD ? money(totals.USD, "USD") : ""].filter(Boolean).join("   |   ") || "0"}</strong></div>
          <div className="invoice-preview-footer" style={{ color: invoicePalette.footerText, borderColor: invoicePalette.borderSoft }}>Aleppo Center Cash • فاتورة مالية</div>
        </div></div>
        <footer><button className="secondary-btn" onClick={() => setShowPreview(false)}>إغلاق</button><button className="primary-btn" disabled={busy || !chosen.length || !invoiceNumber.trim()} onClick={() => { setShowPreview(false); void exportPdf(); }}><Download size={16} /> اعتماد واستخراج PDF</button></footer>
      </div>
    </div>}  </main>;
}
