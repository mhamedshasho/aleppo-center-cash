import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronLeft, Cloud,
  FileText, HelpCircle, History, Palette, Search, ShieldCheck, Smartphone,
  WalletCards, X,
} from "lucide-react";

type ManualDestination = "accounts" | "invoice" | "settings" | "activity";
type ManualItem = { title: string; quick: string; details: string };
type ManualSection = {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  items: ManualItem[];
};

const sections: ManualSection[] = [
  {
    id: "daily",
    title: "الحسابات والدفعات",
    subtitle: "الشغل اليومي بأقل خطوات",
    icon: WalletCards,
    items: [
      { title: "إنشاء حساب زبون", quick: "افتح «الحسابات» ثم أضف حساباً جديداً.", details: "اكتب اسم الحساب. اسم صاحب الحساب اختياري. افتح الحساب بعد إنشائه لتجد تفاصيله وحركاته." },
      { title: "إضافة دفعة", quick: "اختر الحساب، ثم أدخل الاسم والمبلغ والعملة والتاريخ ونوع الحركة، واضغط حفظ.", details: "راجع اسم الحساب ونوع الحركة قبل الحفظ حتى تُسجَّل الحركة في المكان الصحيح." },
      { title: "معنى «له» و«عليه»", quick: "له: أنت مدين للزبون. عليه: الزبون مدين لك.", details: "رصيد الحساب يعتمد على الحركات المسجلة. تأكد من اختيار النوع الصحيح عند إضافة الدفعة." },
      { title: "تعديل أو حذف حركة", quick: "افتح الحساب واستخدم زر التعديل أو سلة المهملات بجانب الحركة.", details: "الحذف يغيّر رصيد الحساب، لذلك راجع الحركة قبل تأكيد الحذف." },
      { title: "البحث والعملات", quick: "ابحث باسم الحساب أو الحركة. الليرة والدولار يُعرضان كلٌ على حدة.", details: "لا تجمع قيم SYP وUSD معاً عند مراجعة إجمالي الحساب." },
      { title: "تصدير تقرير الحساب", quick: "من تفاصيل الحساب يمكنك تصدير تقرير PDF أو PNG.", details: "راجع الحساب المطلوب قبل التصدير للتأكد من أنك تصدّر التقرير الصحيح." },
    ],
  },
  {
    id: "invoice",
    title: "صانع الفواتير",
    subtitle: "من اختيار الدفعات إلى PDF",
    icon: FileText,
    items: [
      { title: "ابدأ الفاتورة", quick: "افتح «صانع الفواتير»، اختر الحساب وحدّد الدفعات المطلوبة.", details: "يمكنك البحث ضمن دفعات الحساب وتحديد أكثر من دفعة، مثل تحديد الصفوف في Excel." },
      { title: "اختيار تصميم الفاتورة", quick: "اختر كلاسيكي أو ذهبي أو أحمر أو داكن أو أصفر وأسود من أعلى صانع الفواتير.", details: "تصميم الفاتورة مستقل عن ثيم التطبيق الرئيسي. اختيار تصميم الفاتورة يُحفظ لمساحة العمل ويُستخدم في المعاينة وملف PDF." },
      { title: "الشعار وخلفيته", quick: "استخدم شعار الفواتير المحفوظ بالإعدادات أو اختر صورة من جهازك.", details: "خلفية دائرة الشعار تُضبط من الإعدادات ضمن «المظهر والفاتورة». اللون يخص شعار الفاتورة، ولا يغيّر شعار التطبيق." },
      { title: "إضافة قالب PDF أو صورة", quick: "حمّل ملف PDF أو صورة، ثم اختر الصفحة المطلوبة واضغط «تطبيق».", details: "يمكن تحميل عدة ملفات. حدّد الدفعة المستهدفة أولاً، ثم اختر الملف والصفحة المناسبة لتلك الدفعة." },
      { title: "الصورة والأمتار", quick: "اكتب الأمتار لكل دفعة، واسحب صورة القالب لموضعها المناسب.", details: "موضع الصورة مرتبط بالدفعة المحددة. زر «إرجاع للمنتصف» يعيد الصورة إلى وسط الإطار." },
      { title: "المعاينة والتنزيل", quick: "اكتب رقم الفاتورة، راجع المعاينة، ثم اضغط «اعتماد واستخراج PDF».", details: "لاستخراج الفاتورة يجب اختيار دفعة واحدة على الأقل وإدخال رقم الفاتورة. راجع العميل والتاريخ والشعار والدفعات قبل الاعتماد." },
    ],
  },
  {
    id: "backup",
    title: "النسخ والاستعادة",
    subtitle: "احتفظ بنسخة قبل أن تحتاجها",
    icon: ShieldCheck,
    items: [
      { title: "نسخة سحابية", quick: "من الإعدادات افتح «البيانات والنسخ» لخيارات النسخ.", details: "النسخة السحابية مرتبطة بمساحة العمل. تأكد من ظهور اتصال السحابة قبل تنفيذ عملية النسخ." },
      { title: "ملف استعادة", quick: "يمكنك تنزيل ملف JSON مشفّر والاحتفاظ به خارج التطبيق.", details: "استخدم كلمة مرور الاستعادة عند إعداد الملف. احتفظ بالملف وكلمة مروره في مكان آمن." },
      { title: "استعادة البيانات", quick: "اختر ملف الاستعادة أو النسخة السحابية ثم أدخل كلمة المرور المطلوبة.", details: "الاستعادة تستبدل البيانات الحالية بمحتوى النسخة المختارة. لا تبدأها قبل التأكد من اختيار النسخة الصحيحة." },
      { title: "متى أعمل نسخة؟", quick: "اعمل نسخة دورية، وخصوصاً قبل الاستعادة أو أي تغييرات كبيرة.", details: "لا تحتفظ بملف النسخة وحده إذا كانت كلمة مروره مطلوبة؛ احتفظ بمعلومات الاستعادة اللازمة معه." },
    ],
  },
  {
    id: "settings",
    title: "الثيمات ومساحة العمل",
    subtitle: "ضبط شكل التطبيق والاتصال",
    icon: Palette,
    items: [
      { title: "ثيم التطبيق الرئيسي", quick: "من الإعدادات > «المظهر والفاتورة» اختر فاتحاً أو داكناً أو ذهبياً أو أحمر قديماً أو Yellow & Black.", details: "هذه الخيارات تغيّر واجهة التطبيق. لا تغيّر تصميم الفاتورة الذي تختاره من داخل صانع الفواتير." },
      { title: "مساحة العمل والأعضاء", quick: "تأكد من اسم مساحة العمل الحالية قبل إضافة أو مراجعة الحركات.", details: "الحسابات والدفعات مرتبطة بمساحة العمل. يمكن نسخ Workspace ID من إعدادات مساحة العمل لمشاركته عند الحاجة إلى الانضمام إليها." },
      { title: "قفل مساحة العمل للجميع", quick: "من الإعدادات > «قفل مساحة العمل» يستطيع المالك اختيار كلمة مرور مشتركة أو PIN من ٤ أرقام أو نمط شاشة.", details: "إعداد القفل محفوظ على الخادم ويطبّق على كل أعضاء مساحة العمل، وليس على جهاز واحد. عند تغييره ينتقل جميع الأعضاء إلى طريقة الدخول الجديدة. كلمة مرور البريد لتسجيل الدخول الشخصي تبقى منفصلة. أول إعداد لا يحتاج القفل القديم، والتغيير اللاحق يتطلب القفل الحالي." },
      { title: "حالة الاتصال", quick: "راقب حالة Supabase أعلى الصفحة.", details: "الحسابات السحابية تحتاج اتصالاً بالسحابة لحفظ التغييرات ومزامنتها. إذا انقطع الاتصال، تحقق منه قبل متابعة العمل الحساس." },
      { title: "سجل التعديلات", quick: "افتح «التعديلات» لمراجعة الحركات المسجلة في مساحة العمل.", details: "يعرض السجل الإضافات والتعديلات والحذف والتصدير والاستعادة التي يسجلها التطبيق." },
      { title: "الإشعارات", quick: "افتح الإشعارات لمراجعة التنبيهات المتاحة.", details: "يمكنك تمييز الإشعارات كمقروءة من قسم الإشعارات ضمن الإعدادات." },
    ],
  },
];

