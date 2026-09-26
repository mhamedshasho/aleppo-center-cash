import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, UserRound, WalletCards, CreditCard, Trash2, Pencil, Plus, CalendarDays } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ActivityEntry = {
  id: number;
  workspace_id: string;
  user_id: string;
  actor_email: string | null;
  action: "create" | "update" | "delete" | "import" | "export" | "login" | "sync" | "conflict";
  entity: "workspace" | "account" | "payment" | "member" | "backup" | "session";
  entity_id: string | null;
  summary: string;
  created_at: string;
};

type Props = {
  workspaceId?: string | null;
  currentUserId?: string | null;
};

const actionLabels: Record<string, string> = {
  create: "إضافة",
  update: "تعديل",
  delete: "حذف",
  import: "استيراد",
  export: "تصدير",
  login: "تسجيل دخول",
  sync: "مزامنة",
  conflict: "تعارض",
};

const entityLabels: Record<string, string> = {
  account: "حساب",
  payment: "دفعة",
  workspace: "مساحة العمل",
  member: "عضو",
  backup: "نسخة احتياطية",
  session: "جلسة",
};

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("ar-SY", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ar-SY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));

const formatAmount = (value: unknown, currency?: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return currency === "USD" ? `$${amount.toLocaleString("en-US")}` : `${amount.toLocaleString("ar-SY")} ل.س`;
};

