import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
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
import { addAuditEntry, downloadJson, downloadPng, enqueueSyncSnapshot, readAccounts, readAuditEntries, readSyncQueue, removeSyncQueueItem, restoreSnapshot, snapshotAccounts, writeAccounts } from "@/lib/localStore";
import { jsPDF } from "jspdf";
import { authenticateKey, hasAuthSession } from "@/lib/auth";
import { validateAccounts, validatePaymentDraft } from "@/lib/validation";
import { pullCloudAccounts, pushLocalAccounts, subscribeToWorkspace, SyncConflictError } from "@/lib/supabaseSync";

type Currency = "SYP" | "USD";
type PaymentType = "credit" | "debit";
type View = "dashboard" | "accounts" | "account" | "backup";

type Payment = {
  id: number;
  remoteId?: string;
  version?: number;
  name: string;
  amount: number;
  currency: Currency;
  type: PaymentType;
  date: string;
};

type Account = {
  id: number;
  remoteId?: string;
  version?: number;
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

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

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

export default function Home({ cloudUser, cloudWorkspace }: { cloudUser?: { id: string; email?: string | null } | null; cloudWorkspace?: { id: string; name: string; role: "owner" | "member" } | null } = {}) {
  const [isUnlocked, setIsUnlocked] = useState(() => Boolean(cloudUser) || hasAuthSession());
  const [keyValue, setKeyValue] = useState("");
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [storageReady, setStorageReady] = useState(false);
  const [auditEntries, setAuditEntries] = useState<{ id: number; action: "create" | "update" | "delete" | "import" | "export"; entity: "account" | "payment" | "backup"; label: string; createdAt: string }[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [selectedAccountId, setSelectedAccountId] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountOwner, setNewAccountOwner] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [paymentDraft, setPaymentDraft] = useState({ name: "", amount: "", currency: "SYP" as Currency, type: "credit" as PaymentType, date: new Date().toISOString().slice(0, 10) });
  const [syncState, setSyncState] = useState<"local" | "syncing" | "synced" | "offline" | "conflict">(cloudWorkspace ? "syncing" : "local");
  const syncTimer = useRef<number | null>(null);
  const syncInFlight = useRef(false);
  const pendingSync = useRef<{ accounts: Account[]; deletedAccountIds: { id: string; version?: number }[]; deletedPaymentIds: { id: string; version?: number }[] } | null>(null);
  const syncReadyRef = useRef(!cloudWorkspace || !cloudUser);
  const latestSyncedFingerprint = useRef<string | null>(null);
  const syncGeneration = useRef(0);
  const refreshQueuedRef = useRef(false);
  const deletedAccountIds = useRef(new Map<string, number | undefined>());
  const deletedPaymentIds = useRef(new Map<string, number | undefined>());
  const importInputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const totals = useMemo(() => calculateTotals(accounts), [accounts]);
  const filteredAccounts = accounts.filter((account) => `${account.name} ${account.owner}`.toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
    let active = true;
    Promise.all([readAccounts(), readAuditEntries()]).then(([savedAccounts, savedAudit]) => {
      if (!active) return;
      if (savedAccounts !== null) setAccounts(savedAccounts);
      setAuditEntries(savedAudit);
      setStorageReady(true);
    }).catch(() => {
      setStorageReady(true);
      toast.error("تعذر فتح التخزين المحلي، رح نكمل بوضع مؤقت");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (storageReady) void writeAccounts(accounts);
  }, [accounts, storageReady]);

  const mergeServerMetadata = (candidate: Account[], pushed: Account[]) => {
    const pushedByAccountId = new Map(pushed.map((account) => [account.id, account]));
    return candidate.map((account) => {
      const serverAccount = pushedByAccountId.get(account.id);
      if (!serverAccount) return account;
      const pushedByPaymentId = new Map(serverAccount.payments.map((payment) => [payment.id, payment]));
      return {
        ...account,
        remoteId: serverAccount.remoteId,
        version: serverAccount.version,
        payments: account.payments.map((payment) => {
          const serverPayment = pushedByPaymentId.get(payment.id);
          return serverPayment ? { ...payment, remoteId: serverPayment.remoteId, version: serverPayment.version } : payment;
        }),
      };
    });
  };

  const syncAccounts = async (
    candidate: Account[],
    deletionOverrides?: {
      deletedAccountIds?: { id: string; version?: number }[];
      deletedPaymentIds?: { id: string; version?: number }[];
    },
  ) => {
    if (!cloudWorkspace || !cloudUser || !syncReadyRef.current) return;

    const deletedAccounts = deletionOverrides?.deletedAccountIds ?? Array.from(deletedAccountIds.current, ([id, version]) => ({ id, version }));
    const deletedPayments = deletionOverrides?.deletedPaymentIds ?? Array.from(deletedPaymentIds.current, ([id, version]) => ({ id, version }));

    pendingSync.current = {
      accounts: candidate,
      deletedAccountIds: deletedAccounts,
      deletedPaymentIds: deletedPayments,
    };

    if (syncInFlight.current) return;

    syncInFlight.current = true;

    try {
      while (pendingSync.current) {
        const work = pendingSync.current;
        pendingSync.current = null;
        const generation = ++syncGeneration.current;
        setSyncState("syncing");

        try {
          const pushed = await pushLocalAccounts(
            cloudWorkspace.id,
            cloudUser.id,
            work.accounts,
            work.deletedAccountIds,
            work.deletedPaymentIds,
          );

          if (generation !== syncGeneration.current) continue;

          const latestPending = pendingSync.current;
          if (latestPending) {
            pendingSync.current = {
              accounts: mergeServerMetadata(latestPending.accounts, pushed),
              deletedAccountIds: latestPending.deletedAccountIds,
              deletedPaymentIds: latestPending.deletedPaymentIds,
            };
            continue;
          }

          const syncedAccounts = mergeServerMetadata(work.accounts, pushed);
          latestSyncedFingerprint.current = JSON.stringify(syncedAccounts);
          await writeAccounts(syncedAccounts);

          if (generation !== syncGeneration.current) continue;

          setAccounts(syncedAccounts);
          for (const deletion of work.deletedAccountIds) deletedAccountIds.current.delete(deletion.id);
          for (const deletion of work.deletedPaymentIds) deletedPaymentIds.current.delete(deletion.id);
          setSyncState("synced");

          if (refreshQueuedRef.current) {
            refreshQueuedRef.current = false;
            void pullCloudAccounts(cloudWorkspace.id).then((remoteAccounts) => {
              if (!syncReadyRef.current || syncInFlight.current) return;
              latestSyncedFingerprint.current = JSON.stringify(remoteAccounts);
              setAccounts(remoteAccounts);
              setSyncState("synced");
            }).catch(() => setSyncState("offline"));
          }
        } catch (error) {
          if (generation !== syncGeneration.current) continue;

          await enqueueSyncSnapshot({
            workspaceId: cloudWorkspace.id,
            userId: cloudUser.id,
            accounts: work.accounts,
            deletedAccountIds: work.deletedAccountIds,
            deletedPaymentIds: work.deletedPaymentIds,
          });

          setSyncState(error instanceof SyncConflictError ? "conflict" : "offline");
          toast.error(
            error instanceof SyncConflictError
              ? "في تعديل جديد من الجهاز التاني — حدّث الصفحة للمراجعة"
              : "ما في اتصال. حفظنا التعديل بطابور مزامنة محلي",
          );
        }
      }
    } finally {
      syncInFlight.current = false;
      if (pendingSync.current) void syncAccounts(pendingSync.current.accounts, {
        deletedAccountIds: pendingSync.current.deletedAccountIds,
        deletedPaymentIds: pendingSync.current.deletedPaymentIds,
      });
    }
  };

  useEffect(() => {
    if (!storageReady || !cloudWorkspace || !cloudUser) {
      syncReadyRef.current = !cloudWorkspace || !cloudUser;
      return;
    }

    syncReadyRef.current = false;
    const generation = ++syncGeneration.current;
    let active = true;

    void pullCloudAccounts(cloudWorkspace.id).then((remoteAccounts) => {
      if (!active || generation !== syncGeneration.current) return;
      latestSyncedFingerprint.current = JSON.stringify(remoteAccounts);
      setAccounts(remoteAccounts);
      setSyncState("synced");
      syncReadyRef.current = true;
    }).catch(() => {
      if (!active || generation !== syncGeneration.current) return;
      setSyncState("offline");
    });

    return () => {
      active = false;
    };
  }, [storageReady, cloudWorkspace?.id, cloudUser?.id]);

  useEffect(() => {
    if (!storageReady || !cloudWorkspace || !cloudUser || !syncReadyRef.current) return;

    const fingerprint = JSON.stringify(accounts);
    if (latestSyncedFingerprint.current === fingerprint) return;

    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      void syncAccounts(accounts);
    }, 650);

    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, [accounts, storageReady, cloudWorkspace?.id, cloudUser?.id]);

  useEffect(() => {
    if (!cloudWorkspace || !cloudUser) return;

    const refresh = () => {
      if (!syncReadyRef.current) return;
      if (syncInFlight.current || pendingSync.current) {
        refreshQueuedRef.current = true;
        return;
      }

      const generation = ++syncGeneration.current;
      void pullCloudAccounts(cloudWorkspace.id).then((remoteAccounts) => {
        if (generation !== syncGeneration.current || syncInFlight.current || pendingSync.current) return;
        latestSyncedFingerprint.current = JSON.stringify(remoteAccounts);
        setAccounts(remoteAccounts);
        setSyncState("synced");
      }).catch(() => setSyncState("offline"));
    };

    const unsubscribe = subscribeToWorkspace(cloudWorkspace.id, refresh);
    window.addEventListener("online", refresh);

    return () => {
      unsubscribe();
      window.removeEventListener("online", refresh);
    };
  }, [cloudWorkspace?.id, cloudUser?.id]);

  useEffect(() => {
    if (!cloudWorkspace || !cloudUser || !syncReadyRef.current) return;

    void readSyncQueue().then(async (queue) => {
      const matching = queue
        .filter((item) => item.workspaceId === cloudWorkspace.id && item.userId === cloudUser.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      const latest = matching.at(-1);
      if (!latest) return;

      try {
        const pushed = await pushLocalAccounts(
          latest.workspaceId,
          latest.userId,
          latest.accounts,
          latest.deletedAccountIds ?? [],
          latest.deletedPaymentIds ?? [],
        );
        const syncedAccounts = mergeServerMetadata(latest.accounts, pushed);
        latestSyncedFingerprint.current = JSON.stringify(syncedAccounts);
        setAccounts(syncedAccounts);
        await writeAccounts(syncedAccounts);
        for (const item of matching) await removeSyncQueueItem(item.id);
        for (const deletion of latest.deletedAccountIds ?? []) deletedAccountIds.current.delete(deletion.id);
        for (const deletion of latest.deletedPaymentIds ?? []) deletedPaymentIds.current.delete(deletion.id);
        setSyncState("synced");
      } catch (error) {
        setSyncState(error instanceof SyncConflictError ? "conflict" : "offline");
      }
    });
  }, [cloudWorkspace?.id, cloudUser?.id, storageReady]);

  const recordAudit = async (action: "create" | "update" | "delete" | "import" | "export", entity: "account" | "payment" | "backup", label: string) => {
    const entry = { action, entity, label, id: Date.now(), createdAt: new Date().toISOString() };
    setAuditEntries((current) => [entry, ...current].slice(0, 30));
    await addAuditEntry({ action, entity, label });
  };

  const openAccount = (id: number) => {
    setSelectedAccountId(id);
    setView("account");
    setShowMobileNav(false);
  };

  const openAccountEditor = (account: Account) => {
    setEditingAccountId(account.id);
    setNewAccountName(account.name);
    setNewAccountOwner(account.owner);
    setShowAccountModal(true);
  };

  const attemptUnlock = async () => {
    const result = await authenticateKey(keyValue);
    if (result.ok) {
      setIsUnlocked(true);
      setKeyValue("");
    } else toast.error(result.message);
  };

  const addAccount = () => {
    if (!newAccountName.trim() || !newAccountOwner.trim()) {
      toast.error("اكتب اسم الحساب وصاحب الحساب أولاً");
      return;
    }
    if (editingAccountId) {
      setAccounts((current) => current.map((account) => account.id === editingAccountId ? { ...account, name: newAccountName.trim(), owner: newAccountOwner.trim() } : account));
      void recordAudit("update", "account", newAccountName.trim());
      setEditingAccountId(null);
      setNewAccountName("");
      setNewAccountOwner("");
      setShowAccountModal(false);
      toast.success("تعدّل الحساب بنجاح");
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
    void recordAudit("create", "account", next.name);
    setNewAccountName("");
    setNewAccountOwner("");
    setShowAccountModal(false);
    toast.success("انضاف الحساب بنجاح");
  };

  const addPayment = () => {
    const validationError = validatePaymentDraft(paymentDraft);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const amount = Number(paymentDraft.amount);
    const payment: Payment = { id: editingPaymentId ?? Date.now(), name: paymentDraft.name.trim(), amount, currency: paymentDraft.currency, type: paymentDraft.type, date: paymentDraft.date };
    setAccounts((current) => current.map((account) => account.id === selectedAccountId ? { ...account, payments: editingPaymentId ? account.payments.map((item) => item.id === editingPaymentId ? payment : item) : [payment, ...account.payments] } : account));
    void recordAudit(editingPaymentId ? "update" : "create", "payment", payment.name);
    setEditingPaymentId(null);
    setPaymentDraft({ name: "", amount: "", currency: "SYP", type: "credit", date: new Date().toISOString().slice(0, 10) });
    setShowPaymentModal(false);
    toast.success("انضافت الدفعة للحساب");
  };

  const deletePayment = (paymentId: number) => {
    const payment = selectedAccount?.payments.find((item) => item.id === paymentId);
    if (!payment || !window.confirm(`متأكد بدك تحذف «${payment.name}»؟\nالحذف محلي وما في تراجع تلقائي.`)) return;
    if (payment.remoteId) deletedPaymentIds.current.set(payment.remoteId, payment.version);
    setAccounts((current) => current.map((account) => account.id === selectedAccountId ? { ...account, payments: account.payments.filter((item) => item.id !== paymentId) } : account));
    void recordAudit("delete", "payment", payment.name);
    toast.success("انحذفت الدفعة");
  };

  const deleteAccount = (accountId: number) => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account || !window.confirm(`متأكد بدك تحذف حساب «${account.name}» وكل دفعاته؟\nالحذف محلي وما في تراجع تلقائي.`)) return;
    if (account.remoteId) deletedAccountIds.current.set(account.remoteId, account.version);
    for (const payment of account.payments) {
      if (payment.remoteId) deletedPaymentIds.current.set(payment.remoteId, payment.version);
    }
    setAccounts((current) => current.filter((item) => item.id !== accountId));
    setSelectedAccountId(accounts.find((item) => item.id !== accountId)?.id ?? 0);
    setView("accounts");
    void recordAudit("delete", "account", account.name);
    toast.success("انحذف الحساب وكل حركاته");
  };

  const openPaymentEditor = (payment: Payment) => {
    setEditingPaymentId(payment.id);
    setPaymentDraft({ name: payment.name, amount: String(payment.amount), currency: payment.currency, type: payment.type, date: payment.date });
    setShowPaymentModal(true);
  };

  const exportBackup = () => {
    downloadJson(`aleppo-center-cash-${new Date().toISOString().slice(0, 10)}.json`, { app: "Aleppo Center Cash", exportedAt: new Date().toISOString(), accounts });
    void recordAudit("export", "backup", "نسخة JSON");
    toast.success("جهزنا ملف النسخة الاحتياطية");
  };

  const exportPng = (accountId?: number) => {
    const targetAccounts = accountId ? accounts.filter((account) => account.id === accountId) : accounts;
    if (!targetAccounts.length) {
      toast.error("الحساب غير موجود");
      return;
    }

    const isSingleAccount = Boolean(accountId);
    const target = targetAccounts[0];
    const reportDate = new Date().toISOString().slice(0, 10);

    if (isSingleAccount) {
      const summary = (["SYP", "USD"] as Currency[]).flatMap((currency) => {
        const payments = target.payments.filter((payment) => payment.currency === currency);
        const credit = payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0);
        const debit = payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0);
        return [
          `${currency === "SYP" ? "ل.س" : "دولار"} — له: ${formatAmount(credit, currency)}`,
          `${currency === "SYP" ? "ل.س" : "دولار"} — عليه: ${formatAmount(debit, currency)}`,
          `${currency === "SYP" ? "ل.س" : "دولار"} — الرصيد: ${formatAmount(debit - credit, currency)}`,
        ];
      });
      const paymentLines = target.payments.map((payment, index) =>
        `${index + 1}. ${payment.name} — ${payment.type === "credit" ? "له" : "عليه"} — ${formatAmount(payment.amount, payment.currency)} — ${formatDate(payment.date)}`,
      );
      downloadPng(
        `aleppo-center-cash-${target.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "-")}-${reportDate}.png`,
        "Aleppo Center Cash — تقرير حساب",
        [
          `اسم الحساب: ${target.name}`,
          `صاحب الحساب: ${target.owner}`,
          `تاريخ التقرير: ${formatDate(reportDate)}`,
          "",
          "الدفعات:",
          ...(paymentLines.length ? paymentLines : ["لا توجد دفعات"]),
          "",
          "الإجماليات:",
          ...summary,
        ],
      );
      void recordAudit("export", "backup", `تقرير PNG — ${target.name}`);
      toast.success("نزلنا تقرير الحساب كصورة PNG");
      return;
    }

    const total = totals.SYP.debit - totals.SYP.credit;
    downloadPng(`aleppo-center-cash-report-${reportDate}.png`, "Aleppo Center Cash — تقرير الحسابات", [`الرصيد الصافي: ${formatAmount(total, "SYP")}`, `عدد الحسابات: ${accounts.length}`, `آخر تحديث: ${formatDate(reportDate)}`]);
    void recordAudit("export", "backup", "تقرير PNG");
    toast.success("نزلنا التقرير كصورة PNG");
  };

  const exportPdf = async (accountId?: number) => {
    const targetAccounts = accountId ? accounts.filter((account) => account.id === accountId) : accounts;
    if (!targetAccounts.length) {
      toast.error("الحساب غير موجود");
      return;
    }

    const isSingleAccount = Boolean(accountId);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const dateLabel = new Date().toLocaleDateString("ar-SY");

    if (isSingleAccount) {
      const account = targetAccounts[0];
      const totalsByCurrency = (["SYP", "USD"] as Currency[]).map((currency) => {
        const payments = account.payments.filter((payment) => payment.currency === currency);
        const credit = payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0);
        const debit = payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0);
        return { currency, credit, debit, balance: debit - credit };
      });
      const rows = account.payments.map((payment) => `<tr><td>${escapeHtml(payment.name)}</td><td>${payment.type === "credit" ? "إلك" : "عليك"}</td><td>${escapeHtml(formatAmount(payment.amount, payment.currency))}</td><td>${escapeHtml(formatDate(payment.date))}</td></tr>`).join("");
      const summary = totalsByCurrency.map((item) => `<div style="border:1px solid #dce9e5;border-radius:10px;padding:14px;min-width:150px"><strong>${item.currency === "SYP" ? "الليرة السورية" : "الدولار الأميركي"}</strong><span style="display:block;margin-top:7px">له: ${escapeHtml(formatAmount(item.credit, item.currency))}</span><span style="display:block">عليه: ${escapeHtml(formatAmount(item.debit, item.currency))}</span><span style="display:block;font-weight:700;margin-top:4px">الرصيد: ${escapeHtml(formatAmount(item.balance, item.currency))}</span></div>`).join("");

      const report = document.createElement("div");
      report.dir = "rtl";
      report.lang = "ar";
      report.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;padding:44px;background:#fff;color:#18353a;font-family:Cairo,Arial,sans-serif;direction:rtl";
      report.innerHTML = `<header style="border-bottom:3px solid #65b18d;padding-bottom:20px;margin-bottom:24px"><h1 style="color:#173f47;margin:0 0 6px;font-size:28px">Aleppo Center Cash</h1><p style="color:#718883">تقرير حساب — ${escapeHtml(dateLabel)}</p></header><div style="margin-bottom:24px"><h2 style="margin:0 0 8px;color:#173f47">${escapeHtml(account.name)}</h2><p style="margin:0;color:#718883">صاحب الحساب: ${escapeHtml(account.owner)}</p><p style="margin:6px 0 0;color:#718883">تاريخ التقرير: ${escapeHtml(dateLabel)}</p></div><div style="display:flex;gap:12px;margin-bottom:28px">${summary}</div><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#173f47;color:white"><th style="padding:11px;text-align:right">الدفعة</th><th style="padding:11px;text-align:right">النوع</th><th style="padding:11px;text-align:right">المبلغ</th><th style="padding:11px;text-align:right">التاريخ</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="padding:18px;text-align:center;color:#718883">لا توجد دفعات</td></tr>'}</tbody></table><p style="color:#8aa09a;font-size:11px;margin-top:24px">الملف غير مشفّر. خزّنه بمكان موثوق.</p>`;
      document.body.appendChild(report);

      try {
        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        await pdf.html(report, { x: 24, y: 24, width: 547, windowWidth: 800, autoPaging: "text" });
        pdf.save(`aleppo-center-cash-${account.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "-")}-${dateStamp}.pdf`);
        void recordAudit("export", "backup", `تقرير PDF — ${account.name}`);
        toast.success("نزلنا تقرير الحساب كملف PDF");
      } catch {
        toast.error("ما قدرنا نجهّز ملف PDF، جرّب مرة تانية");
      } finally {
        report.remove();
      }
      return;
    }

    void recordAudit("export", "backup", "تقرير PDF");
    const rows = accounts.flatMap((account) => account.payments.map((payment) => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(payment.name)}</td><td>${payment.type === "credit" ? "إلك" : "عليك"}</td><td>${escapeHtml(formatAmount(payment.amount, payment.currency))}</td><td>${escapeHtml(formatDate(payment.date))}</td></tr>`)).join("");
    const report = document.createElement("div");
    report.dir = "rtl";
    report.lang = "ar";
    report.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;padding:44px;background:#fff;color:#18353a;font-family:Cairo,Arial,sans-serif;direction:rtl";
    report.innerHTML = `<header style="border-bottom:3px solid #65b18d;padding-bottom:20px;margin-bottom:28px"><h1 style="color:#173f47;margin:0 0 6px;font-size:28px">Aleppo Center Cash</h1><p style="color:#718883">تقرير الحسابات والدفعات — ${escapeHtml(dateLabel)}</p></header><div style="display:flex;gap:35px;margin-bottom:28px"><div>عدد الحسابات<strong style="display:block;font-size:24px;color:#2f896d;margin-top:5px">${accounts.length}</strong></div><div>الرصيد الصافي<strong style="display:block;font-size:24px;color:#2f896d;margin-top:5px">${escapeHtml(formatAmount(totals.SYP.debit - totals.SYP.credit, "SYP"))}</strong></div><div>الرصيد بالدولار<strong style="display:block;font-size:24px;color:#2f896d;margin-top:5px">${escapeHtml(formatAmount(totals.USD.debit - totals.USD.credit, "USD"))}</strong></div></div><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#173f47;color:white"><th style="padding:11px;text-align:right">الحساب</th><th style="padding:11px;text-align:right">الدفعة</th><th style="padding:11px;text-align:right">النوع</th><th style="padding:11px;text-align:right">المبلغ</th><th style="padding:11px;text-align:right">التاريخ</th></tr></thead><tbody>${rows}</tbody></table><p style="color:#8aa09a;font-size:11px">الملف غير مشفّر. خزّنه بمكان موثوق.</p>`;
    document.body.appendChild(report);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      await pdf.html(report, { x: 24, y: 24, width: 547, windowWidth: 800, autoPaging: "text" });
      pdf.save(`aleppo-center-cash-report-${dateStamp}.pdf`);
      toast.success("نزلنا تقرير PDF محلي على جهازك");
    } catch {
      toast.error("ما قدرنا نجهّز ملف PDF، جرّب مرة تانية");
    } finally {
      report.remove();
    }
  };

  const handleImport = () => importInputRef.current?.click();
  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as { accounts?: Account[] };
      if (!validateAccounts(payload.accounts)) throw new Error("invalid");
      if (!window.confirm("الاستيراد رح يستبدل البيانات الحالية. متأكد؟\nاعمل نسخة JSON حالية قبل التأكيد إذا بدك rollback.")) return;
      const previousAccounts = accounts;
      await snapshotAccounts(previousAccounts);
      try {
        await writeAccounts(payload.accounts);
        setAccounts(payload.accounts);
      } catch {
        const snapshot = await restoreSnapshot();
        if (snapshot) {
          setAccounts(snapshot);
          await writeAccounts(snapshot);
        }
        throw new Error("rollback");
      }
      await recordAudit("import", "backup", file.name);
      toast.success("رجّعنا النسخة الاحتياطية بنجاح");
    } catch {
      toast.error("الاستيراد فشل ورجّعنا آخر نسخة آمنة");
    }
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
            <input id="key" type="password" value={keyValue} onChange={(event) => setKeyValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void attemptUnlock(); }} placeholder="اكتب المفتاح هون" autoFocus />
          </div>
          <button className="primary-btn full" onClick={() => void attemptUnlock()}>فوت على الحسابات <ArrowLeft size={17} /></button>
          <div className="privacy-note"><ShieldCheck size={16} /> هذا المفتاح حماية بسيطة، مو تشفير كامل</div>
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
        <button className="workspace-switcher" title="انسخ Workspace ID للشريك" onClick={() => { if (cloudWorkspace?.id) { void navigator.clipboard?.writeText(cloudWorkspace.id); toast.success("اننسخ Workspace ID — ابعته للشريك"); } }}><div className="workspace-avatar">AC</div><div><span>المساحة الحالية</span><strong>{cloudWorkspace?.name ?? "مركز حلب"}</strong><small className="workspace-id" dir="ltr">{cloudWorkspace?.id ?? "محلي"}</small></div><ChevronDown size={15} /></button>
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
          <div className="topbar-actions"><div className={`saved-state sync-${syncState}`}><span className="saved-dot" /> {syncState === "syncing" ? "عم نزامن…" : syncState === "synced" ? "متزامن" : syncState === "offline" ? "محفوظ بالطابور" : syncState === "conflict" ? "في تعارض" : "محفوظ محلياً"}</div><button className="icon-btn" onClick={() => toast("ما في إشعارات جديدة") } aria-label="الإشعارات"><Bell size={18} /><span className="notification-dot" /></button><div className="top-avatar">م</div></div>
        </header>

        <div className="content-wrap">
          {view === "dashboard" && <DashboardView accounts={accounts} totals={totals} onOpenAccount={openAccount} onAddPayment={() => { setSelectedAccountId(1); setShowPaymentModal(true); }} onGoAccounts={() => setView("accounts")} />}
          {view === "accounts" && <AccountsView accounts={filteredAccounts} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onOpenAccount={openAccount} onAddAccount={() => setShowAccountModal(true)} />}
          {view === "account" && selectedAccount && <AccountDetail account={selectedAccount} onBack={() => setView("accounts")} onEditAccount={() => openAccountEditor(selectedAccount)} onDeleteAccount={() => deleteAccount(selectedAccount.id)} onAddPayment={() => { setEditingPaymentId(null); setShowPaymentModal(true); }} onEditPayment={openPaymentEditor} onDeletePayment={deletePayment} onExportPdf={() => void exportPdf(selectedAccount.id)} onExportPng={() => exportPng(selectedAccount.id)} />}
          {view === "backup" && <BackupView auditEntries={auditEntries} onExport={exportBackup} onExportPdf={exportPdf} onExportPng={exportPng} onImport={handleImport} />}
        </div>
      </section>

      {showPaymentModal && <Modal title={`${editingPaymentId ? "تعديل الدفعة" : "دفعة جديدة"} — ${selectedAccount?.name ?? "الحساب"}`} onClose={() => { setShowPaymentModal(false); setEditingPaymentId(null); }}><div className="modal-form"><label>اسم الدفعة<input value={paymentDraft.name} onChange={(event) => setPaymentDraft({ ...paymentDraft, name: event.target.value })} placeholder="مثلاً: دفعة بضاعة" /></label><div className="form-grid"><label>المبلغ<input type="number" min="0" value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: event.target.value })} placeholder="0" /></label><label>العملة<select value={paymentDraft.currency} onChange={(event) => setPaymentDraft({ ...paymentDraft, currency: event.target.value as Currency })}><option value="SYP">ليرة سورية</option><option value="USD">دولار</option></select></label></div><label>التاريخ<input type="date" value={paymentDraft.date} onChange={(event) => setPaymentDraft({ ...paymentDraft, date: event.target.value })} /></label><div className="type-picker"><span>نوع الحركة</span><div><button className={paymentDraft.type === "credit" ? "selected credit" : ""} onClick={() => setPaymentDraft({ ...paymentDraft, type: "credit" })}><ArrowDownLeft size={16} /> له <small>إلك</small></button><button className={paymentDraft.type === "debit" ? "selected debit" : ""} onClick={() => setPaymentDraft({ ...paymentDraft, type: "debit" })}><ArrowUpRight size={16} /> عليه <small>إلك عليه</small></button></div></div><button className="primary-btn full" onClick={addPayment}>{editingPaymentId ? "حفظ التعديل" : "حفظ الدفعة"} <Check size={17} /></button></div></Modal>}
      {showAccountModal && <Modal title={editingAccountId ? "تعديل الحساب" : "إضافة حساب جديد"} onClose={() => { setShowAccountModal(false); setEditingAccountId(null); setNewAccountName(""); setNewAccountOwner(""); }}><div className="modal-form"><label>اسم الحساب<input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder="مثلاً: محل أبو علي" autoFocus /></label><label>اسم صاحب الحساب<input value={newAccountOwner} onChange={(event) => setNewAccountOwner(event.target.value)} placeholder="مثلاً: أحمد العلي" /></label><button className="primary-btn full" onClick={addAccount}>{editingAccountId ? "حفظ التعديل" : "إضافة الحساب"} <Plus size={17} /></button></div></Modal>}
      <input ref={importInputRef} className="sr-only-input" type="file" accept="application/json,.json" onChange={handleImportFile} />
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

