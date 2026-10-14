import { getDirection, getLanguage, t, tx, useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { ChangeEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  GitBranch,
  Bell,
  Building2,
  Check,
  ChevronDown,
  Copy,
  LogOut,
  CircleDollarSign,
  Download,
  FileText,
  Image as ImageIcon,
  Heart,
  Home as HomeIcon,
  Landmark,
  Languages,
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
  Moon,
  Sun,
  Settings,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { clearAllLocalData, readSyncQueue, removeSyncQueueItem } from "@/lib/localStore";
import { jsPDF } from "jspdf";
import { authenticateKey, hasAuthSession } from "@/lib/auth";
import { validatePaymentDraft } from "@/lib/validation";
import { supabase } from "@/lib/supabase";
import { deleteAccountFromCloud, deletePaymentFromCloud, deleteWorkspaceFromCloud, pullCloudAccounts, pushLocalAccounts, resetWorkspaceData, subscribeToWorkspace, verifyWorkspaceAccess, SyncConflictError, WorkspaceUnavailableError } from "@/lib/supabaseSync";
import { createCloudBackup, createEncryptedRestorationFile, restoreCloudBackup, restoreEncryptedRestorationFile, setCloudRestorePassword } from "@/lib/backup";
import ActivityView from "@/pages/Activity";
import InvoiceMaker from "@/pages/InvoiceMaker";
import { useTheme } from "@/contexts/ThemeContext";
import Manual from "@/pages/Manual";
import Updates from "@/pages/Updates";
import DesktopSidebar from "@/components/DesktopSidebar";
import WorkspaceManager, { type WorkspaceOption } from "@/components/WorkspaceManager";
import { showNativeNotification } from "@/lib/nativeNotifications";
import { identifyOneSignalUser } from "@/lib/oneSignal";
import { sendRemoteNotification } from "@/lib/remoteNotifications";

type Currency = "SYP" | "USD";
type PaymentType = "credit" | "debit";
type View = "dashboard" | "accounts" | "account" | "activity" | "invoice" | "manual" | "updates" | "settings";

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

type NotificationItem = {
  id: string;
  remoteId?: number;
  action: string;
  entity: string;
  title: string;
  detail: string;
  createdAt: string;
  read: boolean;
};

const notificationActionLabels: Record<string, string> = {
  create: "إضافة",
  update: "تعديل",
  delete: "حذف",
  import: "استيراد",
  export: "تصدير",
  login: "تسجيل دخول",
  sync: "مزامنة",
  conflict: "تعارض",
};

const notificationEntityLabels: Record<string, string> = {
  account: "حساب",
  payment: "دفعة",
  backup: "نسخة احتياطية",
  workspace: "مساحة العمل",
  member: "عضو",
  session: "جلسة",
};

const parseNotificationSummary = (summary: string) => {
  try {
    return JSON.parse(summary) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const makeNotification = (entry: { id: number; action: string; entity: string; summary: string; created_at: string }, read: boolean): NotificationItem => {
  const data = parseNotificationSummary(entry.summary);
  const detail = String(data.name ?? data.label ?? (entry.entity === "backup" ? t("نسخة احتياطية") : t(notificationEntityLabels[entry.entity] ?? entry.entity)));
  return {
    id: "remote-" + entry.id,
    remoteId: entry.id,
    action: entry.action,
    entity: entry.entity,
    title: t(notificationActionLabels[entry.action] ?? entry.action) + " " + t(notificationEntityLabels[entry.entity] ?? entry.entity),
    detail,
    createdAt: entry.created_at,
    read,
  };
};

const initialAccounts: Account[] = [];

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "نظرة عامة", icon: HomeIcon },
  { id: "accounts", label: "الحسابات", icon: WalletCards },
  { id: "activity", label: "التعديلات", icon: Activity },
  { id: "invoice", label: "صانع الفواتير", icon: FileText },
  { id: "manual", label: "دليل الاستخدام", icon: BookOpen },
  { id: "updates", label: "التحديثات", icon: GitBranch },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

const formatAmount = (amount: number, currency: Currency) => {
  const formatted = new Intl.NumberFormat(getLanguage() === "ar" && currency === "SYP" ? "ar-SY" : "en-US", {
    maximumFractionDigits: currency === "SYP" ? 0 : 2,
  }).format(amount);
  return currency === "SYP" ? tx("{0} ل.س", [formatted]) : `$${formatted}`;
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat(getLanguage() === "ar" ? "ar-SY" : "en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));

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

export default function Home({ cloudUser, cloudWorkspace, availableWorkspaces = [], onSwitchWorkspace, onCreateWorkspace, onJoinWorkspace, onDeleteWorkspace }: { cloudUser?: { id: string; email?: string | null } | null; cloudWorkspace?: { id: string; name: string; role: "owner" | "member" } | null; availableWorkspaces?: WorkspaceOption[]; onSwitchWorkspace?: (workspace: WorkspaceOption) => Promise<void>; onCreateWorkspace?: (name: string) => Promise<void>; onJoinWorkspace?: (workspaceId: string) => Promise<void>; onDeleteWorkspace?: () => Promise<void> } = {}) {
    useLanguage();
  const { theme, setTheme, toggleTheme } = useTheme();
  const [isUnlocked, setIsUnlocked] = useState(() => Boolean(cloudUser) || hasAuthSession());
  const [keyValue, setKeyValue] = useState("");
  const [accounts, setAccounts] = useState<Account[]>(() => cloudWorkspace ? [] : initialAccounts);
  const [storageReady, setStorageReady] = useState(false);
  const [sharedInvoiceLogo, setSharedInvoiceLogo] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [dashboardCurrency, setDashboardCurrency] = useState<Currency>("SYP");
  const [selectedAccountId, setSelectedAccountId] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutationBusyRef = useRef(false);
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
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    if (!cloudWorkspace?.id) return;
    localStorage.setItem("aleppo-shared-workspace-id", cloudWorkspace.id);
    window.dispatchEvent(new Event("aleppo-workspace-context"));
    let active = true;
    const loadBranding = async () => {
      const { data, error } = await supabase.from("workspace_settings").select("invoice_logo_data").eq("workspace_id", cloudWorkspace.id).maybeSingle();
      if (!error && active) setSharedInvoiceLogo(typeof data?.invoice_logo_data === "string" ? data.invoice_logo_data : "");
    };
    void loadBranding();
    const channel = supabase.channel("workspace-branding-" + cloudWorkspace.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_settings", filter: "workspace_id=eq." + cloudWorkspace.id }, (payload) => {
        const next = (payload.new as { invoice_logo_data?: unknown } | null)?.invoice_logo_data;
        if (active) setSharedInvoiceLogo(typeof next === "string" ? next : "");
      }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [cloudWorkspace?.id]);

  const saveSharedInvoiceLogo = async (logo: string) => {
    if (!cloudWorkspace?.id) return;
    const { error } = await supabase.from("workspace_settings").upsert({ workspace_id: cloudWorkspace.id, invoice_logo_data: logo }, { onConflict: "workspace_id" });
    if (error) { toast.error(t("تعذر حفظ شعار الفواتير على الخادم")); throw error; }
    setSharedInvoiceLogo(logo);
  };

  useEffect(() => {
    if (!cloudUser?.id) return;
    void identifyOneSignalUser(cloudUser.id).catch(() => undefined);
  }, [cloudUser?.id]);

  const pushClientNotification = (action: string, entity: string, detail: string) => {
    const item: NotificationItem = {
      id: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      action,
      entity,
      title: t(notificationActionLabels[action] ?? action) + " " + t(notificationEntityLabels[entity] ?? entity),
      detail,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setNotifications((current) => [item, ...current].slice(0, 12));
  };

  const markNotificationsRead = () => {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  };

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

    if (syncInFlight.current) throw new Error("sync_busy");

    pendingSync.current = {
      accounts: candidate,
      deletedAccountIds: deletedAccounts,
      deletedPaymentIds: deletedPayments,
    };

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
              ? t("في تعديل جديد من الجهاز التاني — حدّث الصفحة للمراجعة")
              : errorCode === "23505"
                ? t("السجل موجود مسبقاً — أعد المحاولة مرة ثانية")
                : errorMessage === "sync_busy"
                  ? t("المزامنة ما زالت جارية — انتظر لحظة وجرب مرة ثانية")
                  : t("تعذر الاتصال بـ Supabase. لم يتم حفظ التعديل."),
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
          toast.error(t("مساحة العمل لم تعد موجودة. رجعناك لصفحة الدخول."));
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
    if (!cloudWorkspace?.id || !cloudUser?.id || !supabase) {
      setNotifications([]);
      setShowNotifications(false);
      return;
    }

    let active = true;
    const client = supabase;

    const loadNotifications = async () => {
      const { data, error } = await client
        .from("audit_log")
        .select("id,action,entity,summary,created_at")
        .eq("workspace_id", cloudWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(12);

      if (!error && active) {
        setNotifications(((data ?? []) as Array<{ id: number; action: string; entity: string; summary: string; created_at: string }>).map((entry) => makeNotification(entry, true)));
      }
    };

    void loadNotifications();

    const channel = supabase
      .channel("notifications-" + cloudWorkspace.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log", filter: "workspace_id=eq." + cloudWorkspace.id }, (payload) => {
        const entry = payload.new as { id: number; action: string; entity: string; summary: string; created_at: string; user_id?: string | null };
        const incoming = makeNotification(entry, false);
        if ((entry.entity === "payment" || entry.entity === "account") && entry.user_id !== cloudUser.id) {
          void showNativeNotification({
            title: incoming.title,
            body: incoming.detail,
            id: 500000 + Number(entry.id),
          }).catch((error) => console.error("[AleppoCenterCash] realtime native notification failed", error));
        }
        setNotifications((current) => {
          const duplicateIndex = current.findIndex((notification) =>
            notification.remoteId === incoming.remoteId ||
            (!notification.remoteId &&
              notification.action === incoming.action &&
              notification.entity === incoming.entity &&
              notification.detail === incoming.detail &&
              Date.now() - new Date(notification.createdAt).getTime() < 10000),
          );
          if (duplicateIndex >= 0) {
            const next = [...current];
            next[duplicateIndex] = { ...incoming, read: current[duplicateIndex].read };
            return next;
          }
          return [incoming, ...current].slice(0, 12);
        });
      })
      .subscribe();

    return () => {
      active = false;
      void supabase?.removeChannel(channel);
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

  const recordAudit = async (
    action: "create" | "update" | "delete" | "import" | "export",
    entity: "account" | "payment" | "backup",
    label: string,
    entityId?: string | null,
  ) => {
    pushClientNotification(action, entity, label);
    if (!supabase || !cloudWorkspace || !cloudUser) return;
    const { error } = await supabase.from("audit_log").insert({
      workspace_id: cloudWorkspace.id,
      user_id: cloudUser.id,
      actor_email: cloudUser.email ?? null,
      action,
      entity,
      entity_id: entityId ?? null,
      summary: JSON.stringify({ name: label }),
    });
    if (error) {
      console.error("[AleppoCenterCash] audit insert failed", error);
      return;
    }

    if (entity === "account" || entity === "payment") {
      void sendRemoteNotification({
        workspaceId: cloudWorkspace.id,
        action,
        entity,
        title: t(notificationActionLabels[action] ?? action) + " " + t(notificationEntityLabels[entity] ?? entity),
        body: label,
      });
    }
  };

  const notifyNativeMutation = (action: "create" | "update" | "delete", entity: "account" | "payment", label: string) => {
    void showNativeNotification({
      title: t(notificationActionLabels[action] ?? action) + " " + t(notificationEntityLabels[entity] ?? entity),
      body: label,
      id: 500000 + Math.floor(Date.now() % 400000000),
    }).catch((error) => console.error("[AleppoCenterCash] native notification failed", error));
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
    if (!cloudWorkspace || cloudWorkspace.role !== "owner") {
      toast.error(t("حذف مساحة العمل متاح لمالك المساحة فقط"));
      return;
    }
    if (!window.confirm(t("متأكد؟ رح تنحذف مساحة العمل نهائياً مع كل الحسابات والدفعات، وما في تراجع."))) return;
    try {
      await deleteWorkspaceFromCloud(cloudWorkspace.id);
      await clearAllLocalData().catch(() => undefined);
      const { supabase } = await import("@/lib/supabase");
      await supabase?.auth.refreshSession();
      toast.success(t("انحذفت مساحة العمل نهائياً"));
      window.location.replace("/");
    } catch (error) {
      console.error("[AleppoCenterCash] workspace deletion failed", error);
      toast.error(error instanceof Error ? error.message : t("ما قدرنا نحذف مساحة العمل"));
    }
  };
  const deleteAccountData = async () => {
    if (!window.confirm(t("متأكد؟ رح ينحذف حسابك نهائياً. إذا كنت مالكاً لمساحة، رح تنحذف المساحة وكل حساباتها ودفعاتها أيضاً."))) return;
    try {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) throw new Error(t("Supabase غير مهيأ بعد"));

      // Server is authoritative: delete the authenticated account/workspace
      // first. Only clear the browser after the RPC succeeds.
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;

      await clearAllLocalData();
      await supabase.auth.signOut().catch(() => undefined);
      window.location.replace("/");
    } catch (error) {
      console.error("[AleppoCenterCash] account deletion failed", error);
      toast.error(error instanceof Error ? error.message : t("ما قدرنا نحذف الحساب"));
    }
  };

  const saveCloudBackup = async (notify = true) => {
    if (!cloudWorkspace) return null;
    try {
      const result = await createCloudBackup(cloudWorkspace.id);
      if (notify) {
        pushClientNotification("export", "backup", t("تم تحديث النسخة السحابية"));
        toast.success(t("انحفظت آخر نسخة سحابية تلقائياً"));
      }
      return result;
    } catch (error) {
      console.error("[AleppoCenterCash] automatic backup failed", error);
      if (notify) toast.error(t("الحفظ الأساسي تم، لكن النسخة الاحتياطية لم تتحدث"));
      return null;
    }
  };

  useEffect(() => {
    if (!cloudWorkspace) return;
    const interval = window.setInterval(() => {
      void saveCloudBackup(false);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [cloudWorkspace?.id]);

  const downloadRestorationFile = async () => {
    if (!cloudWorkspace) return;
    if (backupPassword.length < 8) {
      toast.error(t("اكتب كلمة مرور الاستعادة أولاً"));
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
      void recordAudit("export", "backup", t("ملف استعادة JSON مشفر"));
      toast.success(t("نزلنا ملف الاستعادة المشفر"));
    } catch (error) {
      console.error("[AleppoCenterCash] restoration export failed", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message.includes("restore_password_too_short") ? t("كلمة مرور الاستعادة لازم تكون 8 أحرف على الأقل") : t("ما قدرنا نجهّز ملف الاستعادة"));
    } finally {
      setBackupBusy(false);
    }
  };

  const importRestorationFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !cloudWorkspace) return;
    if (backupPassword.length < 8) {
      toast.error(t("اكتب كلمة مرور الاستعادة أولاً"));
      return;
    }
    if (!window.confirm(t("استيراد الملف سيستبدل الحسابات والدفعات وسجل التعديلات بالحالة الموجودة داخل الملف. متأكد؟"))) return;
    setBackupBusy(true);
    try {
      const result = await restoreEncryptedRestorationFile(cloudWorkspace.id, backupPassword, file);
      setBackupPassword("");
      await recordAudit("import", "backup", t("تمت استعادة ملف JSON"));
      await saveCloudBackup(false);
      toast.success(t("تمت استعادة ملف الاستعادة. رح نعيد تحميل البيانات الآن."));
      console.info("[AleppoCenterCash] file restore completed", result);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error("[AleppoCenterCash] restoration file import failed", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(
        message.includes("invalid_restore_password") || message.includes("invalid_restoration_password_or_file")
          ? t("كلمة المرور غير صحيحة أو ملف الاستعادة غير صالح")
          : message.includes("invalid_backup")
            ? t("ملف الاستعادة لا يخص مساحة العمل الحالية")
            : t("ما قدرنا نستعيد ملف الاستعادة"),
      );
    } finally {
      setBackupBusy(false);
    }
  };

  const saveBackupPassword = async () => {
    if (!cloudWorkspace) return;
    if (backupPassword.length < 8) {
      toast.error(t("كلمة مرور الاستعادة لازم تكون 8 أحرف على الأقل"));
      return;
    }
    setBackupBusy(true);
    try {
      await setCloudRestorePassword(cloudWorkspace.id, backupPassword);
      setBackupPassword("");
      toast.success(t("انحفظت كلمة مرور الاستعادة"));
    } catch (error) {
      console.error("[AleppoCenterCash] restore password save failed", error);
      toast.error(t("ما قدرنا نحفظ كلمة مرور الاستعادة"));
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreFromCloudBackup = async () => {
    if (!cloudWorkspace) return;
    if (backupPassword.length < 8) {
      toast.error(t("اكتب كلمة مرور الاستعادة"));
      return;
    }
    if (!window.confirm(t("استعادة النسخة ستستبدل الحسابات والدفعات وسجل التعديلات بالحالة المحفوظة. متأكد؟"))) return;
    setBackupBusy(true);
    try {
      const result = await restoreCloudBackup(cloudWorkspace.id, backupPassword);
      setBackupPassword("");
      await recordAudit("import", "backup", t("تمت استعادة النسخة السحابية"));
      await saveCloudBackup(false);
      toast.success(t("تمت الاستعادة. رح نعيد تحميل البيانات الآن."));
      console.info("[AleppoCenterCash] restore completed", result);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error("[AleppoCenterCash] restore failed", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message.includes("invalid_restore_password") ? t("كلمة مرور الاستعادة غير صحيحة") : message.includes("backup_not_found") ? t("ما في نسخة احتياطية محفوظة لهالمساحة بعد") : message.includes("invalid_backup") ? t("النسخة الاحتياطية غير صالحة") : t("ما قدرنا نستعيد النسخة الاحتياطية"));
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
      toast.success(t("اننسخ Workspace ID"));
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
      toast.error(t("لا توجد مساحة سحابية متصلة."));
      throw new Error("cloud_required");
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncState("offline");
      toast.error(t("لا يوجد اتصال بالإنترنت. لم يتم حفظ التعديل."));
      throw new Error("offline");
    }

    await initialCloudSyncRef.current;

    try {
      await syncAccounts(nextAccounts, deletions);
      void saveCloudBackup();
    } catch (error) {
      if (error instanceof WorkspaceUnavailableError) {
        await clearAllLocalData().catch(() => undefined);
        const { supabase } = await import("@/lib/supabase");
        await supabase?.auth.signOut().catch(() => undefined);
        toast.error(t("مساحة العمل لم تعد موجودة. رجعناك لصفحة الدخول."));
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
    if (!newAccountName.trim()) {
      toast.error(t("اكتب اسم الحساب أولاً"));
      return;
    }
    if (newAccountName.trim().length > 160) {
      toast.error(t("اسم الحساب لازم يكون 160 محرف أو أقل"));
      return;
    }
    if (newAccountOwner.trim().length > 160) {
      toast.error(t("اسم صاحب الحساب لازم يكون 160 محرف أو أقل"));
      return;
    }
    if (mutationBusyRef.current) return;

    mutationBusyRef.current = true;
    setMutationBusy(true);
    try {
      if (editingAccountId) {
        const nextAccounts = accounts.map((account) => account.id === editingAccountId ? { ...account, name: newAccountName.trim(), owner: newAccountOwner.trim() } : account);
        await commitAccounts(nextAccounts);
        notifyNativeMutation("update", "account", t("تم تعديل حساب ") + newAccountName.trim());
        void recordAudit("update", "account", newAccountName.trim(), accounts.find((account) => account.id === editingAccountId)?.remoteId ?? null);
        setEditingAccountId(null);
        setNewAccountName("");
        setNewAccountOwner("");
        setShowAccountModal(false);
        toast.success(t("تعدّل الحساب بنجاح"));
        return;
      }

      const next: Account = { id: Date.now(), remoteId: crypto.randomUUID(), version: 0, name: newAccountName.trim(), owner: newAccountOwner.trim(), accent: ["mint", "violet", "amber", "blue"][accounts.length % 4], payments: [] };
      await commitAccounts([...accounts, next]);
      notifyNativeMutation("create", "account", t("تم إنشاء حساب ") + next.name);
      void recordAudit("create", "account", next.name, next.remoteId ?? null);
      setNewAccountName("");
      setNewAccountOwner("");
      setShowAccountModal(false);
      toast.success(t("انضاف الحساب بنجاح"));
    } catch {
      toast.error(editingAccountId ? t("ما قدرنا نحفظ تعديل الحساب بالسحابة") : t("ما قدرنا نحفظ الحساب بالسحابة"));
    } finally {
      mutationBusyRef.current = false;
      setMutationBusy(false);
    }
  };

  const addPayment = async () => {
    const validationError = validatePaymentDraft(paymentDraft);
    if (validationError) { toast.error(validationError); return; }
    if (paymentDraft.name.trim().length > 160) {
      toast.error(t("اسم الدفعة لازم يكون 160 محرف أو أقل"));
      return;
    }
    if (mutationBusyRef.current) return;

    const targetAccountId = paymentAccountId ?? selectedAccountId;
    const targetAccount = accounts.find((account) => account.id === targetAccountId);
    if (!targetAccount) { toast.error(t("اختار حساب أولاً")); return; }

    mutationBusyRef.current = true;
    setMutationBusy(true);
    try {
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

      await commitAccounts(nextAccounts);
      notifyNativeMutation(editingPaymentId ? "update" : "create", "payment", (editingPaymentId ? t("تم تعديل الدفعة ") : t("تمت إضافة الدفعة ")) + payment.name);
      void recordAudit(editingPaymentId ? "update" : "create", "payment", payment.name, payment.remoteId ?? null);
      setEditingPaymentId(null);
      setPaymentAccountId(null);
      setPaymentDraft({ name: "", amount: "", currency: "SYP", type: "credit", date: new Date().toISOString().slice(0, 10) });
      setShowPaymentModal(false);
      toast.success(editingPaymentId ? t("انحفظ تعديل الدفعة") : t("انضافت الدفعة للحساب"));
    } catch {
      toast.error(t("ما قدرنا نحفظ الدفعة بالسحابة"));
    } finally {
      mutationBusyRef.current = false;
      setMutationBusy(false);
    }
  };

  const deletePayment = async (paymentId: number) => {
    if (mutationBusyRef.current) return;
    const payment = selectedAccount?.payments.find((item) => item.id === paymentId);
    if (!payment || !window.confirm(tx("متأكد بدك تحذف «{0}»؟\\nالحذف نهائي وما في تراجع.", [payment.name]))) return;

    const nextAccounts = accounts.map((account) =>
      account.id === selectedAccountId
        ? { ...account, payments: account.payments.filter((item) => item.id !== paymentId) }
        : account,
    );

    mutationBusyRef.current = true;
    setMutationBusy(true);
    try {
      if (cloudWorkspace && cloudUser) {
        if (!payment.remoteId) {
          console.error("[AleppoCenterCash] delete payment blocked: missing remoteId", payment);
          throw new Error(t("الدفعة ما انزامنت بعد"));
        }

        await verifyWorkspaceAccess(cloudWorkspace.id, cloudUser.id);
        await deletePaymentFromCloud(cloudWorkspace.id, payment.remoteId, payment.version);
      }

      setAccounts(nextAccounts);
      notifyNativeMutation("delete", "payment", t("تم حذف الدفعة ") + payment.name);
      void recordAudit("delete", "payment", payment.name, payment.remoteId ?? null);
      void saveCloudBackup();
      toast.success(t("انحذفت الدفعة"));
    } catch (error) {
      console.error("[AleppoCenterCash] delete payment failed", error);
      toast.error(error instanceof Error ? error.message : t("ما قدرنا نحذف الدفعة"));
    } finally {
      mutationBusyRef.current = false;
      setMutationBusy(false);
    }
  };

  const deleteAccount = async (accountId: number) => {
    if (mutationBusyRef.current) return;
    const account = accounts.find((item) => item.id === accountId);
    if (!account || !window.confirm(tx("متأكد بدك تحذف حساب «{0}» وكل دفعاته؟\\nالحذف نهائي وما في تراجع.", [account.name]))) return;

    const nextAccounts = accounts.filter((item) => item.id !== accountId);

    mutationBusyRef.current = true;
    setMutationBusy(true);
    try {
      if (cloudWorkspace && cloudUser) {
        if (!account.remoteId) {
          console.error("[AleppoCenterCash] delete account blocked: missing remoteId", account);
          throw new Error(t("الحساب ما انزامن بعد"));
        }

        await verifyWorkspaceAccess(cloudWorkspace.id, cloudUser.id);
        await deleteAccountFromCloud(cloudWorkspace.id, account.remoteId, account.version);
      }

      setAccounts(nextAccounts);
      notifyNativeMutation("delete", "account", t("تم حذف الحساب ") + account.name);
      void recordAudit("delete", "account", account.name, account.remoteId ?? null);
      setSelectedAccountId(nextAccounts[0]?.id ?? 0);
      setView("accounts");
      void saveCloudBackup();
      toast.success(t("انحذف الحساب وكل حركاته"));
    } catch (error) {
      console.error("[AleppoCenterCash] delete account failed", error);
      toast.error(error instanceof Error ? error.message : t("ما قدرنا نحذف الحساب من السحابة"));
    } finally {
      mutationBusyRef.current = false;
      setMutationBusy(false);
    }
  };

  const openPaymentFromDashboard = () => {
    if (!accounts.length) {
      toast.error(t("أضف حساب أولاً قبل تسجيل دفعة"));
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
      toast.error(t("لا توجد مساحة سحابية متصلة."));
      return;
    }
    setShowBackupModal(true);
    setShowProfileMenu(false);
  };

  const exportPng = (accountId: number) => {
    const account = accounts.find((item) => item.id === accountId);
    const reportAccent = theme === "gold" ? "#b8891f" : "#173f47";
    const reportAccentSoft = theme === "gold" ? "#f5ead0" : "#f5f6f3";
    if (!account) { toast.error(t("الحساب غير موجود")); return; }
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
    if (!context) { toast.error(t("ما قدرنا نجهّز صورة التقرير")); return; }
    const right = (text: string, x: number, y: number, font: string, color = "#18353a") => { context.font = font; context.fillStyle = color; context.textAlign = "right"; context.direction = "rtl"; context.fillText(text, x, y); };
    const line = (y: number) => { context.strokeStyle = "#dfe9e4"; context.lineWidth = 2; context.beginPath(); context.moveTo(70, y); context.lineTo(1130, y); context.stroke(); };
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = reportAccent; context.fillRect(0, 0, canvas.width, 12);
    right("Aleppo Center Cash", 1130, 65, "700 28px Cairo, Arial, sans-serif", reportAccent);
    right(t("تقرير حساب"), 1130, 100, "600 20px Cairo, Arial, sans-serif", "#718883");
    line(125);
    right(t("الحساب: ") + account.name, 1130, 165, "700 22px Cairo, Arial, sans-serif");
    if (account.owner) right(t("صاحب الحساب: ") + account.owner, 1130, 200, "400 18px Cairo, Arial, sans-serif", "#718883");
    right(t("التاريخ: ") + new Intl.DateTimeFormat(getLanguage() === "ar" ? "ar-SY" : "en-US").format(new Date()), 1130, 235, "400 18px Cairo, Arial, sans-serif", "#718883");
    line(265);
    right(t("الإجماليات"), 1130, 305, "700 21px Cairo, Arial, sans-serif", reportAccent);
    const totalRows = [[t("ل.س — له"), formatAmount(totalsByCurrency[0].credit, "SYP")], [t("ل.س — عليه"), formatAmount(totalsByCurrency[0].debit, "SYP")], [t("ل.س — الرصيد"), formatAmount(totalsByCurrency[0].balance, "SYP")], [t("$ — له"), formatAmount(totalsByCurrency[1].credit, "USD")], [t("$ — عليه"), formatAmount(totalsByCurrency[1].debit, "USD")], [t("$ — الرصيد"), formatAmount(totalsByCurrency[1].balance, "USD")]];
    context.fillStyle = reportAccentSoft; context.fillRect(70, 330, 1060, 215);
    totalRows.forEach(([label, value], index) => { const y = 365 + index * 32; const balance = index === 2 || index === 5; right(label, 1085, y, "400 17px Cairo, Arial, sans-serif", balance ? reportAccent : "#718883"); right(value, 620, y, balance ? "700 17px Cairo, Arial, sans-serif" : "600 17px Cairo, Arial, sans-serif", balance ? "#2f896d" : "#294c51"); });
    line(575);
    right(t("آخر الدفعات (") + recentPayments.length + ")", 1130, 620, "700 21px Cairo, Arial, sans-serif", reportAccent);
    context.fillStyle = reportAccentSoft; context.fillRect(70, 645, 1060, 44);
    right(t("تاريخ"), 1085, 673, "700 15px Cairo, Arial, sans-serif", "#718883"); right(t("وصف"), 820, 673, "700 15px Cairo, Arial, sans-serif", "#718883"); right(t("مبلغ"), 455, 673, "700 15px Cairo, Arial, sans-serif", "#718883"); right(t("نوع"), 180, 673, "700 15px Cairo, Arial, sans-serif", "#718883");
    recentPayments.forEach((payment, index) => { const y = 725 + index * 62; if (index % 2 === 0) { context.fillStyle = "#fbfcfb"; context.fillRect(70, y - 30, 1060, 62); } right(formatDate(payment.date), 1085, y, "400 15px Cairo, Arial, sans-serif"); right(payment.name, 820, y, "400 15px Cairo, Arial, sans-serif"); right(formatAmount(payment.amount, payment.currency), 455, y, "600 15px Cairo, Arial, sans-serif"); right(payment.type === "credit" ? t("له") : t("عليه"), 180, y, "700 15px Cairo, Arial, sans-serif", payment.type === "credit" ? "#4d9b7b" : "#c27b4e"); });
    line(1050); right(t("Aleppo Center Cash — تقرير من البيانات السحابية"), 600, 1090, "400 13px Cairo, Arial, sans-serif", "#8aa09a");
    const anchor = document.createElement("a"); anchor.href = canvas.toDataURL("image/png"); anchor.download = "aleppo-center-cash-" + account.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "-") + "-" + reportDate + ".png"; anchor.click();
    void (async () => {
      await recordAudit("export", "backup", t("تقرير PNG — ") + account.name);
      await saveCloudBackup(false);
    })();
    toast.success(t("نزلنا تقرير الحساب كصورة PNG"));
  };

  const exportPdf = async (accountId: number) => {
    const account = accounts.find((item) => item.id === accountId);
    const reportAccent = theme === "gold" ? "#b8891f" : "#173f47";
    const reportAccentSoft = theme === "gold" ? "#f5ead0" : "#f5f6f3";
    if (!account) { toast.error(t("الحساب غير موجود")); return; }
    const dateStamp = new Date().toISOString().slice(0, 10);
    const recentPayments = [...account.payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const totalsByCurrency = (["SYP", "USD"] as Currency[]).map((currency) => {
      const payments = account.payments.filter((payment) => payment.currency === currency);
      const credit = payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0);
      const debit = payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0);
      return { currency, credit, debit, balance: debit - credit };
    });
    const rows = recentPayments.map((payment) => "<tr><td style=\"padding:6px 8px;border-bottom:1px solid #eef2ef;\">" + escapeHtml(formatDate(payment.date)) + "</td><td style=\"padding:6px 8px;border-bottom:1px solid #eef2ef;\">" + escapeHtml(payment.name) + "</td><td style=\"padding:6px 8px;border-bottom:1px solid #eef2ef;\">" + escapeHtml(formatAmount(payment.amount, payment.currency)) + "</td><td style=\"padding:6px 8px;border-bottom:1px solid #eef2ef;color:" + (payment.type === "credit" ? "#4d9b7b" : "#c27b4e") + ";\">" + (payment.type === "credit" ? t("له") : t("عليه")) + "</td></tr>").join("");
    const report = document.createElement("div"); report.dir = "rtl"; report.lang = "ar";
    report.style.cssText = "position:fixed;left:-10000px;top:0;width:600px;height:760px;padding:24px;background:#fff;color:#18353a;font-family:Cairo,Arial,sans-serif;direction:rtl;box-sizing:border-box;";
    report.innerHTML = "<div style=\"display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid " + reportAccent + ";\"><h1 style=\"margin:0;font-size:18px;color:" + reportAccent + ";\">Aleppo Center Cash</h1><span style=\"font-size:12px;color:#718883;\">تقرير حساب</span></div>"
      + "<table style=\"width:100%;font-size:11px;margin-bottom:12px;border-collapse:collapse;\"><tr><td style=\"color:#718883;padding:2px 0;\">الحساب:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(account.name) + "</td></tr>" + (account.owner ? "<tr><td style=\"color:#718883;padding:2px 0;\">صاحب الحساب:</td><td style=\"padding:2px 0;\">" + escapeHtml(account.owner) + "</td></tr>" : "") + "<tr><td style=\"color:#718883;padding:2px 0;\">التاريخ:</td><td style=\"padding:2px 0;\">" + escapeHtml(new Intl.DateTimeFormat(getLanguage() === "ar" ? "ar-SY" : "en-US").format(new Date())) + "</td></tr></table>"
      + "<div style=\"padding:10px 12px;margin-bottom:12px;background:" + reportAccentSoft + ";border-radius:8px;\"><h3 style=\"margin:0 0 6px;font-size:13px;color:" + reportAccent + ";\">الإجماليات</h3><table style=\"width:100%;font-size:10px;border-collapse:collapse;\"><tr><td style=\"color:#718883;padding:2px 0;\">ل.س — له:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[0].credit, "SYP")) + "</td></tr><tr><td style=\"color:#718883;padding:2px 0;\">ل.س — عليه:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[0].debit, "SYP")) + "</td></tr><tr><td style=\"color:" + reportAccent + ";font-weight:600;padding:2px 0;\">ل.س — الرصيد:</td><td style=\"color:#2f896d;font-weight:700;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[0].balance, "SYP")) + "</td></tr><tr><td colspan=\"2\" style=\"height:4px;\"></td></tr><tr><td style=\"color:#718883;padding:2px 0;\">$ — له:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[1].credit, "USD")) + "</td></tr><tr><td style=\"color:#718883;padding:2px 0;\">$ — عليه:</td><td style=\"font-weight:600;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[1].debit, "USD")) + "</td></tr><tr><td style=\"color:" + reportAccent + ";font-weight:600;padding:2px 0;\">$ — الرصيد:</td><td style=\"color:#2f896d;font-weight:700;padding:2px 0;\">" + escapeHtml(formatAmount(totalsByCurrency[1].balance, "USD")) + "</td></tr></table></div>"
      + "<h3 style=\"margin:0 0 6px;font-size:13px;color:" + reportAccent + ";\">آخر الدفعات (" + recentPayments.length + ")</h3><table style=\"width:100%;border-collapse:collapse;font-size:9px;\"><thead><tr style=\"background:" + reportAccentSoft + ";\"><th style=\"padding:4px;text-align:right;color:#718883;\">تاريخ</th><th style=\"padding:4px;text-align:right;color:#718883;\">وصف</th><th style=\"padding:4px;text-align:right;color:#718883;\">مبلغ</th><th style=\"padding:4px;text-align:right;color:#718883;\">نوع</th></tr></thead><tbody>" + (rows || "<tr><td colspan=\"4\" style=\"padding:8px;text-align:center;color:#718883;\">لا توجد دفعات</td></tr>") + "</tbody></table>"
      + "<p style=\"margin:12px 0 0;padding-top:6px;border-top:1px solid #eef2ef;font-size:9px;color:#8aa09a;text-align:center;\">Aleppo Center Cash — تقرير من البيانات السحابية</p>";
    document.body.appendChild(report);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      await pdf.html(report, { x: 24, y: 24, width: 547, windowWidth: 600, autoPaging: "text" });
      pdf.save("aleppo-center-cash-" + account.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "-") + "-" + dateStamp + ".pdf");
      await recordAudit("export", "backup", t("تقرير PDF — ") + account.name);
      await saveCloudBackup(false);
      toast.success(t("نزلنا تقرير الحساب كملف PDF"));
    } catch {
      toast.error(t("ما قدرنا نجهّز ملف PDF، جرّب مرة تانية"));
    } finally {
      report.remove();
    }
  };
  if (!isUnlocked) {
    return (
      <main className="login-shell" dir={getDirection()}>
        <div className="login-ambient ambient-one" />
        <div className="login-ambient ambient-two" />
        <section className="login-card">
          <div className="brand-mark large"><Landmark size={30} strokeWidth={1.8} /></div>
          <div className="eyebrow">ALEPPO CENTER CASH <span>•</span> CLOUD ONLY</div>
          <h1>{t("حساباتك، مرتّبة")}<br /><em>{t("وبلا وجع راس.")}</em></h1>
          <p className="login-copy">{t("دفتر حساباتك التجاري بمكان واحد. سريع، واضح، ومحفوظ على السحابة.")}</p>
          <div className="login-divider"><span>{t("الدخول للمساحة الخاصة")}</span></div>
          <label className="field-label" htmlFor="key">{t("مفتاح الدخول")}</label>
          <div className="key-input-wrap">
            <LockKeyhole size={17} />
            <input id="key" type="password" value={keyValue} onChange={(event) => setKeyValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void attemptUnlock(); }} placeholder={t("اكتب المفتاح هون")} autoFocus />
          </div>
          <button className="primary-btn full" onClick={() => void attemptUnlock()}>{t("فوت على الحسابات")} <ArrowLeft size={17} /></button>
          <div className="privacy-note"><ShieldCheck size={16} /> {t("هذا المفتاح حماية بسيطة، مو تشفير كامل")}</div>
        </section>
        <footer className="login-footer">Aleppo Center Cash <span>© 2026</span></footer>
      </main>
    );
  }

  return (
    <main className="app-shell" dir={getDirection()}>
      <DesktopSidebar
        view={view}
        accountsCount={accounts.length}
        workspaceName={cloudWorkspace?.name}
        workspaceId={cloudWorkspace?.id}
        email={cloudUser?.email}
        theme={theme}
        onNavigate={(nextView) => setView(nextView)}
        onToggleTheme={() => toggleTheme?.()}
        onBackup={() => setShowBackupModal(true)}
        onExportFile={() => void exportBackup()}
        onCredits={() => setLocation("/credits")}
        onCopyWorkspace={copyWorkspaceId}
        onOpenWorkspaceManager={() => setShowWorkspaceManager(true)}
        onDeleteWorkspace={() => void resetEverything()}
        onDeleteAccount={() => void deleteAccountData()}
        onLogout={() => void handleLogout()}
      />
      <aside className={`sidebar mobile-sidebar ${showMobileNav ? "open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-lockup">
            <div className="brand-mark"><Landmark size={22} strokeWidth={1.8} /></div>
            <div><strong>Aleppo Center</strong><span>cash book</span></div>
          </div>
          <button className="close-mobile" onClick={() => setShowMobileNav(false)} aria-label={t("إغلاق القائمة")}><X size={20} /></button>
        </div>
        <button className="workspace-switcher" title={t("إدارة مساحات العمل")} onClick={() => { setShowWorkspaceManager(true); setShowMobileNav(false); }}><div className="workspace-avatar">AC</div><div><span>{t("المساحة الحالية")}</span><strong>{cloudWorkspace?.name ?? t("مركز حلب")}</strong><small className="workspace-id" dir="ltr">{cloudWorkspace?.id ?? t("محلي")}</small></div><ChevronDown size={15} /></button>
        <div className="nav-group-label">{t("التنقّل")}</div>
        <nav className="main-nav">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id || (id === "accounts" && view === "account") ? "active" : ""} onClick={() => { setView(id); setShowMobileNav(false); }}><Icon size={18} /><span>{t(label)}</span>{id === "accounts" && <b>{accounts.length}</b>}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="local-card"><div className="local-card-icon"><ShieldCheck size={17} /></div><div><strong>{t("سحابي وآمن")}</strong><span>{t("البيانات محفوظة في Supabase")}</span></div><Check size={16} className="check-icon" /></div>
        <div className="profile-menu-wrapper">
          <button className="sidebar-profile" onClick={() => setShowProfileMenu((current) => !current)} aria-expanded={showProfileMenu} aria-haspopup="menu">
            <div className="profile-avatar">{cloudUser?.email?.[0]?.toUpperCase() ?? t("م")}</div>
            <div><strong>{cloudWorkspace?.name ?? t("مركز حلب")}</strong><span>{cloudUser?.email ?? t("حساب المالك")}</span></div>
            <MoreHorizontal size={17} />
          </button>
          {showProfileMenu && (
            <div className="profile-menu" role="menu">
              <div className="profile-menu-item info">
                <span>{t("📧 البريد")}</span>
                <strong dir="ltr">{cloudUser?.email ?? "—"}</strong>
              </div>
              <div className="profile-menu-item info">
                <span>🏪 Workspace</span>
                <strong>{cloudWorkspace?.name ?? t("مركز حلب")}</strong>
              </div>
              <button className="profile-menu-item" onClick={copyWorkspaceId} disabled={!cloudWorkspace?.id} role="menuitem">
                <span>🆔 Workspace ID</span>
                <strong dir="ltr" className="mono">{cloudWorkspace?.id?.slice(0, 8) ?? "—"}{cloudWorkspace?.id ? "…" : ""}</strong>
                <Copy size={14} />
              </button>
              <button className="profile-menu-item" onClick={() => { toggleTheme?.(); }} role="menuitem"><span>{theme === "dark" ? t("☀️ الوضع الفاتح") : theme === "gold" ? t("✨ الوضع الذهبي") : theme === "red" ? t("🔴 الثيم الأحمر") : t("🌙 الوضع الداكن")}</span>{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}</button>
              <button className="profile-menu-item" onClick={() => { setShowBackupModal(true); setShowProfileMenu(false); }} role="menuitem">
                <span>{t("🛡️ النسخ والاستعادة")}</span>
                <ShieldCheck size={14} />
              </button>
              <button className="profile-menu-item" onClick={() => void exportBackup()} role="menuitem">
                <span>{t("💾 ملف استعادة JSON")}</span>
                <Download size={14} />
              </button>
              <button className="profile-menu-item" onClick={() => { setLocation("/credits"); }} role="menuitem">
                <span>{t("👥 فريق التطوير")}</span>
                <Heart size={14} />
              </button>
              {cloudWorkspace && (
                <>
                  <div className="profile-menu-divider" />
                  <button className="profile-menu-item danger" onClick={() => void resetEverything()} role="menuitem">
                    <span>{t("🗑️ حذف مساحة العمل نهائياً")}</span>
                    <Trash2 size={14} />
                  </button>
                </>
              )}
              <div className="profile-menu-divider" />
              <button className="profile-menu-item danger" onClick={() => void deleteAccountData()} role="menuitem">
                <span>{t("🧹 مسح بيانات الجهاز وتسجيل الخروج")}</span>
                <LogOut size={14} />
              </button>
              <button className="profile-menu-item" onClick={() => void handleLogout()} role="menuitem">
                <span>{t("🚪 تسجيل الخروج")}</span>
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>
      <section className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setShowMobileNav(true)} aria-label={t("فتح القائمة")}><Menu size={21} /></button>
          <div className="breadcrumb"><span>{t("مركز حلب")}</span><span className="breadcrumb-separator">/</span><strong>{view === "dashboard" ? t("نظرة عامة") : view === "accounts" ? t("الحسابات") : view === "activity" ? t("التعديلات") : view === "invoice" ? t("صانع الفواتير") : view === "manual" ? t("دليل الاستخدام") : view === "updates" ? t("التحديثات") : view === "settings" ? t("الإعدادات") : selectedAccount?.name}</strong></div>
          <div className="topbar-actions"><div className={`saved-state sync-${syncState}`} title={t("حالة اتصال Supabase")}>{syncState === "synced" ? <Wifi size={15} /> : <WifiOff size={15} />}<span className="saved-dot" /> {syncState === "syncing" ? t("جاري الاتصال بـ Supabase…") : syncState === "synced" ? t("متصل بـ Supabase") : syncState === "offline" ? t("غير متصل بـ Supabase") : syncState === "conflict" ? t("تعارض في السحابة") : t("فحص اتصال Supabase…")}</div><div className="notification-wrapper">
            <button className="icon-btn" onClick={() => { const next = !showNotifications; setShowNotifications(next); if (next) markNotificationsRead(); }} aria-label={t("الإشعارات")} aria-expanded={showNotifications} aria-haspopup="true">
              <Bell size={18} />
              {unreadNotificationCount > 0 && <span className="notification-dot" />}
            </button>
            {showNotifications && (
              <div className="notification-panel" role="dialog" aria-label={t("الإشعارات")}>
                <div className="notification-panel-head">
                  <div><strong>{t("الإشعارات")}</strong><span>{notifications.length ? notifications.length + t(" إشعار محفوظ") : t("ما في إشعارات لسا")}</span></div>
                  {unreadNotificationCount > 0 && <button onClick={markNotificationsRead}>{t("تحديد الكل كمقروء")}</button>}
                </div>
                <div className="notification-list">
                  {notifications.length === 0 ? (
                    <div className="notification-empty"><Bell size={20} /><strong>{t("ما في إشعارات جديدة")}</strong><span>{t("أي إضافة أو تعديل أو حذف رح يظهر هون.")}</span></div>
                  ) : (
                    notifications.map((notification) => (
                      <button key={notification.id} className={"notification-item " + (notification.read ? "" : "unread")} onClick={() => { markNotificationsRead(); setShowNotifications(false); setView("activity"); }}>
                        <div className={"notification-icon " + (notification.entity === "account" ? "account" : notification.entity === "payment" ? "payment" : "activity")}>
                          {notification.entity === "account" ? <WalletCards size={16} /> : notification.entity === "payment" ? <CircleDollarSign size={16} /> : <Activity size={16} />}
                        </div>
                        <div className="notification-copy">
                          <strong>{t(notificationActionLabels[notification.action] ?? notification.action)} {t(notificationEntityLabels[notification.entity] ?? notification.entity)}</strong>
                          <span>{notification.detail}</span>
                          <small>{new Intl.DateTimeFormat(getLanguage() === "ar" ? "ar-SY" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(notification.createdAt))}</small>
                        </div>
                        {!notification.read && <i />}
                      </button>
                    ))
                  )}
                </div>
                {notifications.length > 0 && <button className="notification-footer" onClick={() => { markNotificationsRead(); setShowNotifications(false); setView("activity"); }}>{t("عرض سجل التعديلات")} <ArrowLeft size={14} /></button>}
              </div>
            )}
          </div><div className="top-avatar">{t("م")}</div></div>
        </header>

        <div className="content-wrap">
          {view === "dashboard" && <DashboardView accounts={accounts} totals={totals} currency={dashboardCurrency} onToggleCurrency={() => setDashboardCurrency((current) => current === "SYP" ? "USD" : "SYP")} onOpenAccount={openAccount} onAddPayment={openPaymentFromDashboard} onGoAccounts={() => setView("accounts")} />}
          {view === "accounts" && <AccountsView accounts={filteredAccounts} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onOpenAccount={openAccount} onAddAccount={() => setShowAccountModal(true)} />}
          {view === "activity" && <ActivityView workspaceId={cloudWorkspace?.id} currentUserId={cloudUser?.id} />}
          {view === "invoice" && <InvoiceMaker accounts={accounts} onBack={() => setView("dashboard")} onToggleTheme={() => toggleTheme?.()} theme={theme} settingsLogo={sharedInvoiceLogo} onSaveSettingsLogo={saveSharedInvoiceLogo} />}
          {view === "manual" && <Manual onBack={() => setView("dashboard")} />}
          {view === "updates" && <Updates onBack={() => setView("dashboard")} />}
          {view === "settings" && <SettingsView theme={theme} onToggleTheme={() => toggleTheme?.()} setTheme={setTheme} workspaceName={cloudWorkspace?.name} workspaceId={cloudWorkspace?.id} workspaceRole={cloudWorkspace?.role} email={cloudUser?.email} syncState={syncState} unreadNotifications={unreadNotificationCount} sharedInvoiceLogo={sharedInvoiceLogo} onSaveSharedInvoiceLogo={saveSharedInvoiceLogo} onMarkNotificationsRead={markNotificationsRead} onBackup={() => setShowBackupModal(true)} onExportFile={() => void downloadRestorationFile()} onCopyWorkspace={copyWorkspaceId} onOpenWorkspaceManager={() => setShowWorkspaceManager(true)} onLogout={() => void handleLogout()} />}
          {view === "account" && selectedAccount && <AccountDetail account={selectedAccount} onBack={() => setView("accounts")} onEditAccount={() => openAccountEditor(selectedAccount)} onDeleteAccount={() => deleteAccount(selectedAccount.id)} onAddPayment={() => { setEditingPaymentId(null); setPaymentAccountId(selectedAccount.id); setShowPaymentModal(true); }} onEditPayment={openPaymentEditor} onDeletePayment={deletePayment} onExportPdf={() => void exportPdf(selectedAccount.id)} onExportPng={() => exportPng(selectedAccount.id)} />}
        </div>
      </section>

      {showWorkspaceManager && cloudWorkspace && (
        <WorkspaceManager
          currentWorkspaceId={cloudWorkspace.id}
          workspaces={availableWorkspaces}
          onClose={() => setShowWorkspaceManager(false)}
          onSwitch={async (workspace) => {
            setShowWorkspaceManager(false);
            setShowMobileNav(false);
            if (onSwitchWorkspace) await onSwitchWorkspace(workspace);
          }}
          onCreate={async (name) => {
            if (!onCreateWorkspace) return;
            setShowWorkspaceManager(false);
            await onCreateWorkspace(name);
          }}
          onJoin={async (workspaceId) => {
            if (!onJoinWorkspace) return;
            setShowWorkspaceManager(false);
            await onJoinWorkspace(workspaceId);
          }}
          onDelete={async () => {
            setShowWorkspaceManager(false);
            if (onDeleteWorkspace) await onDeleteWorkspace();
            else await resetEverything();
          }}
        />
      )}
      {showMobileNav && <button className="mobile-overlay" onClick={() => setShowMobileNav(false)} aria-label={t("إغلاق القائمة")} />}

      {showBackupModal && <Modal title={t("النسخ والاستعادة")} onClose={() => { if (!backupBusy) { setShowBackupModal(false); setBackupPassword(""); } }}><div className="modal-form">
        <div className="privacy-note"><ShieldCheck size={16} /> {t("النسخة السحابية خاصة بمساحة العمل، وملف JSON يُحفظ مشفراً بكلمة مرور الاستعادة.")}</div>
        <label>{t("كلمة مرور الاستعادة")}<input type="password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} placeholder={t("8 أحرف أو أكثر")} disabled={backupBusy} /></label>
        <button className="primary-btn full" onClick={() => void saveBackupPassword()} disabled={backupBusy}>{t("حفظ كلمة مرور الاستعادة")} <LockKeyhole size={16} /></button>
        <button className="secondary-btn full" onClick={() => void downloadRestorationFile()} disabled={backupBusy}>{t("تنزيل ملف استعادة JSON مشفر")} <Download size={16} /></button>
        <button className="secondary-btn full" onClick={() => void saveCloudBackup()} disabled={backupBusy}>{t("إنشاء نسخة سحابية الآن")} <ShieldCheck size={16} /></button>
        <button className="secondary-btn full" onClick={() => restorationFileInputRef.current?.click()} disabled={backupBusy}>{t("استيراد ملف استعادة JSON")} <Download size={16} /></button>
        <input ref={restorationFileInputRef} type="file" accept=".json,application/json" onChange={(event) => void importRestorationFile(event)} style={{ display: "none" }} />
        <button className="danger-btn full" onClick={() => void restoreFromCloudBackup()} disabled={backupBusy}>{t("استعادة آخر نسخة سحابية")} <ArrowLeft size={16} /></button>
        <small>{t("ملف JSON لا يحتوي كلمة مرور تسجيل الدخول أو مفاتيح Supabase. محتواه المحاسبي مشفّر محلياً بـ AES-GCM.")}</small>
      </div></Modal>}
      {showPaymentModal && <Modal title={editingPaymentId ? t("تعديل الدفعة") : t("دفعة جديدة")} onClose={() => { setShowPaymentModal(false); setEditingPaymentId(null); setPaymentAccountId(null); }}><div className="modal-form">
        {view === "dashboard" && !editingPaymentId && paymentAccountId !== null && (
          <label>
            {t("الحساب")}
            <select
              value={paymentAccountId}
              onChange={(event) => setPaymentAccountId(Number(event.target.value))}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}{account.owner ? " — " + account.owner : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>{t("اسم الدفعة")}<input value={paymentDraft.name} onChange={(event) => setPaymentDraft({ ...paymentDraft, name: event.target.value })} placeholder={t("مثلاً: دفعة بضاعة")} /></label><div className="form-grid"><label>{t("المبلغ")}<input type="number" min="1" step="1" value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: event.target.value })} placeholder="0" /></label><label>{t("العملة")}<select value={paymentDraft.currency} onChange={(event) => setPaymentDraft({ ...paymentDraft, currency: event.target.value as Currency })}><option value="SYP">{t("ليرة سورية")}</option><option value="USD">{t("دولار")}</option></select></label></div><label>{t("التاريخ")}<input type="date" value={paymentDraft.date} onChange={(event) => setPaymentDraft({ ...paymentDraft, date: event.target.value })} /></label><div className="type-picker"><span>{t("نوع الحركة")}</span><div><button className={paymentDraft.type === "credit" ? "selected credit" : ""} onClick={() => setPaymentDraft({ ...paymentDraft, type: "credit" })}><ArrowDownLeft size={16} /> {t("له")} <small>{t("إنت مدين له")}</small></button><button className={paymentDraft.type === "debit" ? "selected debit" : ""} onClick={() => setPaymentDraft({ ...paymentDraft, type: "debit" })}><ArrowUpRight size={16} /> {t("عليه")} <small>{t("هو مدين إلك")}</small></button></div></div><button className="primary-btn full" disabled={mutationBusy} onClick={addPayment}>{mutationBusy ? t("جار الحفظ…") : editingPaymentId ? t("حفظ التعديل") : t("حفظ الدفعة")} <Check size={17} /></button></div></Modal>}
      {showAccountModal && <Modal title={editingAccountId ? t("تعديل الحساب") : t("إضافة حساب جديد")} onClose={() => { setShowAccountModal(false); setEditingAccountId(null); setNewAccountName(""); setNewAccountOwner(""); }}><div className="modal-form"><label>{t("اسم الحساب")}<input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder={t("مثلاً: محل أبو علي")} autoFocus /></label><label>{t("اسم صاحب الحساب")} <span className="field-optional">{t("اختياري")}</span><input value={newAccountOwner} onChange={(event) => setNewAccountOwner(event.target.value)} placeholder={t("مثلاً: أحمد العلي (اختياري)")} /></label><button className="primary-btn full" disabled={mutationBusy} onClick={addAccount}>{mutationBusy ? t("جار الحفظ…") : editingAccountId ? t("حفظ التعديل") : t("إضافة الحساب")} <Plus size={17} /></button></div></Modal>}
    </main>
  );
}

function DashboardView({ accounts, totals, currency, onToggleCurrency, onOpenAccount, onAddPayment, onGoAccounts }: { accounts: Account[]; totals: Record<Currency, { credit: number; debit: number }>; currency: Currency; onToggleCurrency: () => void; onOpenAccount: (id: number) => void; onAddPayment: () => void; onGoAccounts: () => void }) {
    useLanguage();
  const todayLabel = new Intl.DateTimeFormat(getLanguage() === "ar" ? "ar-SY" : "en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const recentPayments = accounts.flatMap((account) => account.payments.map((payment) => ({ ...payment, accountName: account.name }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">{todayLabel}</div><h1>{t("أهلا، صاحب المركز")} <span>✦</span></h1><p>{t("هاي لمحة سريعة عن حساباتك اليوم.")}</p></div><button className="primary-btn" onClick={onAddPayment}><Plus size={18} /> {t("إضافة دفعة")}</button></div><div className="hero-summary"><div className="summary-copy"><span className="summary-kicker">{t("الرصيد الصافي الإجمالي")}</span><div className="big-total">{formatAmount(totals[currency].debit - totals[currency].credit, currency)}</div><div className="summary-meta"><span>{t("حسب الحركات المسجّلة")}</span></div></div><div className="summary-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><button className="orbit-core currency-toggle" onClick={onToggleCurrency} aria-label={currency === "SYP" ? t("تبديل إلى الدولار") : t("تبديل إلى الليرة السورية")}><CircleDollarSign size={29} /><span>{currency === "SYP" ? t("ل.س") : "$"}</span></button></div><div className="summary-breakdown"><div><span><i className="dot credit-dot" /> {t("له")}</span><strong>{formatAmount(totals[currency].credit, currency)}</strong></div><div><span><i className="dot debit-dot" /> {t("عليه")}</span><strong>{formatAmount(totals[currency].debit, currency)}</strong></div></div><div className="currency-switch" role="group" aria-label={t("العملة")}><button className={currency === "SYP" ? "active" : ""} onClick={() => currency !== "SYP" && onToggleCurrency()}>{t("ليرة سورية")} <b>SYP</b></button><button className={currency === "USD" ? "active" : ""} onClick={() => currency !== "USD" && onToggleCurrency()}>{t("دولار")} <b>USD</b></button></div></div><div className="stats-grid"><StatCard icon={WalletCards} label={t("عدد الحسابات")} value={String(accounts.length).padStart(2, "0")} note={t("حساب نشط")} tone="blue" /><StatCard icon={ArrowDownLeft} label={t("إجمالي له · ") + currency} value={formatAmount(totals[currency].credit, currency)} note={t("كل الحركات")} tone="mint" /><StatCard icon={ArrowUpRight} label={t("إجمالي عليه · ") + currency} value={formatAmount(totals[currency].debit, currency)} note={t("كل الحركات")} tone="amber" /><StatCard icon={CircleDollarSign} label={t("الرصيد · ") + currency} value={formatAmount(totals[currency].debit - totals[currency].credit, currency)} note={t("لكل الحسابات")} tone="violet" /></div><div className="dashboard-columns"><section className="surface-card recent-card"><div className="section-head"><div><h2>{t("آخر الحركات")}</h2><p>{t("آخر الدفعات المسجّلة عندك")}</p></div><button className="text-btn" onClick={onGoAccounts}>{t("عرض الكل")} <ArrowLeft size={15} /></button></div>{recentPayments.length ? <div className="payment-list">{recentPayments.map((payment) => <PaymentRow key={payment.id} payment={payment} accountName={payment.accountName} compact />)}</div> : <EmptyState text={t("لسا ما في حركات")} />}</section><section className="surface-card accounts-mini"><div className="section-head"><div><h2>{t("الحسابات النشطة")}</h2><p>{t("نظرة سريعة على زباينك")}</p></div><button className="round-icon-btn" onClick={onGoAccounts}><ArrowLeft size={16} /></button></div><div className="mini-accounts">{accounts.slice(0, 3).map((account) => <button key={account.id} className="mini-account" onClick={() => onOpenAccount(account.id)}><div className={`account-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><div><strong>{account.name}</strong><span>{account.owner || t("بدون اسم صاحب الحساب")}</span></div><div className="mini-balance">{account.payments.length}<small>{t("حركة")}</small></div></button>)}</div></section></div></div>;
}

function AccountsView({ accounts, searchTerm, setSearchTerm, onOpenAccount, onAddAccount }: { accounts: Account[]; searchTerm: string; setSearchTerm: (value: string) => void; onOpenAccount: (id: number) => void; onAddAccount: () => void }) {
    useLanguage();
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const sortedAccounts = [...accounts].sort((a, b) => {
    if (sortMode === "name") return a.name.localeCompare(b.name, "ar");
    const aDate = a.payments.reduce((latest, payment) => payment.date > latest ? payment.date : latest, "");
    const bDate = b.payments.reduce((latest, payment) => payment.date > latest ? payment.date : latest, "");
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return b.id - a.id;
  });
  return <div className="page-enter"><div className="page-heading"><div><div className="eyebrow">{t("دفتر الحسابات")}</div><h1>{t("الحسابات")} <span className="heading-count">{accounts.length}</span></h1><p>{t("كل زبون إلو حسابه، وكل حركة إلها مكانها.")}</p></div><button className="primary-btn" onClick={onAddAccount}><Plus size={18} /> {t("حساب جديد")}</button></div><div className="toolbar"><div className="search-box"><Search size={18} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t("دوّر على حساب أو اسم...")} /></div><button className="filter-btn" onClick={() => setSortMode((current) => current === "recent" ? "name" : "recent")} aria-label={sortMode === "recent" ? t("ترتيب حسب الاسم") : t("ترتيب حسب الأحدث")}><BarChart3 size={16} /> {t("ترتيب:")} {sortMode === "recent" ? t("الأحدث") : t("الاسم")} <ChevronDown size={15} /></button></div>{accounts.length ? <div className="account-grid">{sortedAccounts.map((account) => <button key={account.id} className="account-card" onClick={() => onOpenAccount(account.id)}><div className="account-card-top"><div className={`account-avatar large-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><MoreHorizontal size={18} className="muted-icon" /></div><div className="account-card-copy"><h3>{account.name}</h3><p><UserRound size={14} /> {account.owner}</p></div><div className="account-card-footer"><div><span>{t("عدد الحركات")}</span><strong>{account.payments.length}</strong></div><div className="card-arrow"><ArrowLeft size={17} /></div></div></button>)}</div> : <div className="surface-card empty-search"><div className="empty-search-icon"><Search size={25} /></div><span className="empty-search-kicker">{t("دفتر الحسابات جاهز")}</span><h3>{searchTerm ? t("ما لقينا حساب مطابق") : t("ابدأ بأول حساب")}</h3><p>{searchTerm ? t("جرّب اسم تاني أو امسح البحث.") : t("أضف زبون أو جهة جديدة، وبعدها سجّل أول حركة مالية.")}</p>{!searchTerm && <button className="primary-btn empty-search-action" onClick={onAddAccount}><Plus size={17} /> {t("إضافة أول حساب")}</button>}</div>}</div>;
}

function AccountDetail({ account, onBack, onEditAccount, onDeleteAccount, onAddPayment, onEditPayment, onDeletePayment, onExportPdf, onExportPng }: { account: Account; onBack: () => void; onEditAccount: () => void; onDeleteAccount: () => void; onAddPayment: () => void; onEditPayment: (payment: Payment) => void; onDeletePayment: (id: number) => void; onExportPdf: () => void; onExportPng: () => void }) {
    useLanguage();
  const currencies: Currency[] = ["SYP", "USD"];
  const [paymentQuery, setPaymentQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentType>("all");
  const filteredPayments = account.payments.filter((payment) => {
    const matchesQuery = `${payment.name} ${payment.amount} ${payment.currency}`.toLowerCase().includes(paymentQuery.toLowerCase());
    return matchesQuery && (paymentFilter === "all" || payment.type === paymentFilter);
  });
  return <div className="page-enter"><button className="back-btn" onClick={onBack}><ArrowRightIcon /> {t("رجعة للحسابات")}</button><div className="detail-heading"><div className="detail-title"><div className={`account-avatar large-avatar ${account.accent}`}>{account.name.slice(0, 1)}</div><div><div className="eyebrow">{t("حساب زبون")}</div><h1>{account.name}</h1><p><UserRound size={14} /> {account.owner}</p></div></div><div className="detail-actions"><button className="secondary-btn" onClick={onEditAccount}><Pencil size={15} /> {t("تعديل الحساب")}</button><button className="secondary-btn" onClick={onExportPdf}><FileText size={15} /> {t("تصدير PDF")}</button><button className="secondary-btn" onClick={onExportPng}><Download size={15} /> {t("تصدير PNG")}</button><button className="danger-btn" onClick={onDeleteAccount}><Trash2 size={15} /> {t("حذف الحساب")}</button><button className="primary-btn" onClick={onAddPayment}><Plus size={18} /> {t("إضافة دفعة")}</button></div></div><div className="currency-summary-grid">{currencies.map((currency) => { const payments = account.payments.filter((payment) => payment.currency === currency); const credit = payments.filter((payment) => payment.type === "credit").reduce((sum, payment) => sum + payment.amount, 0); const debit = payments.filter((payment) => payment.type === "debit").reduce((sum, payment) => sum + payment.amount, 0); return <div className={`currency-card ${currency === "USD" ? "usd-card" : ""}`} key={currency}><div className="currency-card-head"><span className="currency-badge">{currency === "SYP" ? t("ل.س") : "$"}</span><span>{currency === "SYP" ? t("الليرة السورية") : t("الدولار الأميركي")}</span></div><div className="currency-balance">{formatAmount(debit - credit, currency)}</div><div className="currency-lines"><span><i className="dot credit-dot" /> {t("له")} <strong>{formatAmount(credit, currency)}</strong></span><span><i className="dot debit-dot" /> {t("عليه")} <strong>{formatAmount(debit, currency)}</strong></span></div></div>; })}</div><section className="surface-card detail-payments"><div className="section-head"><div><h2>{t("سجل الدفعات")}</h2><p>{filteredPayments.length} {t("من")} {account.payments.length} {t("حركات")}</p></div><span className="payment-count">{paymentFilter === "all" ? t("كل الحركات") : paymentFilter === "credit" ? t("له") : t("عليه")}</span></div><div className="payment-toolbar"><div className="payment-search"><Search size={15} /><input value={paymentQuery} onChange={(event) => setPaymentQuery(event.target.value)} placeholder={t("دوّر باسم الدفعة...")} /></div><div className="payment-filters"><button className={paymentFilter === "all" ? "active" : ""} onClick={() => setPaymentFilter("all")}>{t("الكل")}</button><button className={paymentFilter === "credit" ? "active credit" : ""} onClick={() => setPaymentFilter("credit")}>{t("له")}</button><button className={paymentFilter === "debit" ? "active debit" : ""} onClick={() => setPaymentFilter("debit")}>{t("عليه")}</button></div></div>{filteredPayments.length ? <div className="payment-list full-list">{filteredPayments.map((payment) => <PaymentRow key={payment.id} payment={payment} onEdit={() => onEditPayment(payment)} onDelete={() => onDeletePayment(payment.id)} />)}</div> : <EmptyState text={account.payments.length ? t("ما في حركات مطابقة") : t("ما في دفعات بهالحساب لسا")} />}</section></div>;
}

function StatCard({ icon: Icon, label, value, note, tone }: { icon: LucideIcon; label: string; value: string; note: string; tone: string }) {
    useLanguage();
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function ExportCard({ icon: Icon, title, description, action, tone, onClick }: { icon: LucideIcon; title: string; description: string; action: string; tone: string; onClick: () => void }) {
    useLanguage();
  return <button className="export-card" onClick={onClick}><div className={`export-icon ${tone}`}><Icon size={21} /></div><div className="export-copy"><h3>{title}</h3><p>{description}</p></div><span className="export-action">{action} <Download size={15} /></span></button>;
}

function PaymentRow({ payment, accountName, compact, onEdit, onDelete }: { payment: Payment; accountName?: string; compact?: boolean; onEdit?: () => void; onDelete?: () => void }) {
    useLanguage();
  return <div className="payment-row"><div className={`payment-type ${payment.type}`} >{payment.type === "credit" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</div><div className="payment-copy"><strong>{payment.name}</strong><span>{accountName ?? formatDate(payment.date)}{accountName && <> <i>•</i> {formatDate(payment.date)}</>}</span></div><div className={`payment-amount ${payment.type}`}>{payment.type === "credit" ? "+" : "−"}{formatAmount(payment.amount, payment.currency)}</div>{!compact && <><button className="delete-btn" onClick={onEdit} aria-label={t("تعديل الدفعة")}><Pencil size={15} /></button><button className="delete-btn" onClick={onDelete} aria-label={t("حذف الدفعة")}><Trash2 size={16} /></button></>}</div>;
}

function EmptyState({ text }: { text: string }) {
    useLanguage(); return <div className="empty-state"><Sparkles size={20} /><span>{text}</span><small>{t("لما تضيف حركة، رح تظهر هون")}</small></div>; }
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
    useLanguage(); return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label={t("إغلاق")}><X size={19} /></button></div>{children}</section></div>; }
function ArrowRightIcon() {
    useLanguage(); return <ArrowLeft size={16} />; }


function SettingsView({ theme, onToggleTheme, setTheme, onOpenWorkspaceManager, workspaceName, workspaceId, workspaceRole, email, syncState, unreadNotifications, sharedInvoiceLogo, onSaveSharedInvoiceLogo, onMarkNotificationsRead, onBackup, onExportFile, onCopyWorkspace, onLogout }: { theme: "light" | "dark" | "gold" | "red" | "yellow-black"; onToggleTheme: () => void; setTheme: (theme: "light" | "dark" | "gold" | "red" | "yellow-black") => void; onOpenWorkspaceManager: () => void; workspaceName?: string | null; workspaceId?: string | null; workspaceRole?: "owner" | "member"; email?: string | null; syncState: string; unreadNotifications: number; sharedInvoiceLogo: string; onSaveSharedInvoiceLogo: (logo: string) => Promise<void>; onMarkNotificationsRead: () => void; onBackup: () => void; onExportFile: () => void; onCopyWorkspace: () => void; onLogout: () => void }) {
  const { language, setLanguage } = useLanguage();
  const showLanguageSetting = typeof window !== "undefined" && window.location.protocol !== "file:" && !Capacitor.isNativePlatform();
  const dark = theme === "dark"; const gold = theme === "gold"; const red = theme === "red"; const yellowBlack = theme === "yellow-black"; const connected = syncState === "synced";
  const roleLabel = workspaceRole === "owner" ? t("مالك") : workspaceRole === "member" ? t("عضو") : "—";
  return <div className="page-enter settings-page"><div className="page-heading"><div><div className="eyebrow">{t("تفضيلات التطبيق")}</div><h1>{t("الإعدادات")}</h1><p>{t("تحكم بشكل التطبيق، البيانات، الإشعارات، ومساحة العمل من مكان واحد.")}</p></div></div><div className="settings-grid">
    {showLanguageSetting && <section className="surface-card settings-section settings-language-section"><div className="settings-section-head"><div><h2>{t("اللغة")}</h2><p>{t("اختر لغة الواجهة لتطبيقها على الموقع.")}</p></div><div className="settings-section-icon"><Languages size={18} /></div></div><div className="settings-language-options" role="group" aria-label={t("لغة الواجهة")}><button type="button" className={"settings-language-option " + (language === "ar" ? "active" : "")} aria-pressed={language === "ar"} onClick={() => setLanguage("ar")}>العربية</button><button type="button" className={"settings-language-option " + (language === "en" ? "active" : "")} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button></div></section>}
    <section className="surface-card settings-section"><div className="settings-section-head"><div><h2>{t("المظهر")}</h2><p>{t("اختيار طريقة عرض التطبيق.")}</p></div><div className="settings-section-icon">{yellowBlack ? <Sparkles size={18} /> : red ? <Heart size={18} /> : gold ? <Sparkles size={18} /> : dark ? <Moon size={18} /> : <Sun size={18} />}</div></div><div className="settings-theme-options"><button className={"settings-theme-option " + (theme === "light" ? "active" : "")} onClick={() => setTheme("light")}><Sun size={16} /><strong>{t("فاتح")}</strong></button><button className={"settings-theme-option " + (theme === "dark" ? "active" : "")} onClick={() => setTheme("dark")}><Moon size={16} /><strong>{t("داكن")}</strong></button><button className={"settings-theme-option gold-option " + (gold ? "active" : "")} onClick={() => setTheme("gold")}><Sparkles size={16} /><strong>{t("ذهبي")}</strong></button><button className={"settings-theme-option red-option " + (red ? "active" : "")} onClick={() => setTheme("red")}><Heart size={16} /><strong>{t("أحمر قديم")}</strong></button><button className={"settings-theme-option yellow-black-option " + (yellowBlack ? "active" : "")} onClick={() => setTheme("yellow-black")}><Sparkles size={16} /><strong>Yellow &amp; Black</strong></button></div><button className="settings-row settings-action" onClick={onToggleTheme}><div className="settings-row-icon">{yellowBlack ? <Sparkles size={18} /> : red ? <Heart size={18} /> : dark ? <Moon size={18} /> : gold ? <Sparkles size={18} /> : <Sun size={18} />}</div><div className="settings-row-copy"><strong>{yellowBlack ? "Yellow & Black" : red ? t("الثيم الأحمر القديم") : gold ? t("الثيم الذهبي") : t("الوضع الداكن")}</strong><span>{yellowBlack || red || gold || dark ? t("مفعّل") : t("غير مفعّل")}</span></div><span className={"settings-switch " + ((dark || gold || red || yellowBlack) ? "on" : "")}><i /></span></button></section>
    <section className="surface-card settings-section"><div className="settings-section-head"><div><h2>{t("شعار الفواتير")}</h2><p>{t("الشعار المحفوظ هنا يظهر تلقائياً في صانع الفواتير على كل أجهزتك وأجهزة أعضاء المساحة.")}</p></div><div className="settings-section-icon"><ImageIcon size={18} /></div></div><div className="settings-branding-row"><div className="settings-logo-preview">{sharedInvoiceLogo ? <img src={sharedInvoiceLogo} alt={t("شعار الفواتير")} /> : <ImageIcon size={24} />}</div><div className="settings-row-copy"><strong>{sharedInvoiceLogo ? t("الشعار المحفوظ على الخادم") : t("لم يتم اختيار شعار بعد")}</strong><span>{t("يمكن للمالك أو العضو تغييره وسيظهر التغيير على الأجهزة الأخرى.")}</span></div><label className="primary-btn"><Upload size={16} /> {sharedInvoiceLogo ? t("تغيير الشعار") : t("اختيار الشعار")}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file=e.target.files?.[0]; e.target.value=""; if(!file)return; if(file.size>2*1024*1024){toast.error(t("حجم الشعار يجب ألا يتجاوز 2MB"));return;} const reader=new FileReader(); reader.onload=async()=>{try{const source=String(reader.result);const image=new Image();image.onload=async()=>{const size=200;const canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;const ctx=canvas.getContext("2d");if(!ctx){toast.error(t("تعذر تجهيز الشعار"));return;}ctx.clearRect(0,0,size,size);const sourceWidth=image.naturalWidth;const sourceHeight=image.naturalHeight;const maxSize=Math.max(sourceWidth,sourceHeight);const previewScale=Math.min(1,1200/maxSize);const scanWidth=Math.max(1,Math.round(sourceWidth*previewScale));const scanHeight=Math.max(1,Math.round(sourceHeight*previewScale));const scanCanvas=document.createElement("canvas");scanCanvas.width=scanWidth;scanCanvas.height=scanHeight;const scanCtx=scanCanvas.getContext("2d");if(!scanCtx){toast.error(t("تعذر تحليل الشعار"));return;}scanCtx.clearRect(0,0,scanWidth,scanHeight);scanCtx.drawImage(image,0,0,scanWidth,scanHeight);const pixels=scanCtx.getImageData(0,0,scanWidth,scanHeight).data;let minX=scanWidth,minY=scanHeight,maxX=-1,maxY=-1;for(let y=0;y<scanHeight;y+=1){for(let x=0;x<scanWidth;x+=1){const alpha=pixels[(y*scanWidth+x)*4+3];if(alpha>12){if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;}}}const hasTransparentBackground=maxX>=0&&maxY>=0;const cropX=hasTransparentBackground?Math.floor(minX/previewScale):0;const cropY=hasTransparentBackground?Math.floor(minY/previewScale):0;const cropRight=hasTransparentBackground?Math.ceil((maxX+1)/previewScale):sourceWidth;const cropBottom=hasTransparentBackground?Math.ceil((maxY+1)/previewScale):sourceHeight;const cropWidth=Math.max(1,cropRight-cropX);const cropHeight=Math.max(1,cropBottom-cropY);const scale=Math.min((size-12)/cropWidth,(size-12)/cropHeight);const w=cropWidth*scale;const h=cropHeight*scale;ctx.drawImage(image,cropX,cropY,cropWidth,cropHeight,(size-w)/2,(size-h)/2,w,h);await onSaveSharedInvoiceLogo(canvas.toDataURL("image/png"));toast.success(t("تم ضبط الشعار تلقائياً على الحجم المناسب 200×200px"));};image.onerror=()=>toast.error(t("تعذر قراءة الشعار"));image.src=source;}catch{toast.error(t("تعذر تجهيز الشعار"));}}; reader.readAsDataURL(file); }} /></label>{sharedInvoiceLogo && <button className="secondary-btn" onClick={() => void onSaveSharedInvoiceLogo("")}>{t("إزالة الشعار")}</button>}</div></section><section className="surface-card settings-section"><div className="settings-section-head"><div><h2>{t("النسخ والاستعادة")}</h2><p>{t("إدارة النسخ السحابية وملفات الاستعادة المشفرة.")}</p></div><div className="settings-section-icon"><ShieldCheck size={18} /></div></div><button className="settings-row settings-action" onClick={onBackup}><div className="settings-row-icon"><ShieldCheck size={18} /></div><div className="settings-row-copy"><strong>{t("النسخ والاستعادة")}</strong><span>{t("نسخة سحابية، ملف JSON مشفر وكلمة مرور الاستعادة")}</span></div><ArrowLeft size={17} /></button><button className="settings-row settings-action" onClick={onExportFile} style={{marginTop:8}}><div className="settings-row-icon"><Download size={18} /></div><div className="settings-row-copy"><strong>{t("تصدير ملف استعادة")}</strong><span>{t("تنزيل نسخة JSON مشفرة للاحتفاظ بها خارج التطبيق")}</span></div><ArrowLeft size={17} /></button></section>
    <section className="surface-card settings-section"><div className="settings-section-head"><div><h2>{t("الإشعارات")}</h2><p>{t("متابعة آخر الإضافات والتعديلات والمزامنة.")}</p></div><div className="settings-section-icon"><Bell size={18} /></div></div><button className="settings-row settings-action" onClick={onMarkNotificationsRead} disabled={unreadNotifications === 0}><div className="settings-row-icon"><Bell size={18} /></div><div className="settings-row-copy"><strong>{t("الإشعارات غير المقروءة")}</strong><span>{unreadNotifications ? (unreadNotifications + t(" إشعار يحتاج مراجعة")) : t("لا توجد إشعارات غير مقروءة")}</span></div><span className="settings-badge">{unreadNotifications}</span></button></section>
    <section className="surface-card settings-section"><div className="settings-section-head"><div><h2>{t("مساحة العمل والاتصال")}</h2><p>{t("معلومات المساحة والحالة الحالية.")}</p></div><div className="settings-section-icon"><Landmark size={18} /></div></div><div className="settings-info-list"><div className="settings-info"><span>{t("المساحة")}</span><strong>{workspaceName ?? "—"}</strong></div><div className="settings-info"><span>{t("الدور")}</span><strong>{roleLabel}</strong></div><div className="settings-info"><span>{t("البريد")}</span><strong dir="ltr">{email ?? "—"}</strong></div><div className="settings-info"><span>Supabase</span><strong className={connected ? "settings-ok" : "settings-muted"}>{connected ? t("متصل") : syncState === "syncing" ? t("جارٍ الاتصال") : syncState === "conflict" ? t("تعارض") : t("غير متصل")}</strong></div><button className="settings-copy" onClick={onCopyWorkspace} disabled={!workspaceId}><Copy size={15} /> {t("نسخ Workspace ID")}</button><button className="settings-copy settings-workspace-manager-button" onClick={onOpenWorkspaceManager}><Building2 size={15} /> {t("إدارة مساحات العمل")}</button></div></section>
    <section className="surface-card settings-section"><div className="settings-section-head"><div><h2>{t("معلومات التطبيق")}</h2><p>{t("معلومات سريعة عن النسخة الحالية.")}</p></div><div className="settings-section-icon"><GitBranch size={18} /></div></div><div className="settings-info-list"><div className="settings-info"><span>{t("التطبيق")}</span><strong>Aleppo Center Cash</strong></div><div className="settings-info"><span>{t("المنصة")}</span><strong>Web / PWA</strong></div><div className="settings-info"><span>{t("البيانات")}</span><strong>Supabase Cloud</strong></div><div className="settings-info"><span>{t("المزامنة")}</span><strong className={connected ? "settings-ok" : "settings-muted"}>{connected ? t("مفعّلة") : t("تحتاج اتصال")}</strong></div></div></section>
    <section className="surface-card settings-section settings-danger-section"><div className="settings-section-head"><div><h2>{t("الجلسة")}</h2><p>{t("إنهاء جلسة الدخول الحالية.")}</p></div><div className="settings-section-icon"><LogOut size={18} /></div></div><button className="settings-row settings-danger-action" onClick={onLogout}><div className="settings-row-icon"><LogOut size={18} /></div><div className="settings-row-copy"><strong>{t("تسجيل الخروج")}</strong><span>{t("ستحتاج إلى تسجيل الدخول مجدداً للوصول إلى المساحة.")}</span></div><ArrowLeft size={17} /></button></section>
  </div></div>;
}