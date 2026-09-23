import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileJson,
  FileText,
  Home as HomeIcon,
  Landmark,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";

type Currency = "SYP" | "USD";
type PaymentType = "credit" | "debit";
type View = "dashboard" | "accounts" | "account" | "backup";

type Payment = {
  id: number;
  name: string;
  amount: number;
  currency: Currency;
  type: PaymentType;
  date: string;
};

type Account = {
  id: number;
  name: string;
  owner: string;
  accent: string;
  payments: Payment[];
};

const initialAccounts: Account[] = [
  {
    id: 1,
    name: "مركز حلب للألبسة",
    owner: "أبو محمد",
    accent: "mint",
    payments: [
      { id: 11, name: "بضاعة أيلول", amount: 1250000, currency: "SYP", type: "debit", date: "2026-09-18" },
      { id: 12, name: "دفعة نقدية", amount: 500000, currency: "SYP", type: "credit", date: "2026-09-20" },
      { id: 13, name: "فاتورة شحن", amount: 420, currency: "USD", type: "debit", date: "2026-09-21" },
    ],
  },
  {
    id: 2,
    name: "شركة الندى للتوزيع",
    owner: "سامر الندى",
    accent: "violet",
    payments: [
      { id: 21, name: "دفعة أولى", amount: 850000, currency: "SYP", type: "credit", date: "2026-09-15" },
      { id: 22, name: "طلبية جملة", amount: 1250, currency: "USD", type: "debit", date: "2026-09-17" },
    ],
  },
  {
    id: 3,
    name: "محمصة باب الفرج",
    owner: "ليان خليل",
    accent: "amber",
    payments: [
      { id: 31, name: "حساب قديم", amount: 275000, currency: "SYP", type: "debit", date: "2026-09-09" },
      { id: 32, name: "تسديد كامل", amount: 275000, currency: "SYP", type: "credit", date: "2026-09-11" },
    ],
  },
  {
    id: 4,
    name: "مكتبة القلعة",
    owner: "نور الدين",
    accent: "blue",
    payments: [],
  },
];

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "نظرة عامة", icon: HomeIcon },
  { id: "accounts", label: "الحسابات", icon: WalletCards },
  { id: "backup", label: "النسخ والتصدير", icon: FileText },
];

const formatAmount = (amount: number, currency: Currency) => {
  const formatted = new Intl.NumberFormat(currency === "SYP" ? "ar-SY" : "en-US", {
    maximumFractionDigits: currency === "SYP" ? 0 : 2,
  }).format(amount);
  return currency === "SYP" ? `${formatted} ل.س` : `$${formatted}`;
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("ar-SY", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));

function calculateTotals(accounts: Account[]) {
  return (Object.keys({ SYP: true, USD: true }) as Currency[]).reduce(
    (result, currency) => {
      const payments = accounts.flatMap((account) => account.payments).filter((payment) => payment.currency === currency);
      result[currency] = {
        credit: payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0),
        debit: payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0),
      };
      return result;
    },
    {} as Record<Currency, { credit: number; debit: number }>,
  );
}

