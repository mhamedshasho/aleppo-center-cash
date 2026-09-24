import { useEffect, useState } from "react";
import { ArrowLeft, Building2, KeyRound, Loader2, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import Home from "@/pages/Home";
import { isValidEmail, normalizeEmail } from "@/lib/validation";
import {
  getSupabaseSession,
  isSupabaseConfigured,
  signInWithPassword,
  signUpWithPassword,
  supabase,
} from "@/lib/supabase";

type Mode = "login" | "signup";
type WorkspaceState = { id: string; name: string; role: "owner" | "member" } | null;

export default function CloudAuthGate() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSupabaseSession>>>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Aleppo Center Cash");
  const [workspaceId, setWorkspaceId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setLoading(false);
      return;
    }
    void getSupabaseSession().then((current) => {
      if (active) {
        setSession(current);
        setLoading(false);
      }
    }).catch(() => {
      if (active) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || !supabase) {
      setWorkspace(null);
      return;
    }
    let active = true;
    void supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces(name)")
      .eq("user_id", session.user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          toast.error("تعذر قراءة مساحة العمل");
          return;
        }
        const workspaceRow = Array.isArray(data?.workspaces) ? data?.workspaces[0] : data?.workspaces;
        setWorkspace(data ? { id: data.workspace_id, role: data.role, name: workspaceRow?.name ?? "مركز حلب" } : null);
      });
    return () => { active = false; };
  }, [session]);

  const submitAuth = async () => {
    const cleanEmail = normalizeEmail(email);
    if (!isValidEmail(cleanEmail)) {
      toast.error("اكتب بريد إلكتروني صحيح");
      return;
    }
    if (password.length < 8) {
      toast.error("كلمة المرور لازم تكون ٨ محارف أو أكتر");
      return;
    }
    setEmail(cleanEmail);
    setBusy(true);
    try {
      const result = mode === "login"
        ? await signInWithPassword(cleanEmail, password)
        : await signUpWithPassword(cleanEmail, password);
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        toast.success("تم إنشاء الحساب. إذا طلب Supabase تأكيد البريد، أكّده وبعدين فوت");
      } else {
        toast.success(mode === "login" ? "أهلا فيك" : "انعمل الحساب بنجاح");
      }
      setPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إتمام العملية");
    } finally {
      setBusy(false);
    }
  };

  const createWorkspace = async () => {
    if (!supabase || !workspaceName.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_workspace", {
        workspace_name: workspaceName.trim(),
        display_name: displayName.trim(),
      });
      if (error) throw error;
      toast.success("انعملت مساحة المحل");
      setWorkspace({ id: data, name: workspaceName.trim(), role: "owner" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء مساحة العمل");
    } finally {
      setBusy(false);
    }
  };

  const joinWorkspace = async () => {
    if (!supabase || !workspaceId.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("join_workspace", { target_workspace: workspaceId.trim() });
      if (error) throw error;
      toast.success("انضمّيت لمساحة المحل");
      setWorkspace({ id: workspaceId.trim(), name: data?.name ?? "مركز حلب", role: "member" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الانضمام. تأكد من Workspace ID");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="cloud-loading"><Loader2 className="spin" size={22} /> عم نجهّز الدخول…</div>;
  if (!isSupabaseConfigured || !supabase) return <Home />;
  if (session && workspace) return <Home cloudUser={session.user} cloudWorkspace={workspace} />;

  if (session && !workspace) {
    return (
      <main className="login-shell" dir="rtl">
        <section className="login-card onboarding-card">
          <div className="brand-mark large"><Building2 size={30} strokeWidth={1.8} /></div>
          <div className="eyebrow">ALEPPO CENTER CASH <span>•</span> WORKSPACE</div>
          <h1>خلّينا نجهّز<br /><em>مساحة المحل.</em></h1>
          <p className="login-copy">حسابك جاهز. اختار إذا أنت صاحب المحل أو شريك وادخل على نفس البيانات.</p>
          <label className="field-label" htmlFor="display-name">اسمك</label>
          <div className="key-input-wrap"><input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="مثلاً: أبو محمد" /></div>
          <label className="field-label" htmlFor="workspace-name">اسم المحل — للمالك</label>
          <div className="key-input-wrap"><input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Aleppo Center Cash" /></div>
          <button className="primary-btn full" disabled={busy} onClick={() => void createWorkspace()}><Building2 size={17} /> إنشاء مساحة للمالك <ArrowLeft size={17} /></button>
          <div className="login-divider"><span>أو انضم كشريك</span></div>
          <label className="field-label" htmlFor="workspace-id">Workspace ID</label>
          <div className="key-input-wrap"><input id="workspace-id" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} placeholder="الصقه هون" dir="ltr" /></div>
          <button className="secondary-btn full" disabled={busy} onClick={() => void joinWorkspace()}><UserPlus size={17} /> انضم لمساحة موجودة</button>
          <button className="text-btn auth-signout" onClick={() => { if (supabase) void supabase.auth.signOut(); }}>مو أنت؟ سجّل خروج</button>
        </section>
      </main>
    );
  }

  return (
    <main className="login-shell" dir="rtl">
      <div className="login-ambient ambient-one" /><div className="login-ambient ambient-two" />
      <section className="login-card">
        <div className="brand-mark large"><KeyRound size={30} strokeWidth={1.8} /></div>
        <div className="eyebrow">ALEPPO CENTER CASH <span>•</span> SHARED SPACE</div>
        <h1>حساباتكم،<br /><em>بنفس الصفحة.</em></h1>
        <p className="login-copy">دخول آمن لصاحب المحل وشريكه، مع نفس الحسابات وتحديثات مباشرة.</p>
        <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}><LogIn size={15} /> تسجيل الدخول</button><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}><UserPlus size={15} /> حساب جديد</button></div>
        <label className="field-label" htmlFor="auth-email">البريد الإلكتروني</label>
        <div className="key-input-wrap"><input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" dir="ltr" autoComplete="email" /></div>
        <label className="field-label" htmlFor="auth-password">كلمة المرور</label>
        <div className="key-input-wrap"><input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitAuth(); }} placeholder="٨ محارف أو أكتر" dir="ltr" autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
        <button className="primary-btn full" disabled={busy} onClick={() => void submitAuth()}>{busy ? <Loader2 className="spin" size={17} /> : mode === "login" ? <LogIn size={17} /> : <UserPlus size={17} />}{mode === "login" ? "فوت على الحساب" : "إنشاء حساب"}<ArrowLeft size={17} /></button>
        <div className="privacy-note"><KeyRound size={16} /> TLS وحماية صلاحيات — مو E2EE</div>
      </section>
      <footer className="login-footer">Aleppo Center Cash <span>© 2026</span></footer>
    </main>
  );
}