function AccountDetail({ account, onBack, onEditAccount, onDeleteAccount, onAddPayment, onEditPayment, onDeletePayment, onExportPdf, onExportPng }: { account: Account; onBack: () => void; onEditAccount: () => void; onDeleteAccount: () => void; onAddPayment: () => void; onEditPayment: (payment: Payment) => void; onDeletePayment: (id: number) => void; onExportPdf: () => void; onExportPng: () => void }) {
  const currencies: Currency[] = ["SYP", "USD"];
  const [paymentQuery, setPaymentQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentType>("all");
  const filteredPayments = account.payments.filter((payment) => {
    const matchesQuery = `${payment.name} ${payment.amount} ${payment.currency}`.toLowerCase().includes(paymentQuery.toLowerCase());
    return matchesQuery && (paymentFilter === "all" || payment.type === paymentFilter);
  });
  return <div className="page-enter"><button className="back-btn" onClick={onBack}><ArrowRightIcon /> رجعة للحسابات</button><div className="detail-heading"><div className="detail-title"><div className={`account-avatar large-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><div><div className="eyebrow">حساب زبون</div><h1>{account.name}</h1><p><UserRound size={14} /> {account.owner}</p></div></div><div className="detail-actions"><button className="secondary-btn" onClick={onEditAccount}><Pencil size={15} /> تعديل الحساب</button><button className="secondary-btn" onClick={onExportPdf}><FileText size={15} /> تصدير PDF</button><button className="secondary-btn" onClick={onExportPng}><Download size={15} /> تصدير PNG</button><button className="danger-btn" onClick={onDeleteAccount}><Trash2 size={15} /> حذف الحساب</button><button className="primary-btn" onClick={onAddPayment}><Plus size={18} /> إضافة دفعة</button></div></div><div className="currency-summary-grid">{currencies.map((currency) => { const payments = account.payments.filter((payment) => payment.currency === currency); const credit = payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0); const debit = payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0); return <div className={`currency-card ${currency === "USD" ? "usd-card" : ""}`} key={currency}><div className="currency-card-head"><span className="currency-badge">{currency === "SYP" ? "ل.س" : "$"}</span><span>{currency === "SYP" ? "الليرة السورية" : "الدولار الأميركي"}</span></div><div className="currency-balance">{formatAmount(debit - credit, currency)}</div><div className="currency-lines"><span><i className="dot credit-dot" /> إلك <strong>{formatAmount(credit, currency)}</strong></span><span><i className="dot debit-dot" /> عليك <strong>{formatAmount(debit, currency)}</strong></span></div></div>; })}</div><section className="surface-card detail-payments"><div className="section-head"><div><h2>سجل الدفعات</h2><p>{filteredPayments.length} من {account.payments.length} حركات</p></div><span className="payment-count">{paymentFilter === "all" ? "كل الحركات" : paymentFilter === "credit" ? "إلك" : "عليك"}</span></div><div className="payment-toolbar"><div className="payment-search"><Search size={15} /><input value={paymentQuery} onChange={(event) => setPaymentQuery(event.target.value)} placeholder="دوّر باسم الدفعة..." /></div><div className="payment-filters"><button className={paymentFilter === "all" ? "active" : ""} onClick={() => setPaymentFilter("all")}>الكل</button><button className={paymentFilter === "credit" ? "active credit" : ""} onClick={() => setPaymentFilter("credit")}>إلك</button><button className={paymentFilter === "debit" ? "active debit" : ""} onClick={() => setPaymentFilter("debit")}>عليك</button></div></div>{filteredPayments.length ? <div className="payment-list full-list">{filteredPayments.map((payment) => <PaymentRow key={payment.id} payment={payment} onEdit={() => onEditPayment(payment)} onDelete={() => onDeletePayment(payment.id)} />)}</div> : <EmptyState text={account.payments.length ? "ما في حركات مطابقة" : "ما في دفعات بهالحساب لسا"} />}</section></div>;
}

function BackupView({ auditEntries, onExport, onExportPdf, onExportPng, onImport }: { auditEntries: { id: number; action: string; entity: string; label: string; createdAt: string }[]; onExport: () => void; onExportPdf: () => void; onExportPng: () => void; onImport: () => void }) {
  const actionLabel: Record<string, string> = { create: "إضافة", update: "تعديل", delete: "حذف", import: "استيراد", export: "تصدير" };
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">راحة بالك أولاً</div><h1>النسخ والتصدير</h1><p>بياناتك إلك. خزنها، صدّرها، وخليها دايماً قريبة.</p></div></div><div className="backup-hero"><div className="backup-hero-icon"><ShieldCheck size={30} /></div><div><span className="summary-kicker">حالة الحماية</span><h2>كل شي محفوظ محلياً</h2><p>ما منبعت أي بيانات على سيرفرات خارجية. آخر نسخة تلقائية كانت اليوم الساعة ٠٩:٤٢.</p></div><div className="backup-status"><Check size={16} /> جاهز</div></div><div className="backup-warning"><ShieldCheck size={17} /><span><strong>تنبيه:</strong> ملفات JSON وPDF وPNG غير مشفّرة. خزّنها بمكان موثوق وما تبعتها على قنوات عامة.</span></div><div className="export-grid"><ExportCard icon={FileJson} title="نسخة احتياطية JSON" description="رجّع كل الحسابات والدفعات بأي وقت." action="تصدير النسخة" tone="mint" onClick={onExport} /><ExportCard icon={FileText} title="تقرير PDF" description="تقرير مرتب للحسابات والحركات." action="تصدير PDF" tone="blue" onClick={onExportPdf} /><ExportCard icon={BarChart3} title="صورة PNG" description="ملخّص بصري سريع للمشاركة." action="تصدير PNG" tone="violet" onClick={onExportPng} /></div><section className="surface-card import-card"><div className="import-icon"><Upload size={21} /></div><div><h3>استيراد نسخة سابقة</h3><p>الاستيراد ممكن يرجّع البيانات لحالة أقدم، راجع الملف قبل التأكيد.</p></div><button className="secondary-btn" onClick={onImport}>اختيار ملف</button></section><section className="surface-card audit-card"><div className="section-head"><div><h2>سجل التغييرات</h2><p>آخر العمليات على هالجهاز</p></div><BookOpen size={18} className="muted-icon" /></div>{auditEntries.length ? <div className="audit-list">{auditEntries.slice(0, 6).map((entry) => <div className="audit-row" key={entry.id}><span className="audit-dot" /><div><strong>{actionLabel[entry.action] ?? entry.action} — {entry.label}</strong><small>{new Intl.DateTimeFormat("ar-SY", { day: "numeric", month: "short", hour: "numeric", minute: "numeric" }).format(new Date(entry.createdAt))}</small></div></div>)}</div> : <EmptyState text="لسا ما في تغييرات مسجّلة" />}</section></div>;
}

function StatCard({ icon: Icon, label, value, note, tone }: { icon: LucideIcon; label: string; value: string; note: string; tone: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function ExportCard({ icon: Icon, title, description, action, tone, onClick }: { icon: LucideIcon; title: string; description: string; action: string; tone: string; onClick: () => void }) {
  return <button className="export-card" onClick={onClick}><div className={`export-icon ${tone}`}><Icon size={21} /></div><div className="export-copy"><h3>{title}</h3><p>{description}</p></div><span className="export-action">{action} <Download size={15} /></span></button>;
}

function PaymentRow({ payment, accountName, compact, onEdit, onDelete }: { payment: Payment; accountName?: string; compact?: boolean; onEdit?: () => void; onDelete?: () => void }) {
  return <div className="payment-row"><div className={`payment-type ${payment.type}`} >{payment.type === "credit" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</div><div className="payment-copy"><strong>{payment.name}</strong><span>{accountName ?? formatDate(payment.date)}{accountName && <> <i>•</i> {formatDate(payment.date)}</>}</span></div><div className={`payment-amount ${payment.type}`}>{payment.type === "credit" ? "+" : "−"}{formatAmount(payment.amount, payment.currency)}</div>{!compact && <><button className="delete-btn" onClick={onEdit} aria-label="تعديل الدفعة"><Pencil size={15} /></button><button className="delete-btn" onClick={onDelete} aria-label="حذف الدفعة"><Trash2 size={16} /></button></>}</div>;
}

function EmptyState({ text }: { text: string }) { return <div className="empty-state"><Sparkles size={20} /><span>{text}</span><small>لما تضيف حركة، رح تظهر هون</small></div>; }
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X size={19} /></button></div>{children}</section></div>; }
function ArrowRightIcon() { return <ArrowLeft size={16} />; }