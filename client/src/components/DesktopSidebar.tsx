import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  GitBranch,
  Heart,
  Home as HomeIcon,
  Landmark,
  LogOut,
  Moon,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  WalletCards,
  Settings,
} from "lucide-react";

type View = "dashboard" | "accounts" | "account" | "activity" | "invoice" | "manual" | "updates" | "settings";

const items: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "نظرة عامة", icon: HomeIcon },
  { id: "accounts", label: "الحسابات", icon: WalletCards },
  { id: "activity", label: "التعديلات", icon: Activity },
  { id: "invoice", label: "صانع الفواتير", icon: FileText },
  { id: "manual", label: "دليل الاستخدام", icon: BookOpen },
  { id: "updates", label: "التحديثات", icon: GitBranch },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

type Props = {
  view: View;
  accountsCount: number;
  workspaceName?: string | null;
  workspaceId?: string | null;
  email?: string | null;
  theme: "light" | "dark" | "gold" | "red";
  onNavigate: (view: View) => void;
  onToggleTheme: () => void;
  onOpenWorkspaceManager: () => void;
  onBackup: () => void;
  onExportFile: () => void;
  onCredits: () => void;
  onCopyWorkspace: () => void;
  onDeleteWorkspace: () => void;
  onDeleteAccount: () => void;
  onLogout: () => void;
};

export default function DesktopSidebar({
  view,
  accountsCount,
  workspaceName,
  workspaceId,
  email,
  theme,
  onNavigate,
  onToggleTheme,
  onOpenWorkspaceManager,
  onBackup,
  onExportFile,
  onCredits,
  onCopyWorkspace,
  onDeleteWorkspace,
  onDeleteAccount,
  onLogout,
}: Props) {
  return (
    <aside className="desktop-sidebar" dir="rtl">
      <div className="desktop-brand">
        <div className="desktop-brand-logo"><img src="/icon.svg" alt="Aleppo Center Cash" /></div>
        <div><strong>Aleppo Center</strong><span>CASH BOOK</span></div>
      </div>

      <button className="desktop-workspace" onClick={onOpenWorkspaceManager} title="إدارة مساحات العمل">
        <div className="workspace-avatar">AC</div>
        <div className="desktop-workspace-copy">
          <span>المساحة الحالية</span>
          <strong>{workspaceName ?? "مركز حلب"}</strong>
          <small dir="ltr">{workspaceId ? workspaceId.slice(0, 12) + "…" : "—"}</small>
        </div>
        <ChevronDown size={15} />
      </button>

      <div className="desktop-nav-label">التنقّل</div>
      <nav className="desktop-nav">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={view === id || (id === "accounts" && view === "account") ? "active" : ""}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
            {id === "accounts" && accountsCount > 0 && <b>{accountsCount}</b>}
          </button>
        ))}
      </nav>

      <div className="desktop-sidebar-spacer" />

      <div className="desktop-cloud-status">
        <ShieldCheck size={16} />
        <div><strong>سحابي وآمن</strong><span>Supabase</span></div>
        <Check size={15} />
      </div>

      <div className="desktop-profile">
        <div className="profile-avatar">{email?.[0]?.toUpperCase() ?? "م"}</div>
        <div className="desktop-profile-copy">
          <strong>{workspaceName ?? "مركز حلب"}</strong>
          <span>{email ?? "حساب المالك"}</span>
        </div>
        <MoreHorizontal size={16} />
      </div>

      <div className="desktop-quick-actions">
        <button onClick={onToggleTheme} title={theme === "dark" ? "الوضع الفاتح" : theme === "gold" ? "الوضع الذهبي" : theme === "red" ? "الثيم الأحمر" : "الوضع الداكن"}>
          {theme === "dark" ? <Sun size={16} /> : theme === "gold" ? <Sparkles size={16} /> : theme === "red" ? <Heart size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={onBackup} title="النسخ والاستعادة"><ShieldCheck size={16} /></button>
        <button onClick={onCopyWorkspace} title="نسخ Workspace ID"><Copy size={16} /></button>
        <button onClick={onExportFile} title="ملف استعادة JSON"><Download size={16} /></button>
      </div>

      <div className="desktop-danger-actions">
        <button onClick={onCredits}><Heart size={14} /> فريق التطوير</button>
        <button onClick={onDeleteWorkspace}><Trash2 size={14} /> حذف مساحة العمل</button>
        <button onClick={onDeleteAccount}><LogOut size={14} /> مسح الجهاز والخروج</button>
        <button onClick={onLogout}><LogOut size={14} /> تسجيل الخروج</button>
      </div>
    </aside>
  );
}