export default function Home() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [view, setView] = useState<View>("dashboard");
  const [selectedAccountId, setSelectedAccountId] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountOwner, setNewAccountOwner] = useState("");
  const [paymentDraft, setPaymentDraft] = useState({ name: "", amount: "", currency: "SYP" as Currency, type: "credit" as PaymentType, date: new Date().toISOString().slice(0, 10) });

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const totals = useMemo(() => calculateTotals(accounts), [accounts]);
  const filteredAccounts = accounts.filter((account) => `${account.name} ${account.owner}`.toLowerCase().includes(searchTerm.toLowerCase()));

  const openAccount = (id: number) => {
    setSelectedAccountId(id);
    setView("account");
    setShowMobileNav(false);
  };

  const addAccount = () => {
    if (!newAccountName.trim() || !newAccountOwner.trim()) {
      toast.error("اكتب اسم الحساب وصاحب الحساب أولاً");
      return;
    }
    const next: Account = {
      id: Date.now(),
      name: newAccountName.trim(),
      owner: newAccountOwner.trim(),
      accent: ["mint", "violet", "amber", "blue"][accounts.length % 4],
      payments: [],
    };
    setAccounts((current) => [...current, next]);
    setNewAccountName("");
    setNewAccountOwner("");
    setShowAccountModal(false);
    toast.success("انضاف الحساب بنجاح");
  };

  const addPayment = () => {
    const amount = Number(paymentDraft.amount);
    if (!paymentDraft.name.trim() || !amount || amount <= 0) {
      toast.error("اكتب اسم الدفعة والمبلغ بشكل صحيح");
      return;
    }
    const payment: Payment = { id: Date.now(), name: paymentDraft.name.trim(), amount, currency: paymentDraft.currency, type: paymentDraft.type, date: paymentDraft.date };
    setAccounts((current) => current.map((account) => account.id === selectedAccountId ? { ...account, payments: [payment, ...account.payments] } : account));
    setPaymentDraft({ name: "", amount: "", currency: "SYP", type: "credit", date: new Date().toISOString().slice(0, 10) });
    setShowPaymentModal(false);
    toast.success("انضافت الدفعة للحساب");
  };

  const deletePayment = (paymentId: number) => {
    setAccounts((current) => current.map((account) => account.id === selectedAccountId ? { ...account, payments: account.payments.filter((payment) => payment.id !== paymentId) } : account));
    toast.success("انحذفت الدفعة");
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ app: "Aleppo Center Cash", exportedAt: new Date().toISOString(), accounts }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aleppo-center-cash-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("جهزنا ملف النسخة الاحتياطية");
  };

  if (!isUnlocked) {
    return (
      <main className="login-shell" dir="rtl">
        <div className="login-ambient ambient-one" />
        <div className="login-ambient ambient-two" />
        <section className="login-card">
          <div className="brand-mark large"><Landmark size={30} strokeWidth={1.8} /></div>
          <div className="eyebrow">ALEPPO CENTER CASH <span>•</span> LOCAL FIRST</div>
          <h1>حساباتك، مرتّبة<br /><em>وبلا وجع راس.</em></h1>
          <p className="login-copy">دفتر حساباتك التجاري بمكان واحد. سريع، واضح، وبيضل على جهازك.</p>
          <div className="login-divider"><span>الدخول للمساحة الخاصة</span></div>
          <label className="field-label" htmlFor="key">مفتاح الدخول</label>
          <div className="key-input-wrap">
            <LockKeyhole size={17} />
            <input id="key" type="password" value={keyValue} onChange={(event) => setKeyValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && keyValue === "aleppo center") setIsUnlocked(true); }} placeholder="اكتب المفتاح هون" autoFocus />
          </div>
          <button className="primary-btn full" onClick={() => keyValue === "aleppo center" ? setIsUnlocked(true) : toast.error("المفتاح مو صحيح")}>فوت على الحسابات <ArrowLeft size={17} /></button>
          <div className="privacy-note"><ShieldCheck size={16} /> بياناتك محلية وما بتطلع من جهازك</div>
        </section>
        <footer className="login-footer">Aleppo Center Cash <span>© 2026</span></footer>
      </main>
    );
  }

  return (
    <main className="app-shell" dir="rtl">
      <aside className={`sidebar ${showMobileNav ? "open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-lockup">
            <div className="brand-mark"><Landmark size={22} strokeWidth={1.8} /></div>
            <div><strong>Aleppo Center</strong><span>cash book</span></div>
          </div>
          <button className="close-mobile" onClick={() => setShowMobileNav(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
        </div>
        <div className="workspace-switcher"><div className="workspace-avatar">AC</div><div><span>المساحة الحالية</span><strong>مركز حلب</strong></div><ChevronDown size={15} /></div>
        <div className="nav-group-label">التنقّل</div>
        <nav className="main-nav">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id || (id === "accounts" && view === "account") ? "active" : ""} onClick={() => { setView(id); setShowMobileNav(false); }}><Icon size={18} /><span>{label}</span>{id === "accounts" && <b>{accounts.length}</b>}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="local-card"><div className="local-card-icon"><ShieldCheck size={17} /></div><div><strong>محلي وآمن</strong><span>آخر نسخة تلقائية اليوم</span></div><Check size={16} className="check-icon" /></div>
        <button className="sidebar-profile" onClick={() => toast("إعدادات الحساب رح تكون بالنسخة الجاية") }><div className="profile-avatar">م</div><div><strong>مستخدم مركز حلب</strong><span>حساب المالك</span></div><MoreHorizontal size={17} /></button>
      </aside>
      {showMobileNav && <button className="mobile-overlay" onClick={() => setShowMobileNav(false)} aria-label="إغلاق القائمة" />}

      <section className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setShowMobileNav(true)} aria-label="فتح القائمة"><Menu size={21} /></button>
          <div className="breadcrumb"><span>مركز حلب</span><span className="breadcrumb-separator">/</span><strong>{view === "dashboard" ? "نظرة عامة" : view === "accounts" ? "الحسابات" : view === "backup" ? "النسخ والتصدير" : selectedAccount?.name}</strong></div>
          <div className="topbar-actions"><div className="saved-state"><span className="saved-dot" /> محفوظ محلياً</div><button className="icon-btn" onClick={() => toast("ما في إشعارات جديدة") } aria-label="الإشعارات"><Bell size={18} /><span className="notification-dot" /></button><div className="top-avatar">م</div></div>
        </header>

        <div className="content-wrap">
          {view === "dashboard" && <DashboardView accounts={accounts} totals={totals} onOpenAccount={openAccount} onAddPayment={() => { setSelectedAccountId(1); setShowPaymentModal(true); }} onGoAccounts={() => setView("accounts")} />}
          {view === "accounts" && <AccountsView accounts={filteredAccounts} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onOpenAccount={openAccount} onAddAccount={() => setShowAccountModal(true)} />}
          {view === "account" && selectedAccount && <AccountDetail account={selectedAccount} onBack={() => setView("accounts")} onAddPayment={() => setShowPaymentModal(true)} onDeletePayment={deletePayment} />}
          {view === "backup" && <BackupView onExport={exportBackup} onImport={() => toast("الاستيراد رح يتفعل مع نسخة IndexedDB النهائية") } />}
        </div>
      </section>

      {showPaymentModal && <Modal title={`دفعة جديدة — ${selectedAccount?.name ?? "الحساب"}`} onClose={() => setShowPaymentModal(false)}><div className="modal-form"><label>اسم الدفعة<input value={paymentDraft.name} onChange={(event) => setPaymentDraft({ ...paymentDraft, name: event.target.value })} placeholder="مثلاً: دفعة بضاعة" /></label><div className="form-grid"><label>المبلغ<input type="number" min="0" value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: event.target.value })} placeholder="0" /></label><label>العملة<select value={paymentDraft.currency} onChange={(event) => setPaymentDraft({ ...paymentDraft, currency: event.target.value as Currency })}><option value="SYP">ليرة سورية</option><option value="USD">دولار</option></select></label></div><label>التاريخ<input type="date" value={paymentDraft.date} onChange={(event) => setPaymentDraft({ ...paymentDraft, date: event.target.value })} /></label><div className="type-picker"><span>نوع الحركة</span><div><button className={paymentDraft.type === "credit" ? "selected credit" : ""} onClick={() => setPaymentDraft({ ...paymentDraft, type: "credit" })}><ArrowDownLeft size={16} /> له <small>إلك</small></button><button className={paymentDraft.type === "debit" ? "selected debit" : ""} onClick={() => setPaymentDraft({ ...paymentDraft, type: "debit" })}><ArrowUpRight size={16} /> عليه <small>إلك عليه</small></button></div></div><button className="primary-btn full" onClick={addPayment}>حفظ الدفعة <Check size={17} /></button></div></Modal>}
      {showAccountModal && <Modal title="إضافة حساب جديد" onClose={() => setShowAccountModal(false)}><div className="modal-form"><label>اسم الحساب<input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder="مثلاً: محل أبو علي" autoFocus /></label><label>اسم صاحب الحساب<input value={newAccountOwner} onChange={(event) => setNewAccountOwner(event.target.value)} placeholder="مثلاً: أحمد العلي" /></label><button className="primary-btn full" onClick={addAccount}>إضافة الحساب <Plus size={17} /></button></div></Modal>}
    </main>
  );
}

function DashboardView({ accounts, totals, onOpenAccount, onAddPayment, onGoAccounts }: { accounts: Account[]; totals: Record<Currency, { credit: number; debit: number }>; onOpenAccount: (id: number) => void; onAddPayment: () => void; onGoAccounts: () => void }) {
  const recentPayments = accounts.flatMap((account) => account.payments.map((payment) => ({ ...payment, accountName: account.name }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">الأربعاء، ٢٣ أيلول ٢٠٢٦</div><h1>أهلا، صاحب المركز <span>✦</span></h1><p>هاي لمحة سريعة عن حساباتك اليوم.</p></div><button className="primary-btn" onClick={onAddPayment}><Plus size={18} /> إضافة دفعة</button></div><div className="hero-summary"><div className="summary-copy"><span className="summary-kicker">الرصيد الصافي الإجمالي</span><div className="big-total">{formatAmount(totals.SYP.debit - totals.SYP.credit, "SYP")}</div><div className="summary-meta"><span className="positive-pill"><ArrowDownLeft size={14} /> 12.4%</span><span>مقارنة بالشهر الماضي</span></div></div><div className="summary-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><CircleDollarSign size={29} /><span>ل.س</span></div></div><div className="summary-breakdown"><div><span><i className="dot credit-dot" /> إلك</span><strong>{formatAmount(totals.SYP.credit, "SYP")}</strong></div><div><span><i className="dot debit-dot" /> عليك</span><strong>{formatAmount(totals.SYP.debit, "SYP")}</strong></div></div></div><div className="stats-grid"><StatCard icon={WalletCards} label="عدد الحسابات" value={String(accounts.length).padStart(2, "0")} note="حساب نشط" tone="blue" /><StatCard icon={ArrowDownLeft} label="إجمالي إلك" value={formatAmount(totals.SYP.credit, "SYP")} note="هذا الشهر" tone="mint" /><StatCard icon={ArrowUpRight} label="إجمالي عليك" value={formatAmount(totals.SYP.debit, "SYP")} note="هذا الشهر" tone="amber" /><StatCard icon={CircleDollarSign} label="الرصيد بالدولار" value={formatAmount(totals.USD.debit - totals.USD.credit, "USD")} note="لكل الحسابات" tone="violet" /></div><div className="dashboard-columns"><section className="surface-card recent-card"><div className="section-head"><div><h2>آخر الحركات</h2><p>آخر الدفعات المسجّلة عندك</p></div><button className="text-btn" onClick={onGoAccounts}>عرض الكل <ArrowLeft size={15} /></button></div>{recentPayments.length ? <div className="payment-list">{recentPayments.map((payment) => <PaymentRow key={payment.id} payment={payment} accountName={payment.accountName} compact />)}</div> : <EmptyState text="لسا ما في حركات" />}</section><section className="surface-card accounts-mini"><div className="section-head"><div><h2>الحسابات النشطة</h2><p>نظرة سريعة على زباينك</p></div><button className="round-icon-btn" onClick={onGoAccounts}><ArrowLeft size={16} /></button></div><div className="mini-accounts">{accounts.slice(0, 3).map((account) => <button key={account.id} className="mini-account" onClick={() => onOpenAccount(account.id)}><div className={`account-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><div><strong>{account.name}</strong><span>{account.owner}</span></div><div className="mini-balance">{account.payments.length}<small>حركة</small></div></button>)}</div></section></div></div>;
}

