import { useEffect, useState } from "react";
import { Check, Grid3X3, KeyRound, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { WorkspaceLockInput, validateWorkspaceCredential, type WorkspaceLockType } from "@/components/WorkspaceLockInput";

type WorkspaceLockConfig = {
  configured: boolean;
  lock_type: WorkspaceLockType;
  updated_at?: string | null;
};

const lockOptions: { type: WorkspaceLockType; title: string; description: string; icon: typeof KeyRound }[] = [
  { type: "password", title: "كلمة مرور", description: "كلمة مشتركة للمساحة", icon: KeyRound },
  { type: "pin", title: "PIN من ٤ أرقام", description: "رمز رقمي سريع", icon: Grid3X3 },
  { type: "pattern", title: "نمط الشاشة", description: "رسم على شبكة ٣×٣", icon: Smartphone },
];

function parseConfig(value: unknown): WorkspaceLockConfig {
  if (value && typeof value === "object") {
    const data = value as Partial<WorkspaceLockConfig>;
    if (data.configured === true && (data.lock_type === "password" || data.lock_type === "pin" || data.lock_type === "pattern")) {
      return { configured: true, lock_type: data.lock_type, updated_at: data.updated_at ?? null };
    }
  }
  return { configured: false, lock_type: "password" };
}

function modeLabel(type: WorkspaceLockType) {
  return type === "pin" ? "PIN من ٤ أرقام" : type === "pattern" ? "نمط الشاشة" : "كلمة مرور";
}

export default function WorkspaceAccessSettings({ workspaceId, workspaceRole }: { workspaceId?: string | null; workspaceRole?: "owner" | "member" }) {
  const [config, setConfig] = useState<WorkspaceLockConfig>({ configured: false, lock_type: "password" });
  const [loading, setLoading] = useState(true);
  const [targetType, setTargetType] = useState<WorkspaceLockType>("password");
  const [currentCredential, setCurrentCredential] = useState("");
  const [newCredential, setNewCredential] = useState("");
  const [confirmCredential, setConfirmCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = workspaceRole === "owner";

  useEffect(() => {
    if (!supabase || !workspaceId) {
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      const { data, error } = await supabase!.rpc("get_workspace_lock_config", { target_workspace: workspaceId });
      if (!active) return;
      if (error) {
        console.error("[AleppoCenterCash] workspace lock config load failed", error);
        toast.error("تعذر تحميل إعداد القفل المشترك.");
        setLoading(false);
        return;
      }
      const next = parseConfig(data);
      setConfig(next);
      setTargetType(next.lock_type);
      setLoading(false);
    };

    void load();

    const channel = supabase
      .channel("workspace-lock-settings-" + workspaceId)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "workspace_lock_modes",
        filter: "workspace_id=eq." + workspaceId,
      }, (payload) => {
        const nextRow = payload.new as { lock_type?: unknown; updated_at?: unknown } | null;
        if (nextRow && (nextRow.lock_type === "password" || nextRow.lock_type === "pin" || nextRow.lock_type === "pattern")) {
          setConfig({ configured: true, lock_type: nextRow.lock_type, updated_at: typeof nextRow.updated_at === "string" ? nextRow.updated_at : null });
          setTargetType(nextRow.lock_type);
          setCurrentCredential("");
          setNewCredential("");
          setConfirmCredential("");
        }
      })
      .subscribe();

    return () => {
      active = false;
      void supabase?.removeChannel(channel);
    };
  }, [workspaceId]);

  const save = async () => {
    if (!supabase || !workspaceId || !isOwner || busy) return;
    const validation = validateWorkspaceCredential(targetType, newCredential);
    if (validation) {
      toast.error(validation);
      return;
    }
    if (newCredential !== confirmCredential) {
      toast.error(targetType === "pattern" ? "النمطان غير متطابقين. ارسم النمط نفسه مرتين." : "تأكيد القفل الجديد غير مطابق.");
      return;
    }
    if (config.configured && !currentCredential) {
      toast.error("أدخل القفل الحالي أولاً للتأكد من صلاحيتك على تغييره.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("set_workspace_lock", {
        target_workspace: workspaceId,
        new_lock_type: targetType,
        new_credential: newCredential,
        current_credential: config.configured ? currentCredential : null,
      });
      if (error) throw error;

      const next = parseConfig(data);
      setConfig(next);
      setTargetType(next.lock_type);
      setCurrentCredential("");
      setNewCredential("");
      setConfirmCredential("");
      toast.success("تم تحديث قفل مساحة العمل على الخادم. سيتحول جميع الأعضاء إلى طريقة الدخول الجديدة.");
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const normalized = raw.toLowerCase();
      if (normalized.includes("current_workspace_lock_invalid")) {
        toast.error("القفل الحالي غير صحيح.");
      } else if (normalized.includes("current_workspace_lock_required")) {
        toast.error("أدخل القفل الحالي قبل تغييره.");
      } else if (normalized.includes("not_workspace_owner")) {
        toast.error("تغيير قفل المساحة متاح لمالكها فقط.");
      } else if (normalized.includes("workspace_pin_must_be_4_digits")) {
        toast.error("الـ PIN يجب أن يتكوّن من ٤ أرقام بالضبط.");
      } else if (normalized.includes("invalid_workspace_pattern") || normalized.includes("workspace_pattern_points_must_be_unique")) {
        toast.error("نمط الشاشة غير صالح. استخدم ٤ نقاط مختلفة على الأقل.");
      } else {
        console.error("[AleppoCenterCash] workspace lock save failed", error);
        toast.error("تعذر حفظ القفل المشترك. جرّب مرة أخرى.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="app-lock-security-note"><LockKeyhole size={20} /><span>جارٍ تحميل إعداد القفل المشترك من الخادم…</span></div>;
  }

  if (!workspaceId) {
    return <div className="app-lock-security-note"><ShieldCheck size={20} /><span>مساحة العمل غير محددة، لذلك لم تُحمّل إعدادات القفل.</span></div>;
  }

  return (
    <div className="app-lock-settings workspace-access-settings">
      <div className="app-lock-security-note">
        <div className="app-lock-security-icon"><ShieldCheck size={21} /></div>
        <div>
          <strong>{config.configured ? "قفل موحّد محفوظ على الخادم" : "لم يتم إعداد قفل مشترك بعد"}</strong>
          <span>
            {config.configured
              ? "كل أعضاء هذه المساحة يستخدمون طريقة الدخول نفسها: " + modeLabel(config.lock_type) + ". تغييرها يحدّث بوابة مساحة العمل لكل الأعضاء."
              : "بعد إعداد القفل، سيستخدمه كل أعضاء مساحة العمل عند فتح رابط المساحة. أول إعداد لا يحتاج القفل القديم."}
          </span>
        </div>
      </div>

      {config.configured && (
        <div className="app-lock-current-badge">
          <LockKeyhole size={16} /> طريقة الدخول الحالية: {modeLabel(config.lock_type)}
          {config.updated_at && <small> • آخر تغيير {new Intl.DateTimeFormat("ar-SY", { dateStyle: "medium" }).format(new Date(config.updated_at))}</small>}
        </div>
      )}

      {!isOwner ? (
        <div className="app-lock-credential-block">
          <strong>إعداد المالك فقط</strong>
          <p className="app-lock-footnote">أنت عضو في هذه المساحة. يستطيع مالك مساحة العمل تغيير القفل، وسينتقل الإعداد الجديد إلى جميع الأعضاء تلقائياً.</p>
        </div>
      ) : (
        <>
          {config.configured && (
            <div className="app-lock-credential-block">
              <WorkspaceLockInput
                type={config.lock_type}
                value={currentCredential}
                onChange={setCurrentCredential}
                label="القفل الحالي للمساحة"
              />
            </div>
          )}

          <div className="app-lock-option-heading">اختر طريقة الدخول المشتركة الجديدة</div>
          <div className="app-lock-options">
            {lockOptions.map(({ type, title, description, icon: Icon }) => (
              <button
                type="button"
                key={type}
                className={"app-lock-option " + (targetType === type ? "active" : "")}
                onClick={() => { setTargetType(type); setNewCredential(""); setConfirmCredential(""); }}
                aria-pressed={targetType === type}
              >
                <span className="app-lock-option-icon"><Icon size={19} /></span>
                <strong>{title}</strong>
                <small>{description}</small>
                {targetType === type && <Check className="app-lock-option-check" size={16} />}
              </button>
            ))}
          </div>

          <div className="app-lock-credential-grid">
            <WorkspaceLockInput key={"new-" + targetType} type={targetType} value={newCredential} onChange={setNewCredential} label="القفل المشترك الجديد" />
            <WorkspaceLockInput key={"confirm-" + targetType} type={targetType} value={confirmCredential} onChange={setConfirmCredential} label="أعد إدخاله للتأكيد" />
          </div>

          <button type="button" className="primary-btn full app-lock-save" onClick={() => void save()} disabled={busy}>
            {busy ? "جارٍ حفظ إعداد الخادم…" : config.configured ? "استبدال قفل المساحة للجميع" : "تفعيل القفل المشترك للجميع"}
            <Check size={17} />
          </button>
        </>
      )}

      <p className="app-lock-footnote">هذا قفل مشترك لمساحة العمل وليس كلمة مرور بريد أي عضو. القفل لا يُخزَّن كنص مكشوف، ومحاولات فتحه محدودة من الخادم.</p>
    </div>
  );
}
