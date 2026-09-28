import { useState } from "react";
import { Building2, Check, ChevronLeft, Loader2, Plus, Trash2, X } from "lucide-react";

export type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "member";
};

type Props = {
  currentWorkspaceId?: string | null;
  workspaces: WorkspaceOption[];
  onSwitch: (workspace: WorkspaceOption) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
};

export default function WorkspaceManager({ currentWorkspaceId, workspaces, onSwitch, onCreate, onDelete, onClose }: Props) {
  const [name, setName] = useState("");
  const [busyAction, setBusyAction] = useState<"create" | "delete" | string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canCreate = workspaces.length < 2;
  const current = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
  const create = async () => {
    const clean = name.trim();
    if (!clean || !canCreate || busyAction) return;
    setBusyAction("create");
    try {
      await onCreate(clean);
      setName("");
    } finally {
      setBusyAction(null);
    }
  };
  const remove = async () => {
    if (!current || current.role !== "owner" || busyAction) return;
    setBusyAction("delete");
    try {
      await onDelete();
    } finally {
      setBusyAction(null);
      setConfirmDelete(false);
    }
  };
  return (
    <div className="workspace-manager-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busyAction && onClose()}>
      <section className="workspace-manager" dir="rtl">
        <header className="workspace-manager-head">
          <div className="workspace-manager-title">
            <div className="workspace-manager-icon"><Building2 size={20} /></div>
            <div><span>WORKSPACES</span><h2>مساحات العمل</h2><p>اختار مساحة، أنشئ واحدة جديدة أو احذف الحالية.</p></div>
          </div>
          <button className="icon-btn bordered" onClick={onClose} disabled={Boolean(busyAction)} aria-label="إغلاق"><X size={18} /></button>
        </header>
        <div className="workspace-limit"><span>المساحات المستخدمة</span><strong>{workspaces.length} / 2</strong></div>
        <div className="workspace-list">
          {workspaces.map((workspace) => {
            const active = workspace.id === currentWorkspaceId;
            const switching = busyAction === workspace.id;
            return (
              <button key={workspace.id} className={"workspace-option " + (active ? "active" : "")} onClick={() => { if (!active && !busyAction) { setBusyAction(workspace.id); onSwitch(workspace).finally(() => setBusyAction(null)); } }} disabled={Boolean(busyAction)}>
                <div className="workspace-option-avatar"><Building2 size={17} /></div>
                <div className="workspace-option-copy"><strong>{workspace.name}</strong><span dir="ltr">{workspace.slug}</span></div>
                <span className={"workspace-role " + workspace.role}>{workspace.role === "owner" ? "مالك" : "عضو"}</span>
                {active ? <span className="workspace-current"><Check size={15} /> الحالية</span> : switching ? <Loader2 size={16} className="spin" /> : <ChevronLeft size={17} />}
              </button>
            );
          })}
        </div>
        {canCreate ? (
          <div className="workspace-create">
            <div className="workspace-create-label"><Plus size={16} /><strong>إنشاء مساحة جديدة</strong><span>متبقي مساحة واحدة</span></div>
            <div className="workspace-create-row">
              <input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} placeholder="مثلاً: فرع حلب الثاني" maxLength={120} disabled={Boolean(busyAction)} />
              <button className="primary-btn" onClick={() => void create()} disabled={!name.trim() || Boolean(busyAction)}>{busyAction === "create" ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} إنشاء</button>
            </div>
          </div>
        ) : (
          <div className="workspace-limit-reached"><Check size={16} /><span>وصلت للحد الأقصى: لا يمكن إنشاء أكثر من مساحتين.</span></div>
        )}
        {current?.role === "owner" && (
          <div className="workspace-delete-zone">
            {!confirmDelete ? (
              <button className="workspace-delete-button" onClick={() => setConfirmDelete(true)} disabled={Boolean(busyAction)}><Trash2 size={16} /> حذف مساحة العمل الحالية</button>
            ) : (
              <div className="workspace-delete-confirm"><div><strong>حذف {current.name}؟</strong><span>سيتم حذف الحسابات والدفعات التابعة لها نهائياً.</span></div><div><button className="secondary-btn" onClick={() => setConfirmDelete(false)} disabled={Boolean(busyAction)}>إلغاء</button><button className="danger-btn" onClick={() => void remove()} disabled={Boolean(busyAction)}>{busyAction === "delete" ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />} حذف نهائياً</button></div></div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
