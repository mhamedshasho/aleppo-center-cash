import { getDirection, t, useLanguage } from "@/contexts/LanguageContext";
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
    useLanguage();
  return (
    <aside className="desktop-sidebar" dir={getDirection()}>
      <div className="desktop-brand">
        <div className="desktop-brand-logo"><img src="/grok_1790774221995.jpg" alt="Aleppo Center Cash" /></div>
        <div><strong>Aleppo Center</strong><span>CASH BOOK</span></div>
      </div>

      <button className="desktop-workspace" onClick={onOpenWorkspaceManager} title={t("إدارة مساحات العمل")}>
        <div className="workspace-avatar">AC</div>
        <div className="desktop-workspace-copy">
          <span>{t("المساحة الحالية")}</span>
          <strong>{workspaceName ?? t("مركز حلب")}</strong>
          <small dir="ltr">{workspaceId ? workspaceId.slice(0, 12) + "…" : "—"}</small>
        </div>
        <ChevronDown size={15} />
      </button>

      <div className="desktop-nav-label">{t("التنقّل")}</div>
      <nav className="desktop-nav">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={view === id || (id === "accounts" && view === "account") ? "active" : ""}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} />
            <span>{t(label)}</span>
            {id === "accounts" && accountsCount > 0 && <b>{accountsCount}</b>}
          </button>
        ))}
      </nav>

      <div className="desktop-sidebar-spacer" />

      <div className="desktop-cloud-status">
        <ShieldCheck size={16} />
        <div><strong>{t("سحابي وآمن")}</strong><span>Supabase</span></div>
        <Check size={15} />
      </div>

      <div className="desktop-profile">
        <div className="profile-avatar">{email?.[0]?.toUpperCase() ?? t("م")}</div>
        <div className="desktop-profile-copy">
          <strong>{workspaceName ?? t("مركز حلب")}</strong>
          <span>{email ?? t("حساب المالك")}</span>
        </div>
        <MoreHorizontal size={16} />
      </div>

      <div className="desktop-quick-actions">
        <button onClick={onToggleTheme} title={theme === "dark" ? t("الوضع الفاتح") : theme === "gold" ? t("الوضع الذهبي") : theme === "red" ? t("الثيم الأحمر") : t("الوضع الداكن")}>
          {theme === "dark" ? <Sun size={16} /> : theme === "gold" ? <Sparkles size={16} /> : theme === "red" ? <Heart size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={onBackup} title={t("النسخ والاستعادة")}><ShieldCheck size={16} /></button>
        <button onClick={onCopyWorkspace} title={t("نسخ Workspace ID")}><Copy size={16} /></button>
        <button onClick={onExportFile} title={t("ملف استعادة JSON")}><Download size={16} /></button>
      </div>

      <div className="desktop-danger-actions">
        <button onClick={onCredits}><Heart size={14} /> {t("فريق التطوير")}</button>
        <button onClick={onDeleteWorkspace}><Trash2 size={14} /> {t("حذف مساحة العمل")}</button>
        <button onClick={onDeleteAccount}><LogOut size={14} /> {t("مسح الجهاز والخروج")}</button>
        <button onClick={onLogout}><LogOut size={14} /> {t("تسجيل الخروج")}</button>
      </div>
    </aside>
  );
}
