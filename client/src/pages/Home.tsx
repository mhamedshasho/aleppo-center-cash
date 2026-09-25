import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  Copy,
  LogOut,
  CircleDollarSign,
  Download,
  FileText,
  Heart,
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
  UserRound,
  WalletCards,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { addAuditEntry, clearAllLocalData, downloadJson, enqueueSyncSnapshot, readAccounts, readSyncQueue, removeSyncQueueItem, writeAccounts } from "@/lib/localStore";
import { jsPDF } from "jspdf";
import { authenticateKey, hasAuthSession } from "@/lib/auth";
import { validatePaymentDraft } from "@/lib/validation";
import { deleteAccountFromCloud, deletePaymentFromCloud, deleteWorkspaceFromCloud, pullCloudAccounts, pushLocalAccounts, resetWorkspaceData, subscribeToWorkspace, verifyWorkspaceAccess, SyncConflictError, WorkspaceUnavailableError } from "@/lib/supabaseSync";
import { createCloudBackup, createEncryptedRestorationFile, restoreCloudBackup, restoreEncryptedRestorationFile, setCloudRestorePassword } from "@/lib/backup";
import ActivityView from "@/pages/Activity";

type Currency = "SYP" | "USD";
type PaymentType = "credit" | "debit";
type View = "dashboard" | "accounts" | "account" | "activity";

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

const initialAccounts: Account[] = [];

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "نظرة عامة", icon: HomeIcon },
  { id: "accounts", label: "الحسابات", icon: WalletCards },
  { id: "activity", label: "التعديلات", icon: Activity },
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