function AccountsView({ accounts, searchTerm, setSearchTerm, onOpenAccount, onAddAccount }: { accounts: Account[]; searchTerm: string; setSearchTerm: (value: string) => void; onOpenAccount: (id: number) => void; onAddAccount: () => void }) {
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">دفتر الحسابات</div><h1>الحسابات <span className="heading-count">{accounts.length}</span></h1><p>كل زبون إلو حسابه، وكل حركة إلها مكانها.</p></div><button className="primary-btn" onClick={onAddAccount}><Plus size={18} /> حساب جديد</button></div><div className="toolbar"><div className="search-box"><Search size={18} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="دوّر على حساب أو اسم..." /></div><button className="filter-btn"><BarChart3 size={16} /> ترتيب: الأحدث <ChevronDown size={15} /></button></div>{accounts.length ? <div className="account-grid">{accounts.map((account) => <button key={account.id} className="account-card" onClick={() => onOpenAccount(account.id)}><div className="account-card-top"><div className={`account-avatar large-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><MoreHorizontal size={18} className="muted-icon" /></div><div className="account-card-copy"><h3>{account.name}</h3><p><UserRound size={14} /> {account.owner}</p></div><div className="account-card-footer"><div><span>عدد الحركات</span><strong>{account.payments.length}</strong></div><div className="card-arrow"><ArrowLeft size={17} /></div></div></button>)}</div> : <div className="surface-card empty-search"><Search size={25} /><h3>ما لقينا شي</h3><p>جرّب اسم تاني أو أضف حساب جديد.</p></div>}</div>;
}