function readSummary(summary: string) {
  try {
    return JSON.parse(summary) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getTarget(entry: ActivityEntry) {
  const data = readSummary(entry.summary);
  if (entry.action === "update" && data.before && data.after) {
    const before = data.before as Record<string, unknown>;
    const after = data.after as Record<string, unknown>;
    if (entry.entity === "payment") {
      const changes: string[] = [];
      if (before.name !== after.name) changes.push(`الاسم: ${String(before.name ?? "—")} ← ${String(after.name ?? "—")}`);
      if (before.amount_minor !== after.amount_minor || before.currency !== after.currency) {
        changes.push(`المبلغ: ${formatAmount(before.amount_minor, String(before.currency ?? ""))} ← ${formatAmount(after.amount_minor, String(after.currency ?? ""))}`);
      }
      if (before.payment_type !== after.payment_type) changes.push(`النوع: ${String(before.payment_type)} ← ${String(after.payment_type)}`);
      if (before.occurred_on !== after.occurred_on) changes.push(`التاريخ: ${String(before.occurred_on)} ← ${String(after.occurred_on)}`);
      return changes.join(" · ") || "تم تعديل بيانات الدفعة";
    }
    const changes: string[] = [];
    if (before.name !== after.name) changes.push(`الاسم: ${String(before.name ?? "—")} ← ${String(after.name ?? "—")}`);
    if (before.owner_name !== after.owner_name) changes.push(`صاحب الحساب: ${String(before.owner_name ?? "—")} ← ${String(after.owner_name ?? "—")}`);
    return changes.join(" · ") || "تم تعديل بيانات الحساب";
  }

  if (entry.entity === "payment") {
    return String(data.name ?? "دفعة");
  }
  if (entry.entity === "account") {
    return String(data.name ?? "حساب");
  }
  return entry.summary || "تعديل";
}

function ActivityView({ workspaceId, currentUserId }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const PAGE_SIZE = 100;
  const [period, setPeriod] = useState<"all" | "today">("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!supabase || !workspaceId) {
      setEntries([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    setRefreshing(true);
    let query = supabase
      .from("audit_log")
      .select("id,workspace_id,user_id,actor_email,action,entity,entity_id,summary,created_at", { count: "exact" })
      .eq("workspace_id", workspaceId);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (period === "today") {
      query = query.gte("created_at", todayStart);
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!error) {
      setEntries((data ?? []) as ActivityEntry[]);
      setTotalCount(count ?? 0);
    }
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    setPage(0);
  }, [period, workspaceId]);

  useEffect(() => {
    void load();
    if (!supabase || !workspaceId) return;
    const channel = supabase
      .channel(`audit-live-${workspaceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log", filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
        if (page === 0) {
          setEntries((current) => [payload.new as ActivityEntry, ...current].slice(0, PAGE_SIZE));
          setTotalCount((current) => current + 1);
        }
      })
      .subscribe();

    const timer = window.setInterval(() => void load(), 60000);
    return () => {
      window.clearInterval(timer);
      void supabase?.removeChannel(channel);
    };
  }, [workspaceId, period, page]);

  const filtered = entries;

  const counts = useMemo(() => ({
    total: filtered.length,
    create: filtered.filter((item) => item.action === "create").length,
    update: filtered.filter((item) => item.action === "update").length,
    delete: filtered.filter((item) => item.action === "delete").length,
  }), [filtered]);

  return (
    <section className="activity-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><Activity size={14} /> سجل التعديلات</div>
          <h1>كل حركة، موثّقة.</h1>
          <p>أي إضافة أو تعديل أو حذف من قبلك أو من أي عضو تظهر هنا مباشرة من السحابة.</p>
        </div>
        <button className="secondary-btn" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "spin" : ""} /> تحديث
        </button>
      </div>

      <div className="activity-toolbar">
        <div className="activity-tabs">
          <button className={period === "all" ? "active" : ""} onClick={() => setPeriod("all")}><Activity size={16} /> كل السجل</button>
          <button className={period === "today" ? "active" : ""} onClick={() => setPeriod("today")}><CalendarDays size={16} /> اليوم</button>
        </div>
        <div className="activity-stats">
          <span><Activity size={14} /> {counts.total} حركة</span>
          <span><Plus size={14} /> {counts.create}</span>
          <span><Pencil size={14} /> {counts.update}</span>
          <span><Trash2 size={14} /> {counts.delete}</span>
        </div>
      </div>

      {loading ? (
        <div className="activity-empty">جاري تحميل سجل التعديلات من Supabase…</div>
      ) : (
        <div className="activity-feed">
          {filtered.length === 0 && <div className="activity-empty">لا توجد حركات مسجلة في هذه الفترة.</div>}
          {filtered.map((entry) => <ActivityRow key={entry.id} entry={entry} currentUserId={currentUserId} />)}
        </div>
      )}

      <div className="activity-pagination">
        <button
          className="secondary-btn"
          disabled={page === 0 || refreshing}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
        >
          السابق
        </button>
        <span>صفحة {page + 1} من {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))} · {totalCount.toLocaleString("ar-SY")} حركة</span>
        <button
          className="secondary-btn"
          disabled={(page + 1) * PAGE_SIZE >= totalCount || refreshing}
          onClick={() => setPage((current) => current + 1)}
        >
          التالي
        </button>
      </div>
    </section>
  );
}

function ActivityRow({ entry, currentUserId }: { entry: ActivityEntry; currentUserId?: string | null }) {
  const icon = entry.action === "create" ? <Plus size={17} /> : entry.action === "update" ? <Pencil size={17} /> : entry.action === "delete" ? <Trash2 size={17} /> : <Activity size={17} />;
  const actor = currentUserId && entry.user_id === currentUserId ? "أنت" : entry.actor_email || "عضو في مساحة العمل";
  return (
    <article className={`activity-row action-${entry.action}`}>
      <div className="activity-icon">{icon}</div>
      <div className="activity-body">
        <div className="activity-main">
          <strong>{actionLabels[entry.action] ?? entry.action} {entityLabels[entry.entity] ?? entry.entity}</strong>
          <span>{getTarget(entry)}</span>
        </div>
        <div className="activity-meta"><UserRound size={13} /> {actor} <span>·</span> {formatTime(entry.created_at)}</div>
      </div>
      <div className="activity-entity-icon">{entry.entity === "account" ? <WalletCards size={18} /> : entry.entity === "payment" ? <CreditCard size={18} /> : <Activity size={18} />}</div>
    </article>
  );
}

export default ActivityView;