const isTransientSyncError = (error: unknown) => {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (typeof error !== "object" || error === null) return false;
  const status = "status" in error ? Number((error as { status?: unknown }).status) : 0;
  const message = error instanceof Error ? error.message : String(error);
  return [408, 425, 429, 500, 502, 503, 504].includes(status) || /failed to fetch|network|timeout|timed out|connection|abort/i.test(message);
};



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
  const [accounts, setAccounts] = useState<Account[]>(() => cloudWorkspace ? [] : initialAccounts);
  const [storageReady, setStorageReady] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [dashboardCurrency, setDashboardCurrency] = useState<Currency>("SYP");
  const [selectedAccountId, setSelectedAccountId] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const restorationFileInputRef = useRef<HTMLInputElement | null>(null);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountOwner, setNewAccountOwner] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [paymentDraft, setPaymentDraft] = useState({ name: "", amount: "", currency: "SYP" as Currency, type: "credit" as PaymentType, date: new Date().toISOString().slice(0, 10) });
  const [syncState, setSyncState] = useState<"local" | "syncing" | "synced" | "offline" | "conflict">(cloudWorkspace ? "syncing" : "offline");
  const [, setLocation] = useLocation();
  const [syncReadyVersion, setSyncReadyVersion] = useState(0);
  const syncInFlight = useRef(false);
  const pendingSync = useRef<{ accounts: Account[]; deletedAccountIds: { id: string; version?: number }[]; deletedPaymentIds: { id: string; version?: number }[] } | null>(null);
  const syncReadyRef = useRef(!cloudWorkspace || !cloudUser);
  const initialCloudSyncRef = useRef<Promise<void>>(Promise.resolve());
  const latestSyncedFingerprint = useRef<string | null>(null);
  const syncGeneration = useRef(0);
  const refreshQueuedRef = useRef(false);
  const cloudRecoveryInFlightRef = useRef(false);
  const deletedAccountIds = useRef(new Map<string, number | undefined>());
  const deletedPaymentIds = useRef(new Map<string, number | undefined>());

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const totals = useMemo(() => calculateTotals(accounts), [accounts]);
  const filteredAccounts = accounts.filter((account) => `${account.name} ${account.owner}`.toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
    let active = true;
    void clearAllLocalData().catch(() => undefined).finally(() => {
      if (active) setStorageReady(true);
    });
    return () => { active = false; };
  }, []);

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

  const flushSyncQueue = async (): Promise<boolean> => {
    if (!cloudWorkspace || !cloudUser || !syncReadyRef.current || syncInFlight.current) return true;

    const queue = await readSyncQueue();
    const matching = queue
      .filter((item) => item.workspaceId === cloudWorkspace.id && item.userId === cloudUser.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = matching.at(-1);
    if (!latest) return true;

    const deletedAccountMap = new Map<string, number | undefined>();
    const deletedPaymentMap = new Map<string, number | undefined>();

    for (const item of matching) {
      for (const deletion of item.deletedAccountIds ?? []) deletedAccountMap.set(deletion.id, deletion.version);
      for (const deletion of item.deletedPaymentIds ?? []) deletedPaymentMap.set(deletion.id, deletion.version);
    }

    const deletedAccounts = Array.from(deletedAccountMap, ([id, version]) => ({ id, version }));
    const deletedPayments = Array.from(deletedPaymentMap, ([id, version]) => ({ id, version }));

    syncInFlight.current = true;
    try {
      const pushed = await pushLocalAccounts(
        latest.workspaceId,
        latest.userId,
        latest.accounts,
        deletedAccounts,
        deletedPayments,
      );

      if (latest.accounts.length > 0 && pushed.length === 0) {
        throw new Error("Queued sync returned an empty account list");
      }

      const syncedAccounts = mergeServerMetadata(latest.accounts, pushed);
      latestSyncedFingerprint.current = JSON.stringify(syncedAccounts);
      setAccounts(syncedAccounts);

      for (const item of matching) await removeSyncQueueItem(item.id);
      for (const deletion of deletedAccounts) deletedAccountIds.current.delete(deletion.id);
      for (const deletion of deletedPayments) deletedPaymentIds.current.delete(deletion.id);
      setSyncState("synced");
      console.info("[AleppoCenterCash] queued sync flushed", { accounts: syncedAccounts.length });
      return true;
    } catch (error) {
      console.error("[AleppoCenterCash] queued sync failed", error);
      setSyncState(error instanceof SyncConflictError ? "conflict" : "offline");
      return false;
    } finally {
      syncInFlight.current = false;
    }
  };

  const syncAccounts = async (
    candidate: Account[],
    deletionOverrides?: {
      deletedAccountIds?: { id: string; version?: number }[];
      deletedPaymentIds?: { id: string; version?: number }[];
    },
  ) => {
    if (!cloudWorkspace || !cloudUser) return;

    await verifyWorkspaceAccess(cloudWorkspace.id, cloudUser.id);

    const deletedAccounts = deletionOverrides?.deletedAccountIds ?? Array.from(deletedAccountIds.current, ([id, version]) => ({ id, version }));
    const deletedPayments = deletionOverrides?.deletedPaymentIds ?? Array.from(deletedPaymentIds.current, ([id, version]) => ({ id, version }));

    pendingSync.current = {
      accounts: candidate,
      deletedAccountIds: deletedAccounts,
      deletedPaymentIds: deletedPayments,
    };

    if (syncInFlight.current) throw new Error("sync_busy");

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

          console.info("[AleppoCenterCash] pushed result:", pushed);
          console.info("[AleppoCenterCash] setAccounts called with:", pushed.length, "accounts");
          console.info("[AleppoCenterCash] sync push", {
            candidateAccounts: work.accounts.length,
            pushedAccounts: pushed.length,
            deletedAccounts: work.deletedAccountIds.length,
            deletedPayments: work.deletedPaymentIds.length,
          });

          if (work.accounts.length > 0 && pushed.length === 0) {
            throw new Error("pushLocalAccounts returned empty for a non-empty candidate");
          }

          if (generation !== syncGeneration.current) continue;

          const latestPending = (pendingSync as {
            current: {
              accounts: Account[];
              deletedAccountIds: { id: string; version?: number }[];
              deletedPaymentIds: { id: string; version?: number }[];
            } | null;
          }).current;
          if (latestPending !== null) {
            pendingSync.current = {
              accounts: mergeServerMetadata(latestPending.accounts, pushed),
              deletedAccountIds: latestPending.deletedAccountIds,
              deletedPaymentIds: latestPending.deletedPaymentIds,
            };
            continue;
          }

          const syncedAccounts = mergeServerMetadata(work.accounts, pushed);
          latestSyncedFingerprint.current = JSON.stringify(syncedAccounts);

          if (generation !== syncGeneration.current) continue;

          setAccounts(syncedAccounts);
          const queuedItems = await readSyncQueue();
          for (const item of queuedItems) {
            if (item.workspaceId === cloudWorkspace.id && item.userId === cloudUser.id) {
              await removeSyncQueueItem(item.id);
            }
          }
          for (const deletion of work.deletedAccountIds) deletedAccountIds.current.delete(deletion.id);
          for (const deletion of work.deletedPaymentIds) deletedPaymentIds.current.delete(deletion.id);
          setSyncState("synced");
          refreshQueuedRef.current = false;
        } catch (error) {
          if (generation !== syncGeneration.current) continue;

          console.error("[AleppoCenterCash] syncAccounts error", error);
          setSyncState(error instanceof SyncConflictError ? "conflict" : "offline");
          const errorCode = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
      const errorMessage = error instanceof Error ? error.message : "";
      toast.error(
            error instanceof SyncConflictError
              ? "في تعديل جديد من الجهاز التاني — حدّث الصفحة للمراجعة"
              : errorCode === "23505"
                ? "السجل موجود مسبقاً — أعد المحاولة مرة ثانية"
                : errorMessage === "sync_busy"
                  ? "المزامنة ما زالت جارية — انتظر لحظة وجرب مرة ثانية"
                  : "تعذر الاتصال بـ Supabase. لم يتم حفظ التعديل.",
          );
          throw error;
        }
      }
    } finally {
      syncInFlight.current = false;
    }
  };

  useEffect(() => {
    if (!storageReady || !cloudWorkspace || !cloudUser) {
      syncReadyRef.current = !cloudWorkspace || !cloudUser;
      initialCloudSyncRef.current = Promise.resolve();
      return;
    }

    syncReadyRef.current = false;
    const generation = ++syncGeneration.current;
    let active = true;

    const initialSync = (async () => {
      let connected = false;
      try {
        const remoteAccounts = await pullCloudAccounts(cloudWorkspace.id);
        if (!active || generation !== syncGeneration.current) return;

        latestSyncedFingerprint.current = JSON.stringify(remoteAccounts);
        setAccounts(remoteAccounts);
        setSyncState("synced");
        syncReadyRef.current = true;
        connected = true;
        setSyncReadyVersion((value) => value + 1);
      } catch (error) {
        if (!active || generation !== syncGeneration.current) return;
        console.error("[AleppoCenterCash] initial cloud pull failed", error);
        syncReadyRef.current = false;
        setSyncState("offline");
      } finally {
        if (active && generation === syncGeneration.current && !connected) {
          syncReadyRef.current = false;
          setSyncReadyVersion((value) => value + 1);
        }
      }
    })();

    initialCloudSyncRef.current = initialSync;

    return () => {
      active = false;
    };
  }, [storageReady, cloudWorkspace?.id, cloudUser?.id]);

  useEffect(() => {
    if (!cloudWorkspace || !cloudUser) return;

    let active = true;
    const verify = async () => {
      try {
        await verifyWorkspaceAccess(cloudWorkspace.id, cloudUser.id);
      } catch (error) {
        if (!active) return;
        if (error instanceof WorkspaceUnavailableError) {
          await clearAllLocalData().catch(() => undefined);
          const { supabase } = await import("@/lib/supabase");
          await supabase?.auth.signOut().catch(() => undefined);
          toast.error("مساحة العمل لم تعد موجودة. رجعناك لصفحة الدخول.");
          window.location.replace("/");
        }
      }
    };

    void verify();
    const verifyTimer = window.setInterval(() => void verify(), 5000);

    return () => {
      active = false;
      window.clearInterval(verifyTimer);
    };
  }, [cloudWorkspace?.id, cloudUser?.id]);

  useEffect(() => {
    if (!cloudWorkspace || !cloudUser) return;

    const refresh = async () => {
      if (!syncReadyRef.current) return;
      if (syncInFlight.current || pendingSync.current) {
        refreshQueuedRef.current = true;
        return;
      }

      const queueFlushed = await flushSyncQueue();
      if (!queueFlushed || syncInFlight.current || pendingSync.current) return;

      const generation = ++syncGeneration.current;
      void pullCloudAccounts(cloudWorkspace.id).then((remoteAccounts) => {
        if (generation !== syncGeneration.current || syncInFlight.current || pendingSync.current) return;
        latestSyncedFingerprint.current = JSON.stringify(remoteAccounts);
        setAccounts(remoteAccounts);
        setSyncState("synced");
      }).catch((error) => {
        console.error("[AleppoCenterCash] realtime pull failed", error);
        setSyncState("offline");
      });
    };

    const unsubscribe = subscribeToWorkspace(cloudWorkspace.id, refresh);
    window.addEventListener("online", refresh);

    return () => {
      unsubscribe();
      window.removeEventListener("online", refresh);
    };
  }, [cloudWorkspace?.id, cloudUser?.id]);

  useEffect(() => {
    if (syncReadyVersion > 0) void flushSyncQueue();
  }, [syncReadyVersion, cloudWorkspace?.id, cloudUser?.id]);

  useEffect(() => {
    if (!cloudWorkspace || !cloudUser || syncState !== "offline") return;

    let active = true;
    const recoverCloudConnection = async () => {
      if (!active || cloudRecoveryInFlightRef.current || syncInFlight.current || pendingSync.current) return;
      cloudRecoveryInFlightRef.current = true;
      setSyncState("syncing");
      try {
        const queueFlushed = await flushSyncQueue();
        if (!active || !queueFlushed) {
          if (active) setSyncState("offline");
          return;
        }
        const remoteAccounts = await pullCloudAccounts(cloudWorkspace.id);
        if (!active) return;
        latestSyncedFingerprint.current = JSON.stringify(remoteAccounts);
        setAccounts(remoteAccounts);
        setSyncState("synced");
        console.info("[AleppoCenterCash] cloud connection recovered");
      } catch (error) {
        console.error("[AleppoCenterCash] cloud recovery failed", error);
        if (active) setSyncState("offline");
      } finally {
        cloudRecoveryInFlightRef.current = false;
      }
    };

    void recoverCloudConnection();
    const timer = window.setInterval(() => void recoverCloudConnection(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [syncState, cloudWorkspace?.id, cloudUser?.id]);

  const recordAudit = async (action: "create" | "update" | "delete" | "import" | "export", entity: "account" | "payment" | "backup", label: string) => {
    const entry = { action, entity, label, id: Date.now(), createdAt: new Date().toISOString() };
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

  const resetEverything = async () => {
    if (!cloudWorkspace || !cloudWorkspace) {
      toast.error("حذف مساحة العمل متاح لأعضاء مساحة العمل");
      return;
    }
    if (!window.confirm("متأكد؟ رح تنحذف مساحة العمل نهائياً مع كل الحسابات والدفعات، وما في تراجع.")) return;
    try {
      await deleteWorkspaceFromCloud(cloudWorkspace.id);
      await clearAllLocalData().catch(() => undefined);
      const { supabase } = await import("@/lib/supabase");
      await supabase?.auth.refreshSession();
      toast.success("انحذفت مساحة العمل نهائياً");
      window.location.replace("/");
    } catch (error) {
      console.error("[AleppoCenterCash] workspace deletion failed", error);
      toast.error(error instanceof Error ? error.message : "ما قدرنا نحذف مساحة العمل");
    }
  };
  const deleteAccountData = async () => {
    if (!window.confirm("متأكد؟ رح ينحذف حسابك نهائياً. إذا كنت مالكاً لمساحة، رح تنحذف المساحة وكل حساباتها ودفعاتها أيضاً.")) return;
    try {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) throw new Error("Supabase غير مهيأ بعد");

      // Server is authoritative: delete the authenticated account/workspace
      // first. Only clear the browser after the RPC succeeds.
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;

      await clearAllLocalData();
      localStorage.removeItem(`aleppo-center-workspace:${cloudUser?.id ?? ""}`);
      await supabase.auth.signOut().catch(() => undefined);
      window.location.replace("/");
    } catch (error) {
      console.error("[AleppoCenterCash] account deletion failed", error);
      toast.error(error instanceof Error ? error.message : "ما قدرنا نحذف الحساب");
    }
  };

  const saveCloudBackup = async () => {
    if (!cloudWorkspace) return;
    try {
      const result = await createCloudBackup(cloudWorkspace.id);
      toast.success("انحفظت آخر نسخة سحابية تلقائياً");
      return result;
    } catch (error) {
      console.error("[AleppoCenterCash] automatic backup failed", error);
      toast.error("الحفظ الأساسي تم، لكن النسخة الاحتياطية لم تتحدث");
      return null;
    }
  };

  const downloadRestorationFile = async () => {
    if (!cloudWorkspace) return;
    if (backupPassword.length < 8) {
      toast.error("اكتب كلمة مرور الاستعادة أولاً");
      return;
    }
    setBackupBusy(true);
    try {
      const file = await createEncryptedRestorationFile(cloudWorkspace.id, cloudWorkspace.name, backupPassword);
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "aleppo-center-cash-restoration-" + new Date().toISOString().slice(0, 10) + ".json";
      anchor.click();
      URL.revokeObjectURL(url);
      void recordAudit("export", "backup", "ملف استعادة JSON مشفر");
      toast.success("نزلنا ملف الاستعادة المشفر");
    } catch (error) {
      console.error("[AleppoCenterCash] restoration export failed", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message.includes("restore_password_too_short") ? "كلمة مرور الاستعادة لازم تكون 8 أحرف على الأقل" : "ما قدرنا نجهّز ملف الاستعادة");
    } finally {
      setBackupBusy(false);
    }
  };

  const importRestorationFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !cloudWorkspace) return;
    if (backupPassword.length < 8) {
      toast.error("اكتب كلمة مرور الاستعادة أولاً");
      return;
    }
    if (!window.confirm("استيراد الملف سيستبدل الحسابات والدفعات وسجل التعديلات بالحالة الموجودة داخل الملف. متأكد؟")) return;
    setBackupBusy(true);
    try {
      const result = await restoreEncryptedRestorationFile(cloudWorkspace.id, backupPassword, file);
      setBackupPassword("");
      toast.success("تمت استعادة ملف الاستعادة. رح نعيد تحميل البيانات الآن.");
      console.info("[AleppoCenterCash] file restore completed", result);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error("[AleppoCenterCash] restoration file import failed", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(
        message.includes("invalid_restore_password") || message.includes("invalid_restoration_password_or_file")
          ? "كلمة المرور غير صحيحة أو ملف الاستعادة غير صالح"
          : message.includes("invalid_backup")
            ? "ملف الاستعادة لا يخص مساحة العمل الحالية"
            : "ما قدرنا نستعيد ملف الاستعادة",
      );
    } finally {
      setBackupBusy(false);
    }
  };

  const saveBackupPassword = async () => {
    if (!cloudWorkspace) return;
    if (backupPassword.length < 8) {
      toast.error("كلمة مرور الاستعادة لازم تكون 8 أحرف على الأقل");
      return;
    }
    setBackupBusy(true);
    try {
      await setCloudRestorePassword(cloudWorkspace.id, backupPassword);
      setBackupPassword("");
      toast.success("انحفظت كلمة مرور الاستعادة");
    } catch (error) {
      console.error("[AleppoCenterCash] restore password save failed", error);
      toast.error("ما قدرنا نحفظ كلمة مرور الاستعادة");
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreFromCloudBackup = async () => {
    if (!cloudWorkspace) return;
    if (backupPassword.length < 8) {
      toast.error("اكتب كلمة مرور الاستعادة");
      return;
    }
    if (!window.confirm("استعادة النسخة ستستبدل الحسابات والدفعات وسجل التعديلات بالحالة المحفوظة. متأكد؟")) return;
    setBackupBusy(true);
    try {
      const result = await restoreCloudBackup(cloudWorkspace.id, backupPassword);
      setBackupPassword("");
      toast.success("تمت الاستعادة. رح نعيد تحميل البيانات الآن.");
      console.info("[AleppoCenterCash] restore completed", result);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error("[AleppoCenterCash] restore failed", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message.includes("invalid_restore_password") ? "كلمة مرور الاستعادة غير صحيحة" : message.includes("backup_not_found") ? "ما في نسخة احتياطية محفوظة لهالمساحة بعد" : message.includes("invalid_backup") ? "النسخة الاحتياطية غير صالحة" : "ما قدرنا نستعيد النسخة الاحتياطية");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleLogout = async () => {
    const { supabase } = await import("@/lib/supabase");
    if (supabase) {
      await supabase.auth.signOut();
    }
    window.location.reload();
  };

  const copyWorkspaceId = () => {
    if (cloudWorkspace?.id) {
      void navigator.clipboard?.writeText(cloudWorkspace.id);
      toast.success("اننسخ Workspace ID");
    }
  };

  const attemptUnlock = async () => {
    const result = await authenticateKey(keyValue);
    if (result.ok) {
      setIsUnlocked(true);
      setKeyValue("");
    } else toast.error(result.message);
  };

  const commitAccounts = async (
    nextAccounts: Account[],
    deletions?: {
      deletedAccountIds?: { id: string; version?: number }[];
      deletedPaymentIds?: { id: string; version?: number }[];
    },
  ) => {
    if (!cloudWorkspace || !cloudUser) {
      setSyncState("offline");
      toast.error("لا توجد مساحة سحابية متصلة.");
      throw new Error("cloud_required");
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncState("offline");
      toast.error("لا يوجد اتصال بالإنترنت. لم يتم حفظ التعديل.");
      throw new Error("offline");
    }

    await initialCloudSyncRef.current;

    try {
      await syncAccounts(nextAccounts, deletions);
      setAccounts(nextAccounts);
      void saveCloudBackup();
    } catch (error) {
      if (error instanceof WorkspaceUnavailableError) {
        await clearAllLocalData().catch(() => undefined);
        const { supabase } = await import("@/lib/supabase");
        await supabase?.auth.signOut().catch(() => undefined);
        toast.error("مساحة العمل لم تعد موجودة. رجعناك لصفحة الدخول.");
        window.location.replace("/");
        throw error;
      }

      try {
        const recovered = await pullCloudAccounts(cloudWorkspace.id);
        const candidateRemoteIds = new Set(
          nextAccounts
            .flatMap((account) => [account.remoteId, ...account.payments.map((payment) => payment.remoteId)])
            .filter((value): value is string => Boolean(value)),
        );
        const recoveredRemoteIds = new Set(
          recovered
            .flatMap((account) => [account.remoteId, ...account.payments.map((payment) => payment.remoteId)])
            .filter((value): value is string => Boolean(value)),
        );
        const candidateExists = Array.from(candidateRemoteIds).some((id) => recoveredRemoteIds.has(id));
        const hasNewAccount = nextAccounts.some((account) =>
          !accounts.some((previous) => previous.remoteId === account.remoteId) &&
          recovered.some((remote) => remote.remoteId === account.remoteId || (remote.name === account.name && remote.owner === account.owner)),
        );
        if (candidateExists || hasNewAccount) {
          setAccounts(recovered);
          latestSyncedFingerprint.current = JSON.stringify(recovered);
          setSyncState("synced");
          return;
        }
      } catch (recoveryError) {
        console.error("[AleppoCenterCash] cloud recovery after sync failure failed", recoveryError);
      }

      setSyncState("offline");
      throw error;
    }
  };

  const addAccount = async () => {
    if (!newAccountName.trim() || !newAccountOwner.trim()) {
      toast.error("اكتب اسم الحساب وصاحب الحساب أولاً");
      return;
    }
    if (editingAccountId) {
      const nextAccounts = accounts.map((account) => account.id === editingAccountId ? { ...account, name: newAccountName.trim(), owner: newAccountOwner.trim() } : account);
      try {
        await commitAccounts(nextAccounts);
        void recordAudit("update", "account", newAccountName.trim());
        setEditingAccountId(null);
        setNewAccountName("");
        setNewAccountOwner("");
        setShowAccountModal(false);
        toast.success("تعدّل الحساب بنجاح");
      } catch {
        toast.error("ما قدرنا نحفظ تعديل الحساب بالسحابة");
      }
      return;
    }
    const next: Account = { id: Date.now(), remoteId: crypto.randomUUID(), version: 0, name: newAccountName.trim(), owner: newAccountOwner.trim(), accent: ["mint", "violet", "amber", "blue"][accounts.length % 4], payments: [] };
    try {
      await commitAccounts([...accounts, next]);
      void recordAudit("create", "account", next.name);
      setNewAccountName("");
      setNewAccountOwner("");
      setShowAccountModal(false);
      toast.success("انضاف الحساب بنجاح");
    } catch {
      toast.error("ما قدرنا نحفظ الحساب بالسحابة");
    }
  };

  const addPayment = async () => {
    const validationError = validatePaymentDraft(paymentDraft);
    if (validationError) { toast.error(validationError); return; }
    const targetAccountId = paymentAccountId ?? selectedAccountId;
    const targetAccount = accounts.find((account) => account.id === targetAccountId);
    if (!targetAccount) { toast.error("اختار حساب أولاً"); return; }
    const existingPayment = editingPaymentId ? targetAccount.payments.find((item) => item.id === editingPaymentId) : undefined;
    const payment: Payment = {
      id: editingPaymentId ?? Date.now(),
      remoteId: existingPayment?.remoteId ?? (editingPaymentId ? undefined : crypto.randomUUID()),
      version: existingPayment?.version ?? (editingPaymentId ? undefined : 0),
      name: paymentDraft.name.trim(),
      amount: Number(paymentDraft.amount),
      currency: paymentDraft.currency,
      type: paymentDraft.type,
      date: paymentDraft.date,
    };
    const nextAccounts = accounts.map((account) => account.id === targetAccountId
      ? { ...account, payments: editingPaymentId ? account.payments.map((item) => item.id === editingPaymentId ? payment : item) : [payment, ...account.payments] }
      : account);
    try {
      await commitAccounts(nextAccounts);
      void recordAudit(editingPaymentId ? "update" : "create", "payment", payment.name);
      setEditingPaymentId(null);
      setPaymentAccountId(null);
      setPaymentDraft({ name: "", amount: "", currency: "SYP", type: "credit", date: new Date().toISOString().slice(0, 10) });
      setShowPaymentModal(false);
      toast.success(editingPaymentId ? "انحفظ تعديل الدفعة" : "انضافت الدفعة للحساب");
    } catch {
      toast.error("ما قدرنا نحفظ الدفعة بالسحابة");
    }
  };

  const deletePayment = async (paymentId: number) => {
    const payment = selectedAccount?.payments.find((item) => item.id === paymentId);
    if (!payment || !window.confirm(`متأكد بدك تحذف «${payment.name}»؟\\nالحذف نهائي وما في تراجع.`)) return;

    const nextAccounts = accounts.map((account) =>
      account.id === selectedAccountId
        ? { ...account, payments: account.payments.filter((item) => item.id !== paymentId) }
        : account,
    );

    try {
      if (cloudWorkspace && cloudUser) {
        if (!payment.remoteId) {
          console.error("[AleppoCenterCash] delete payment blocked: missing remoteId", payment);
          throw new Error("الدفعة ما انزامنت بعد");
        }

        await verifyWorkspaceAccess(cloudWorkspace.id, cloudUser.id);
        await deletePaymentFromCloud(cloudWorkspace.id, payment.remoteId, payment.version);
      }

      setAccounts(nextAccounts);
      void recordAudit("delete", "payment", payment.name);
      void saveCloudBackup();
      toast.success("انحذفت الدفعة");
    } catch (error) {
      console.error("[AleppoCenterCash] delete payment failed", error);
      toast.error(error instanceof Error ? error.message : "ما قدرنا نحذف الدفعة");
    }
  };

  const deleteAccount = async (accountId: number) => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account || !window.confirm(`متأكد بدك تحذف حساب «${account.name}» وكل دفعاته؟\\nالحذف نهائي وما في تراجع.`)) return;

    const nextAccounts = accounts.filter((item) => item.id !== accountId);

    try {
      if (cloudWorkspace && cloudUser) {
        if (!account.remoteId) {
          console.error("[AleppoCenterCash] delete account blocked: missing remoteId", account);
          throw new Error("الحساب ما انزامن بعد");
        }

        await verifyWorkspaceAccess(cloudWorkspace.id, cloudUser.id);
        await deleteAccountFromCloud(cloudWorkspace.id, account.remoteId, account.version);
      }

      setAccounts(nextAccounts);
      setSelectedAccountId(nextAccounts[0]?.id ?? 0);
      setView("accounts");
      void recordAudit("delete", "account", account.name);
      void saveCloudBackup();
      toast.success("انحذف الحساب وكل حركاته");
    } catch (error) {
      console.error("[AleppoCenterCash] delete account failed", error);
      toast.error(error instanceof Error ? error.message : "ما قدرنا نحذف الحساب من السحابة");
    }
  };

  const openPaymentFromDashboard = () => {
    if (!accounts.length) {
      toast.error("أضف حساب أولاً قبل تسجيل دفعة");
      return;
    }
    setEditingPaymentId(null);
    setPaymentAccountId(accounts[0].id);
    setShowPaymentModal(true);
  };

  const openPaymentEditor = (payment: Payment) => {
    setEditingPaymentId(payment.id);
    setPaymentAccountId(null);
    setPaymentDraft({ name: payment.name, amount: String(payment.amount), currency: payment.currency, type: payment.type, date: payment.date });
    setShowPaymentModal(true);
  };

  const exportBackup = () => {
    if (!cloudWorkspace) {
      toast.error("لا توجد مساحة سحابية متصلة.");
      return;
    }
    setShowBackupModal(true);
    setShowProfileMenu(false);
  };

  const exportPng = (accountId: number) => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) { toast.error("الحساب غير موجود"); return; }
    const reportDate = new Date().toISOString().slice(0, 10);
    const recentPayments = [...account.payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const totalsByCurrency = (["SYP", "USD"] as Currency[]).map((currency) => {
      const payments = account.payments.filter((payment) => payment.currency === currency);
      const credit = payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0);
      const debit = payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0);
      return { currency, credit, debit, balance: debit - credit };
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1200; canvas.height = 1180;
    const context = canvas.getContext("2d");
    if (!context) { toast.error("ما قدرنا نجهّز صورة التقرير"); return; }
    const right = (text: string, x: number, y: number, font: string, color = "#18353a") => { context.font = font; context.fillStyle = color; context.textAlign = "right"; context.direction = "rtl"; context.fillText(text, x, y); };
    const line = (y: number) => { context.strokeStyle = "#dfe9e4"; context.lineWidth = 2; context.beginPath(); context.moveTo(70, y); context.lineTo(1130, y); context.stroke(); };
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#173f47"; context.fillRect(0, 0, canvas.width, 12);
    right("Aleppo Center Cash", 1130, 65, "700 28px Cairo, Arial, sans-serif", "#173f47");
    right("تقرير حساب", 1130, 100, "600 20px Cairo, Arial, sans-serif", "#718883");
    line(125);
    right("الحساب: " + account.name, 1130, 165, "700 22px Cairo, Arial, sans-serif");
    right("صاحب الحساب: " + account.owner, 1130, 200, "400 18px Cairo, Arial, sans-serif", "#718883");
    right("التاريخ: " + new Intl.DateTimeFormat("ar-SY").format(new Date()), 1130, 235, "400 18px Cairo, Arial, sans-serif", "#718883");
    line(265);
    right("الإجماليات", 1130, 305, "700 21px Cairo, Arial, sans-serif", "#173f47");
    const totalRows = [["ل.س — له", formatAmount(totalsByCurrency[0].credit, "SYP")], ["ل.س — عليه", formatAmount(totalsByCurrency[0].debit, "SYP")], ["ل.س — الرصيد", formatAmount(totalsByCurrency[0].balance, "SYP")], ["$ — له", formatAmount(totalsByCurrency[1].credit, "USD")], ["$ — عليه", formatAmount(totalsByCurrency[1].debit, "USD")], ["$ — الرصيد", formatAmount(totalsByCurrency[1].balance, "USD")]];
    context.fillStyle = "#f5f6f3"; context.fillRect(70, 330, 1060, 215);
    totalRows.forEach(([label, value], index) => { const y = 365 + index * 32; const balance = index === 2 || index === 5; right(label, 1085, y, "400 17px Cairo, Arial, sans-serif", balance ? "#173f47" : "#718883"); right(value, 620, y, balance ? "700 17px Cairo, Arial, sans-serif" : "600 17px Cairo, Arial, sans-serif", balance ? "#2f896d" : "#294c51"); });
    line(575);
    right("آخر الدفعات (" + recentPayments.length + ")", 1130, 620, "700 21px Cairo, Arial, sans-serif", "#173f47");
    context.fillStyle = "#f5f6f3"; context.fillRect(70, 645, 1060, 44);
    right("تاريخ", 1085, 673, "700 15px Cairo, Arial, sans-serif", "#718883"); right("وصف", 820, 673, "700 15px Cairo, Arial, sans-serif", "#718883"); right("مبلغ", 455, 673, "700 15px Cairo, Arial, sans-serif", "#718883"); right("نوع", 180, 673, "700 15px Cairo, Arial, sans-serif", "#718883");
    recentPayments.forEach((payment, index) => { const y = 725 + index * 62; if (index % 2 === 0) { context.fillStyle = "#fbfcfb"; context.fillRect(70, y - 30, 1060, 62); } right(formatDate(payment.date), 1085, y, "400 15px Cairo, Arial, sans-serif"); right(payment.name, 820, y, "400 15px Cairo, Arial, sans-serif"); right(formatAmount(payment.amount, payment.currency), 455, y, "600 15px Cairo, Arial, sans-serif"); right(payment.type === "credit" ? "له" : "عليه", 180, y, "700 15px Cairo, Arial, sans-serif", payment.type === "credit" ? "#4d9b7b" : "#c27b4e"); });
    line(1050); right("تم إنشاؤه محلياً — Aleppo Center Cash", 600, 1090, "400 13px Cairo, Arial, sans-serif", "#8aa09a");
    const anchor = document.createElement("a"); anchor.href = canvas.toDataURL("image/png"); anchor.download = "aleppo-center-cash-" + account.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "-") + "-" + reportDate + ".png"; anchor.click();
    void recordAudit("export", "backup", "تقرير PNG — " + account.name); void saveCloudBackup(); toast.success("نزلنا تقرير الحساب كصورة PNG");
  };

  const exportPdf = async (accountId: number) => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) { toast.error("الحساب غير موجود"); return; }
    const dateStamp = new Date().toISOString().slice(0, 10);
    const recentPayments = [...account.payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const totalsByCurrency = (["SYP", "USD"] as Currency[]).map((currency) => {
      const payments = account.payments.filter((payment) => payment.currency === currency);
      const credit = payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0);
      const debit = payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0);
      return { currency, credit, debit, balance: debit - credit };
    });
    const rows = recentPayments.map((payment) => "<tr><td style=\"padding:6px 8px;border-bottom:1px solid #eef2ef;\">" + escapeHtml(formatDate(payment.date)) + "</td><td style=\"padding:6px 8px;border-bottom:1px solid #eef2ef;\">" + escapeHtml(payment.name) + "</td><td style=\"padding:6px 8px;border-bottom:1px solid #eef2ef;\">" + escapeHtml(formatAmount(payment.amount, payment.currency)) + "</td><td style=\"padding:6px 8px;border-bottom:1px solid #eef2ef;color:" + (payment.type === "credit" ? "#4d9b7b" : "#c27b4e") + ";\">" + (payment.type === "credit" ? "له" : "عليه") + "</td></tr>").join("");
    const report = document.createElement("div"); report.dir = "rtl"; report.lang = "ar";
    report.style.cssText = "position:fixed;left:-10000px;top:0;width:600px;height:760px;padding:24px;background:#fff;color:#18353a;font-family:Cairo,Arial,sans-serif;direction:rtl;box-sizing:border-box;";
    report.innerHTML = "<div style=\"display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid #173f47;\"><h1 style=\"margin:0;font-size:18px;color:#173f47;\">Aleppo Center Cash</h1><span style=\"font-size:12px;color:#718883;\">تقرير حساب</span></div>"
      + "<table style=\"width:100%;font-size:11px;margin-bottom:12px;border-collapse:collapse;\"><tr><td style=\"color:#718883;padding:2px 0;\">الحساب:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(account.name) + "</td></tr><tr><td style=\"color:#718883;padding:2px 0;\">صاحب الحساب:</td><td style=\"padding:2px 0;\">" + escapeHtml(account.owner) + "</td></tr><tr><td style=\"color:#718883;padding:2px 0;\">التاريخ:</td><td style=\"padding:2px 0;\">" + escapeHtml(new Intl.DateTimeFormat("ar-SY").format(new Date())) + "</td></tr></table>"
      + "<div style=\"padding:10px 12px;margin-bottom:12px;background:#f5f6f3;border-radius:8px;\"><h3 style=\"margin:0 0 6px;font-size:13px;color:#173f47;\">الإجماليات</h3><table style=\"width:100%;font-size:10px;border-collapse:collapse;\"><tr><td style=\"color:#718883;padding:2px 0;\">ل.س — له:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[0].credit, "SYP")) + "</td></tr><tr><td style=\"color:#718883;padding:2px 0;\">ل.س — عليه:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[0].debit, "SYP")) + "</td></tr><tr><td style=\"color:#173f47;font-weight:600;padding:2px 0;\">ل.س — الرصيد:</td><td style=\"color:#2f896d;font-weight:700;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[0].balance, "SYP")) + "</td></tr><tr><td colspan=\"2\" style=\"height:4px;\"></td></tr><tr><td style=\"color:#718883;padding:2px 0;\">$ — له:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[1].credit, "USD")) + "</td></tr><tr><td style=\"color:#718883;padding:2px 0;\">$ — عليه:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[1].debit, "USD")) + "</td></tr><tr><td style=\"color:#173f47;font-weight:600;padding:2px 0;\">$ — الرصيد:</td><td style=\"color:#2f896d;font-weight:700;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[1].balance, "USD")) + "</td></tr></table></div>"
      + "<h3 style=\"margin:0 0 6px;font-size:13px;color:#173f47;\">آخر الدفعات (" + recentPayments.length + ")</h3><table style=\"width:100%;border-collapse:collapse;font-size:9px;\"><thead><tr style=\"background:#f5f6f3;\"><th style=\"padding:4px;text-align:right;color:#718883;\">تاريخ</th><th style=\"padding:4px;text-align:right;color:#718883;\">وصف</th><th style=\"padding:4px;text-align:right;color:#718883;\">مبلغ</th><th style=\"padding:4px;text-align:right;color:#718883;\">نوع</th></tr></thead><tbody>" + (rows || "<tr><td colspan=\"4\" style=\"padding:8px;text-align:center;color:#718883;\">لا توجد دفعات</td></tr>") + "</tbody></table>"
      + "<p style=\"margin:12px 0 0;padding-top:6px;border-top:1px solid #eef2ef;font-size:9px;color:#8aa09a;text-align:center;\">تم إنشاؤه محلياً</p>";
    document.body.appendChild(report);
    void saveCloudBackup(); try { const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" }); await pdf.html(report, { x: 24, y: 24, width: 547, windowWidth: 600, autoPaging: "text" }); pdf.save("aleppo-center-cash-" + account.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "-") + "-" + dateStamp + ".pdf"); void recordAudit("export", "backup", "تقرير PDF — " + account.name); toast.success("نزلنا تقرير الحساب كملف PDF"); } catch { toast.error("ما قدرنا نجهّز ملف PDF، جرّب مرة تانية"); } finally { report.remove(); }
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
        <div className="profile-menu-wrapper">
          <button className="sidebar-profile" onClick={() => setShowProfileMenu((current) => !current)} aria-expanded={showProfileMenu} aria-haspopup="menu">
            <div className="profile-avatar">{cloudUser?.email?.[0]?.toUpperCase() ?? "م"}</div>
            <div><strong>{cloudWorkspace?.name ?? "مركز حلب"}</strong><span>{cloudUser?.email ?? "حساب المالك"}</span></div>
            <MoreHorizontal size={17} />
          </button>
          {showProfileMenu && (
            <div className="profile-menu" role="menu">
              <div className="profile-menu-item info">
                <span>📧 البريد</span>
                <strong dir="ltr">{cloudUser?.email ?? "—"}</strong>
              </div>
              <div className="profile-menu-item info">
                <span>🏪 Workspace</span>
                <strong>{cloudWorkspace?.name ?? "مركز حلب"}</strong>
              </div>
              <button className="profile-menu-item" onClick={copyWorkspaceId} disabled={!cloudWorkspace?.id} role="menuitem">
                <span>🆔 Workspace ID</span>
                <strong dir="ltr" className="mono">{cloudWorkspace?.id?.slice(0, 8) ?? "—"}{cloudWorkspace?.id ? "…" : ""}</strong>
                <Copy size={14} />
              </button>
              <button className="profile-menu-item" onClick={() => { setShowBackupModal(true); setShowProfileMenu(false); }} role="menuitem">
                <span>🛡️ النسخ والاستعادة</span>
                <ShieldCheck size={14} />
              </button>
              <button className="profile-menu-item" onClick={() => void exportBackup()} role="menuitem">
                <span>💾 ملف استعادة JSON</span>
                <Download size={14} />
              </button>
              <button className="profile-menu-item" onClick={() => { setLocation("/credits"); }} role="menuitem">
                <span>👥 فريق التطوير</span>
                <Heart size={14} />
              </button>
              {cloudWorkspace && (
                <>
                  <div className="profile-menu-divider" />
                  <button className="profile-menu-item danger" onClick={() => void resetEverything()} role="menuitem">
                    <span>🗑️ حذف مساحة العمل نهائياً</span>
                    <Trash2 size={14} />
                  </button>
                </>
              )}
              <div className="profile-menu-divider" />
              <button className="profile-menu-item danger" onClick={() => void deleteAccountData()} role="menuitem">
                <span>🧹 مسح بيانات الجهاز وتسجيل الخروج</span>
                <LogOut size={14} />
              </button>
              <button className="profile-menu-item" onClick={() => void handleLogout()} role="menuitem">
                <span>🚪 تسجيل الخروج</span>
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>
      {showMobileNav && <button className="mobile-overlay" onClick={() => setShowMobileNav(false)} aria-label="إغلاق القائمة" />}

      <section className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setShowMobileNav(true)} aria-label="فتح القائمة"><Menu size={21} /></button>
          <div className="breadcrumb"><span>مركز حلب</span><span className="breadcrumb-separator">/</span><strong>{view === "dashboard" ? "نظرة عامة" : view === "accounts" ? "الحسابات" : view === "activity" ? "التعديلات" : selectedAccount?.name}</strong></div>
          <div className="topbar-actions"><div className={`saved-state sync-${syncState}`} title="حالة اتصال Supabase">{syncState === "synced" ? <Wifi size={15} /> : <WifiOff size={15} />}<span className="saved-dot" /> {syncState === "syncing" ? "جاري الاتصال بـ Supabase…" : syncState === "synced" ? "متصل بـ Supabase" : syncState === "offline" ? "غير متصل بـ Supabase" : syncState === "conflict" ? "تعارض في السحابة" : "فحص اتصال Supabase…"}</div><button className="icon-btn" onClick={() => toast("ما في إشعارات جديدة") } aria-label="الإشعارات"><Bell size={18} /><span className="notification-dot" /></button><div className="top-avatar">م</div></div>
        </header>

        <div className="content-wrap">
          {view === "dashboard" && <DashboardView accounts={accounts} totals={totals} currency={dashboardCurrency} onToggleCurrency={() => setDashboardCurrency((current) => current === "SYP" ? "USD" : "SYP")} onOpenAccount={openAccount} onAddPayment={openPaymentFromDashboard} onGoAccounts={() => setView("accounts")} />}
          {view === "accounts" && <AccountsView accounts={filteredAccounts} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onOpenAccount={openAccount} onAddAccount={() => setShowAccountModal(true)} />}
          {view === "activity" && <ActivityView workspaceId={cloudWorkspace?.id} currentUserId={cloudUser?.id} />}
          {view === "account" && selectedAccount && <AccountDetail account={selectedAccount} onBack={() => setView("accounts")} onEditAccount={() => openAccountEditor(selectedAccount)} onDeleteAccount={() => deleteAccount(selectedAccount.id)} onAddPayment={() => { setEditingPaymentId(null); setPaymentAccountId(null); setShowPaymentModal(true); }} onEditPayment={openPaymentEditor} onDeletePayment={deletePayment} onExportPdf={() => void exportPdf(selectedAccount.id)} onExportPng={() => exportPng(selectedAccount.id)} />}
        </div>
      </section>

      {showBackupModal && <Modal title="النسخ والاستعادة" onClose={() => { if (!backupBusy) { setShowBackupModal(false); setBackupPassword(""); } }}><div className="modal-form">
        <div className="privacy-note"><ShieldCheck size={16} /> النسخة السحابية خاصة بمساحة العمل، وملف JSON يُحفظ مشفراً بكلمة مرور الاستعادة.</div>
        <label>كلمة مرور الاستعادة<input type="password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} placeholder="8 أحرف أو أكثر" disabled={backupBusy} /></label>
        <button className="primary-btn full" onClick={() => void saveBackupPassword()} disabled={backupBusy}>حفظ كلمة مرور الاستعادة <LockKeyhole size={16} /></button>
        <button className="secondary-btn full" onClick={() => void downloadRestorationFile()} disabled={backupBusy}>تنزيل ملف استعادة JSON مشفر <Download size={16} /></button>
        <button className="secondary-btn full" onClick={() => void saveCloudBackup()} disabled={backupBusy}>إنشاء نسخة سحابية الآن <ShieldCheck size={16} /></button>
        <button className="secondary-btn full" onClick={() => restorationFileInputRef.current?.click()} disabled={backupBusy}>استيراد ملف استعادة JSON <Download size={16} /></button>
        <input ref={restorationFileInputRef} type="file" accept=".json,application/json" onChange={(event) => void importRestorationFile(event)} style={{ display: "none" }} />
        <button className="danger-btn full" onClick={() => void restoreFromCloudBackup()} disabled={backupBusy}>استعادة آخر نسخة سحابية <ArrowLeft size={16} /></button>
        <small>ملف JSON لا يحتوي كلمة مرور تسجيل الدخول أو مفاتيح Supabase. محتواه المحاسبي مشفّر محلياً بـ AES-GCM.</small>
      </div></Modal>}
      {showPaymentModal && <Modal title={editingPaymentId ? "تعديل الدفعة" : "دفعة جديدة"} onClose={() => { setShowPaymentModal(false); setEditingPaymentId(null); setPaymentAccountId(null); }}><div className="modal-form">
        {view === "dashboard" && !editingPaymentId && paymentAccountId !== null && (
          <label>
            الحساب
            <select
              value={paymentAccountId}
              onChange={(event) => setPaymentAccountId(Number(event.target.value))}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {account.owner}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>اسم الدفعة<input value={paymentDraft.name} onChange={(event) => setPaymentDraft({ ...paymentDraft, name: event.target.value })} placeholder="مثلاً: دفعة بضاعة" /></label><div className="form-grid"><label>المبلغ<input type="number" min="0" value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: event.target.value })} placeholder="0" /></label><label>العملة<select value={paymentDraft.currency} onChange={(event) => setPaymentDraft({ ...paymentDraft, currency: event.target.value as Currency })}><option value="SYP">ليرة سورية</option><option value="USD">دولار</option></select></label></div><label>التاريخ<input type="date" value={paymentDraft.date} onChange={(event) => setPaymentDraft({ ...paymentDraft, date: event.target.value })} /></label><div className="type-picker"><span>نوع الحركة</span><div><button className={paymentDraft.type === "credit" ? "selected credit" : ""} onClick={() => setPaymentDraft({ ...paymentDraft, type: "credit" })}><ArrowDownLeft size={16} /> له <small>إنت مدين له</small></button><button className={paymentDraft.type === "debit" ? "selected debit" : ""} onClick={() => setPaymentDraft({ ...paymentDraft, type: "debit" })}><ArrowUpRight size={16} /> عليه <small>هو مدين إلك</small></button></div></div><button className="primary-btn full" onClick={addPayment}>{editingPaymentId ? "حفظ التعديل" : "حفظ الدفعة"} <Check size={17} /></button></div></Modal>}
      {showAccountModal && <Modal title={editingAccountId ? "تعديل الحساب" : "إضافة حساب جديد"} onClose={() => { setShowAccountModal(false); setEditingAccountId(null); setNewAccountName(""); setNewAccountOwner(""); }}><div className="modal-form"><label>اسم الحساب<input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder="مثلاً: محل أبو علي" autoFocus /></label><label>اسم صاحب الحساب<input value={newAccountOwner} onChange={(event) => setNewAccountOwner(event.target.value)} placeholder="مثلاً: أحمد العلي" /></label><button className="primary-btn full" onClick={addAccount}>{editingAccountId ? "حفظ التعديل" : "إضافة الحساب"} <Plus size={17} /></button></div></Modal>}
    </main>
  );
}