function AccountDetail({ account, onBack, onAddPayment, onDeletePayment }: { account: Account; onBack: () => void; onAddPayment: () => void; onDeletePayment: (id: number) => void }) {
  const currencies: Currency[] = ["SYP", "USD"];
  return <div className="page-enter"><button className="back-btn" onClick={onBack}><ArrowRightIcon /> رجعة للحسابات</button><div className="detail-heading"><div className="detail-title"><div className={`account-avatar large-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><div><div className="eyebrow">حساب زبون</div><h1>{account.name}</h1><p><UserRound size={14} /> {account.owner}</p></div></div><button className="primary-btn" onClick={onAddPayment}><Plus size={18} /> إضافة دفعة</button></div><div className="currency-summary-grid">{currencies.map((currency) => { const payments = account.payments.filter((payment) => payment.currency === currency); const credit = payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0); const debit = payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0); return <div className={`currency-card ${currency === "USD" ? "usd-card" : ""}`} key={currency}><div className="currency-card-head"><span className="currency-badge">{currency === "SYP" ? "ل.س" : "$"}</span><span>{currency === "SYP" ? "الليرة السورية" : "الدولار الأميركي"}</span></div><div className="currency-balance">{formatAmount(debit - credit, currency)}</div><div className="currency-lines"><span><i className="dot credit-dot" /> إلك <strong>{formatAmount(credit, currency)}</strong></span><span><i className="dot debit-dot" /> عليك <strong>{formatAmount(debit, currency)}</strong></span></div></div>; })}</div><section className="surface-card detail-payments"><div className="section-head"><div><h2>سجل الدفعات</h2><p>{account.payments.length} حركات مسجّلة</p></div><button className="icon-btn bordered" onClick={() => toast("التعديل رح يتفعل مع تثبيت schema الدفعات") } aria-label="تعديل"><Pencil size={16} /></button></div>{account.payments.length ? <div className="payment-list full-list">{account.payments.map((payment) => <PaymentRow key={payment.id} payment={payment} onDelete={() => onDeletePayment(payment.id)} />)}</div> : <EmptyState text="ما في دفعات بهالحساب لسا" />}</section></div>;
}

function BackupView({ onExport, onImport }: { onExport: () => void; onImport: () => void }) {
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">راحة بالك أولاً</div><h1>النسخ والتصدير</h1><p>بياناتك إلك. خزنها، صدّرها، وخليها دايماً قريبة.</p></div></div><div className="backup-hero"><div className="backup-hero-icon"><ShieldCheck size={30} /></div><div><span className="summary-kicker">حالة الحماية</span><h2>كل شي محفوظ محلياً</h2><p>ما منبعت أي بيانات على سيرفرات خارجية. آخر نسخة تلقائية كانت اليوم الساعة ٠٩:٤٢.</p></div><div className="backup-status"><Check size={16} /> جاهز</div></div><div className="export-grid"><ExportCard icon={FileJson} title="نسخة احتياطية JSON" description="رجّع كل الحسابات والدفعات بأي وقت." action="تصدير النسخة" tone="mint" onClick={onExport} /><ExportCard icon={FileText} title="تقرير PDF" description="تقرير مرتب للحسابات والحركات." action="تصدير PDF" tone="blue" onClick={() => toast("تصدير PDF رح يتفعل بالمرحلة الجاية") } /><ExportCard icon={BarChart3} title="صورة PNG" description="ملخّص بصري سريع للمشاركة." action="تصدير PNG" tone="violet" onClick={() => toast("تصدير PNG رح يتفعل بالمرحلة الجاية") } /></div><section className="surface-card import-card"><div className="import-icon"><Upload size={21} /></div><div><h3>استيراد نسخة سابقة</h3><p>اختار ملف JSON من جهازك ورجّع كل بياناتك.</p></div><button className="secondary-btn" onClick={onImport}>اختيار ملف</button></section></div>;
}

function StatCard({ icon: Icon, label, value, note, tone }: { icon: LucideIcon; label: string; value: string; note: string; tone: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function ExportCard({ icon: Icon, title, description, action, tone, onClick }: { icon: LucideIcon; title: string; description: string; action: string; tone: string; onClick: () => void }) {
  return <button className="export-card" onClick={onClick}><div className={`export-icon ${tone}`}><Icon size={21} /></div><div className="export-copy"><h3>{title}</h3><p>{description}</p></div><span className="export-action">{action} <Download size={15} /></span></button>;
}

function PaymentRow({ payment, accountName, compact, onDelete }: { payment: Payment; accountName?: string; compact?: boolean; onDelete?: () => void }) {
  return <div className="payment-row"><div className={`payment-type ${payment.type}`} >{payment.type === "credit" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</div><div className="payment-copy"><strong>{payment.name}</strong><span>{accountName ?? formatDate(payment.date)}{accountName && <> <i>•</i> {formatDate(payment.date)}</>}</span></div><div className={`payment-amount ${payment.type}`}>{payment.type === "credit" ? "+" : "−"}{formatAmount(payment.amount, payment.currency)}</div>{!compact && <button className="delete-btn" onClick={onDelete} aria-label="حذف الدفعة"><Trash2 size={16} /></button>}</div>;
}

function EmptyState({ text }: { text: string }) { return <div className="empty-state"><Sparkles size={20} /><span>{text}</span><small>لما تضيف حركة، رح تظهر هون</small></div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X size={19} /></button></div>{children}</section></div>; }
function ArrowRightIcon() { return <ArrowLeft size={16} />; }