const quickActions: { title: string; description: string; icon: LucideIcon; destination: ManualDestination; action: string }[] = [
  { title: "الحسابات", description: "افتح حساب زبون أو راجع رصيده", icon: WalletCards, destination: "accounts", action: "فتح الحسابات" },
  { title: "صانع الفواتير", description: "اختر الدفعات وصمّم PDF", icon: FileText, destination: "invoice", action: "إنشاء فاتورة" },
  { title: "الإعدادات", description: "الثيمات والشعار والنسخ", icon: Palette, destination: "settings", action: "فتح الإعدادات" },
];

export default function Manual({ onBack, onNavigate }: { onBack: () => void; onNavigate?: (destination: ManualDestination) => void }) {
  const [query, setQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const normalizedQuery = query.trim().toLocaleLowerCase("ar");

  const filteredSections = useMemo(() => sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !normalizedQuery || (section.title + " " + item.title + " " + item.quick + " " + item.details).toLocaleLowerCase("ar").includes(normalizedQuery)),
  })).filter((section) => section.items.length > 0), [normalizedQuery]);

  const resultCount = filteredSections.reduce((sum, section) => sum + section.items.length, 0);
  const allExpanded = filteredSections.length > 0 && filteredSections.every((section) => expandedSections.has(section.id));
  const toggleSection = (id: string) => setExpandedSections((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleItem = (id: string) => setExpandedItems((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <main className="manual-page manual-fast-page page-enter" dir="rtl">
    <header className="manual-fast-header">
      <button type="button" className="text-btn manual-back" onClick={onBack}><ChevronLeft size={16} /> رجوع</button>
      <div className="manual-fast-title-row">
        <div className="manual-fast-icon"><BookOpen size={25} /></div>
        <div><div className="eyebrow">ALEPPO CENTER CASH <span>•</span> QUICK GUIDE</div><h1>دليل الاستخدام</h1><p>مو لازم تقرأ كل شيء. اختر المهمة وشوف الخطوات المختصرة.</p></div>
      </div>
      <div className="manual-fast-rule"><CheckCircle2 size={16} /><span>للاستخدام اليومي: حساب ← دفعة ← مراجعة الرصيد</span></div>
    </header>

    <section className="manual-shortcuts" aria-label="اختصارات سريعة">
      {quickActions.map((item, index) => { const Icon = item.icon; return <button type="button" className="manual-shortcut surface-card" key={item.destination} onClick={() => onNavigate?.(item.destination)}>
        <span className="manual-shortcut-number">{String(index + 1).padStart(2, "0")}</span>
        <span className="manual-shortcut-icon"><Icon size={19} /></span>
        <span className="manual-shortcut-copy"><strong>{item.title}</strong><small>{item.description}</small><em>{item.action} <ChevronLeft size={13} /></em></span>
      </button>; })}
    </section>

    <div className="manual-toolbar surface-card">
      <div className="manual-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اكتب كلمة: فاتورة، دفعة، نسخة..." aria-label="البحث داخل دليل الاستخدام" autoComplete="off" spellCheck={false} />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="مسح البحث"><X size={15} /></button>}
      </div>
      <span className="manual-result-count">{query ? `${resultCount} نتيجة` : `${sections.reduce((sum, section) => sum + section.items.length, 0)} إجابة قصيرة`}</span>
      <button type="button" className="manual-toggle-all" onClick={() => { if (normalizedQuery) { setQuery(""); return; } setExpandedSections(allExpanded ? new Set() : new Set(filteredSections.map((section) => section.id))); }} disabled={!filteredSections.length}><ChevronDown size={15} className={allExpanded ? "is-open" : ""} />{normalizedQuery ? "مسح البحث" : allExpanded ? "طي الأقسام" : "فتح الأقسام"}</button>
    </div>

    <section className="manual-howto surface-card">
      <div className="manual-howto-title"><span><Smartphone size={18} /></span><div><h2>ابدأ في 3 خطوات</h2><p>الطريقة اليومية بدون شرح طويل</p></div></div>
      <div className="manual-howto-steps">
        <div><b>1</b><span><strong>افتح الحساب</strong><small>أنشئ حساب الزبون أو اختر حساباً موجوداً.</small></span></div>
        <div><b>2</b><span><strong>سجّل الحركة</strong><small>اسم ومبلغ وعملة وتاريخ، ثم «له» أو «عليه».</small></span></div>
        <div><b>3</b><span><strong>راجع الرصيد</strong><small>تأكد من الحساب والعملة واتجاه الحركة.</small></span></div>
      </div>
    </section>

    <div className="manual-fast-groups">
      {filteredSections.map((section, index) => {
        const Icon = section.icon;
        const isOpen = Boolean(normalizedQuery) || expandedSections.has(section.id);
        return <section className={"manual-fast-group surface-card " + (isOpen ? "is-open" : "")} id={"manual-" + section.id} key={section.id}>
          <button type="button" className="manual-fast-group-head" onClick={() => toggleSection(section.id)} aria-expanded={isOpen}>
            <span className="manual-fast-group-icon"><Icon size={19} /></span>
            <span className="manual-fast-group-copy"><strong>{section.title}</strong><small>{section.subtitle}</small></span>
            <span className="manual-fast-count">{section.items.length}</span>
            <ChevronDown size={18} className="manual-fast-chevron" />
          </button>
          {isOpen && <div className="manual-fast-answers">{section.items.map((item, itemIndex) => {
            const key = section.id + ":" + item.title;
            const itemOpen = Boolean(normalizedQuery) || expandedItems.has(key);
            return <article className={"manual-fast-answer " + (itemOpen ? "is-open" : "")} key={key}>
              <button type="button" className="manual-fast-answer-head" onClick={() => toggleItem(key)} aria-expanded={itemOpen}>
                <span className="manual-answer-number">{String(itemIndex + 1).padStart(2, "0")}</span>
                <span className="manual-answer-copy"><strong>{item.title}</strong><small>{item.quick}</small></span>
                <ChevronDown size={16} className="manual-fast-answer-chevron" />
              </button>
              {itemOpen && <p className="manual-fast-answer-details">{item.details}</p>}
            </article>;
          })}</div>}
        </section>;
      })}
    </div>

    {query && filteredSections.length === 0 && <div className="manual-empty surface-card"><Search size={20} /><strong>ما لقيت نتيجة</strong><span>جرّب كلمة أقصر مثل: حساب، له، شعار، فاتورة أو نسخة.</span></div>}

    <footer className="manual-fast-footer surface-card"><span className="manual-footer-icon"><HelpCircle size={19} /></span><div><strong>ما لقيت اللي تحتاجه؟</strong><p>اكتب كلمة في البحث فوق. وإذا ظهر خطأ، تحقّق من اتصال Supabase ودوّن الخطوة التي سببت المشكلة.</p></div><span className="manual-footer-cloud"><Cloud size={17} /></span></footer>
  </main>;
}