function DashboardView({ accounts, totals, currency, onToggleCurrency, onOpenAccount, onAddPayment, onGoAccounts }: { accounts: Account[]; totals: Record<Currency, { credit: number; debit: number }>; currency: Currency; onToggleCurrency: () => void; onOpenAccount: (id: number) => void; onAddPayment: () => void; onGoAccounts: () => void }) {
  const recentPayments = accounts.flatMap((account) => account.payments.map((payment) => ({ ...payment, accountName: account.name }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">الأربعاء، ٢٣ أيلول ٢٠٢٦</div><h1>أهلا، صاحب المركز <span>✦</span></h1><p>هاي لمحة سريعة عن حساباتك اليوم.</p></div><button className="primary-btn" onClick={onAddPayment}><Plus size={18} /> إضافة دفعة</button></div><div className="hero-summary"><div className="summary-copy"><span className="summary-kicker">الرصيد الصافي الإجمالي</span><div className="big-total">{formatAmount(totals[currency].debit - totals[currency].credit, currency)}</div><div className="summary-meta"><span className="positive-pill"><ArrowDownLeft size={14} /> 12.4%</span><span>مقارنة بالشهر الماضي</span></div></div><div className="summary-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><button className="orbit-core currency-toggle" onClick={onToggleCurrency} aria-label={currency === "SYP" ? "تبديل إلى الدولار" : "تبديل إلى الليرة السورية"}><CircleDollarSign size={29} /><span>{currency === "SYP" ? "ل.س" : "$"}</span></button></div><div className="summary-breakdown"><div><span><i className="dot credit-dot" /> له</span><strong>{formatAmount(totals[currency].credit, currency)}</strong></div><div><span><i className="dot debit-dot" /> عليه</span><strong>{formatAmount(totals[currency].debit, currency)}</strong></div></div></div><div className="stats-grid"><StatCard icon={WalletCards} label="عدد الحسابات" value={String(accounts.length).padStart(2, "0")} note="حساب نشط" tone="blue" /><StatCard icon={ArrowDownLeft} label="إجمالي له" value={formatAmount(totals.SYP.credit, "SYP")} note="هذا الشهر" tone="mint" /><StatCard icon={ArrowUpRight} label="إجمالي عليه" value={formatAmount(totals.SYP.debit, "SYP")} note="هذا الشهر" tone="amber" /><StatCard icon={CircleDollarSign} label="الرصيد بالدولار" value={formatAmount(totals.USD.debit - totals.USD.credit, "USD")} note="لكل الحسابات" tone="violet" /></div><div className="dashboard-columns"><section className="surface-card recent-card"><div className="section-head"><div><h2>آخر الحركات</h2><p>آخر الدفعات المسجّلة عندك</p></div><button className="text-btn" onClick={onGoAccounts}>عرض الكل <ArrowLeft size={15} /></button></div>{recentPayments.length ? <div className="payment-list">{recentPayments.map((payment) => <PaymentRow key={payment.id} payment={payment} accountName={payment.accountName} compact />)}</div> : <EmptyState text="لسا ما في حركات" />}</section><section className="surface-card accounts-mini"><div className="section-head"><div><h2>الحسابات النشطة</h2><p>نظرة سريعة على زباينك</p></div><button className="round-icon-btn" onClick={onGoAccounts}><ArrowLeft size={16} /></button></div><div className="mini-accounts">{accounts.slice(0, 3).map((account) => <button key={account.id} className="mini-account" onClick={() => onOpenAccount(account.id)}><div className={`account-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><div><strong>{account.name}</strong><span>{account.owner}</span></div><div className="mini-balance">{account.payments.length}<small>حركة</small></div></button>)}</div></section></div></div>;
}

function AccountsView({ accounts, searchTerm, setSearchTerm, onOpenAccount, onAddAccount }: { accounts: Account[]; searchTerm: string; setSearchTerm: (value: string) => void; onOpenAccount: (id: number) => void; onAddAccount: () => void }) {
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">دفتر الحسابات</div><h1>الحسابات <span className="heading-count">{accounts.length}</span></h1><p>كل زبون إلو حسابه، وكل حركة إلها مكانها.</p></div><button className="primary-btn" onClick={onAddAccount}><Plus size={18} /> حساب جديد</button></div><div className="toolbar"><div className="search-box"><Search size={18} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="دوّر على حساب أو اسم..." /></div><button className="filter-btn"><BarChart3 size={16} /> ترتيب: الأحدث <ChevronDown size={15} /></button></div>{accounts.length ? <div className="account-grid">{accounts.map((account) => <button key={account.id} className="account-card" onClick={() => onOpenAccount(account.id)}><div className="account-card-top"><div className={`account-avatar large-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><MoreHorizontal size={18} className="muted-icon" /></div><div className="account-card-copy"><h3>{account.name}</h3><p><UserRound size={14} /> {account.owner}</p></div><div className="account-card-footer"><div><span>عدد الحركات</span><strong>{account.payments.length}</strong></div><div className="card-arrow"><ArrowLeft size={17} /></div></div></button>)}</div> : <div className="surface-card empty-search"><div className="empty-search-icon"><Search size={25} /></div><span className="empty-search-kicker">دفتر الحسابات جاهز</span><h3>{searchTerm ? "ما لقينا حساب مطابق" : "ابدأ بأول حساب"}</h3><p>{searchTerm ? "جرّب اسم تاني أو امسح البحث." : "أضف زبون أو جهة جديدة، وبعدها سجّل أول حركة مالية."}</p>{!searchTerm && <button className="primary-btn empty-search-action" onClick={onAddAccount}><Plus size={17} /> إضافة أول حساب</button>}</div>}</div>;
}

function AccountDetail({ account, onBack, onEditAccount, onDeleteAccount, onAddPayment, onEditPayment, onDeletePayment, onExportPdf, onExportPng }: { account: Account; onBack: () => void; onEditAccount: () => void; onDeleteAccount: () => void; onAddPayment: () => void; onEditPayment: (payment: Payment) => void; onDeletePayment: (id: number) => void; onExportPdf: () => void; onExportPng: () => void }) {
  const currencies: Currency[] = ["SYP", "USD"];
  const [paymentQuery, setPaymentQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentType>("all");
  const filteredPayments = account.payments.filter((payment) => {
    const matchesQuery = `${payment.name} ${payment.amount} ${payment.currency}`.toLowerCase().includes(paymentQuery.toLowerCase());
    return matchesQuery && (paymentFilter === "all" || payment.type === paymentFilter);
  });
  return <div className="page-enter"><button className="back-btn" onClick={onBack}><ArrowRightIcon /> رجعة للحسابات</button><div className="detail-heading"><div className="detail-title"><div className={`account-avatar large-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><div><div className="eyebrow">حساب زبون</div><h1>{account.name}</h1><p><UserRound size={14} /> {account.owner}</p></div></div><div className="detail-actions"><button className="secondary-btn" onClick={onEditAccount}><Pencil size={15} /> تعديل الحساب</button><button className="secondary-btn" onClick={onExportPdf}><FileText size={15} /> تصدير PDF</button><button className="secondary-btn" onClick={onExportPng}><Download size={15} /> تصدير PNG</button><button className="danger-btn" onClick={onDeleteAccount}><Trash2 size={15} /> حذف الحساب</button><button className="primary-btn" onClick={onAddPayment}><Plus size={18} /> إضافة دفعة</button></div></div><div className="currency-summary-grid">{currencies.map((currency) => { const payments = account.payments.filter((payment) => payment.currency === currency); const credit = payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0); const debit = payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0); return <div className={`currency-card ${currency === "USD" ? "usd-card" : ""}`} key={currency}><div className="currency-card-head"><span className="currency-badge">{currency === "SYP" ? "ل.س" : "$"}</span><span>{currency === "SYP" ? "الليرة السورية" : "الدولار الأميركي"}</span></div><div className="currency-balance">{formatAmount(debit - credit, currency)}</div><div className="currency-lines"><span><i className="dot credit-dot" /> له <strong>{formatAmount(credit, currency)}</strong></span><span><i className="dot debit-dot" /> عليه <strong>{formatAmount(debit, currency)}</strong></span></div></div>; })}</div><section className="surface-card detail-payments"><div className="section-head"><div><h2>سجل الدفعات</h2><p>{filteredPayments.length} من {account.payments.length} حركات</p></div><span className="payment-count">{paymentFilter === "all" ? "كل الحركات" : paymentFilter === "credit" ? "له" : "عليه"}</span></div><div className="payment-toolbar"><div className="payment-search"><Search size={15} /><input value={paymentQuery} onChange={(event) => setPaymentQuery(event.target.value)} placeholder="دوّر باسم الدفعة..." /></div><div className="payment-filters"><button className={paymentFilter === "all" ? "active" : ""} onClick={() => setPaymentFilter("all")}>الكل</button><button className={paymentFilter === "credit" ? "active credit" : ""} onClick={() => setPaymentFilter("credit")}>له</button><button className={paymentFilter === "debit" ? "active debit" : ""} onClick={() => setPaymentFilter("debit")}>عليه</button></div></div>{filteredPayments.length ? <div className="payment-list full-list">{filteredPayments.map((payment) => <PaymentRow key={payment.id} payment={payment} onEdit={() => onEditPayment(payment)} onDelete={() => onDeletePayment(payment.id)} />)}</div> : <EmptyState text={account.payments.length ? "ما في حركات مطابقة" : "ما في دفعات بهالحساب لسا"} />}</section></div>;
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
