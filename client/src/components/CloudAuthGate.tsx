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

function getAuthErrorMessage(error: unknown, mode: Mode) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("email rate limit exceeded") ||
    normalized.includes("rate limit exceeded") ||
    normalized.includes("over_email_send_rate_limit")
  ) {
    return mode === "signup"
      ? "تم تجاوز حد إرسال رسائل البريد مؤقتاً. لا تعيد المحاولة الآن؛ انتظر قليلاً ثم جرّب مرة واحدة."
      : "تم تجاوز حد إرسال رسائل البريد مؤقتاً. انتظر قليلاً ثم جرّب مرة أخرى.";
  }

  if (normalized.includes("user already registered")) {
    return "هذا البريد مسجّل مسبقاً. جرّب تسجيل الدخول بدل إنشاء حساب جديد.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "البريد أو كلمة المرور غير صحيحة.";
  }

  if (normalized.includes("email not confirmed")) {
    return "البريد غير مؤكّد بعد. افتح رسالة التأكيد من Supabase ثم جرّب تسجيل الدخول.";
  }

  if (normalized.includes("password should be at least")) {
    return "كلمة المرور قصيرة. استخدم ٨ محارف أو أكثر.";
  }

  return raw || (mode === "signup" ? "تعذر إنشاء الحساب حالياً." : "تعذر تسجيل الدخول حالياً.");
}
type WorkspaceState = { id: string; name: string; role: "owner" | "member" } | null;

export default function CloudAuthGate() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSupabaseSession>>>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Aleppo Center Cash");
  const [workspaceId, setWorkspaceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [signupCooldownUntil, setSignupCooldownUntil] = useState(0);

  useEffect(() => {
    if (mode !== "signup") return;
    const stored = Number(localStorage.getItem("aleppo-center-signup-cooldown") ?? "0");
    if (stored <= Date.now()) {
      localStorage.removeItem("aleppo-center-signup-cooldown");
      return;
    }
    setSignupCooldownUntil(stored);
    const timer = window.setInterval(() => {
      const remaining = Number(localStorage.getItem("aleppo-center-signup-cooldown") ?? "0");
      if (remaining <= Date.now()) {
        localStorage.removeItem("aleppo-center-signup-cooldown");
        setSignupCooldownUntil(0);
        window.clearInterval(timer);
      } else {
        setSignupCooldownUntil(remaining);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

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
      setWorkspaceLoading(false);
      return;
    }

    let active = true;
    setWorkspace(null);
    setWorkspaceLoading(true);

    const loadWorkspace = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase
          .from("workspace_members")
          .select("workspace_id, role, workspaces(name)")
          .eq("user_id", session.user.id)
          .eq("active", true)
          .order("joined_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!active) return;

        if (!error) {
          const workspaceRow = Array.isArray(data?.workspaces) ? data?.workspaces[0] : data?.workspaces;
          const nextWorkspace = data
            ? { id: data.workspace_id, role: data.role, name: workspaceRow?.name ?? "مركز حلب" }
            : null;
          setWorkspace(nextWorkspace);
                    setWorkspaceLoading(false);
          return;
        }

        if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 400));
      }

      if (active) {
        setWorkspace(null);
                setWorkspaceLoading(false);
        toast.error("تعذر التحقق من مساحة العمل. لم نفتح بيانات محلية قديمة.");
      }
    };

    void loadWorkspace();
    return () => {
      active = false;
    };
  }, [session]);

  const submitAuth = async () => {
    const cleanEmail = normalizeEmail(email);

    if (mode === "signup" && signupCooldownUntil > Date.now()) {
      const seconds = Math.max(1, Math.ceil((signupCooldownUntil - Date.now()) / 1000));
      toast.info(`تم طلب رسالة تأكيد. انتظر ${seconds} ثانية فقط ولا تعيد الإرسال قبلها.`);
      return;
    }
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
        const cooldown = Date.now() + 60 * 1000;
        localStorage.setItem("aleppo-center-signup-cooldown", String(cooldown));
        setSignupCooldownUntil(cooldown);
        toast.success("تم إنشاء الحساب. افتح رسالة التأكيد مرة واحدة، وبعدها فوت.");
      } else {
        toast.success(mode === "login" ? "أهلا فيك" : "انعمل الحساب بنجاح");
      }
      setPassword("");
    } catch (error) {
      if (mode === "signup") {
        const raw = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
        if (raw.includes("email rate limit exceeded") || raw.includes("rate limit exceeded") || raw.includes("over_email_send_rate_limit")) {
          const cooldown = Date.now() + 60 * 1000;
          localStorage.setItem("aleppo-center-signup-cooldown", String(cooldown));
          setSignupCooldownUntil(cooldown);
        }
      }
      toast.error(getAuthErrorMessage(error, mode));
    } finally {
      setBusy(false);
    }
  };

  const createWorkspace = async () => {
    if (!supabase || !workspaceName.trim() || !session) return;
    setBusy(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, workspaces(name)")
        .eq("user_id", session.user.id)
        .eq("active", true)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) {
        const existingWorkspace = Array.isArray(existing.workspaces) ? existing.workspaces[0] : existing.workspaces;
        const existingWorkspaceState = {
          id: existing.workspace_id,
          name: existingWorkspace?.name ?? "مركز حلب",
          role: existing.role,
        } as WorkspaceState;
        setWorkspace(existingWorkspaceState);
        setWorkspaceCache(session.user.id, existingWorkspaceState);
        toast.info("عندك مساحة عمل موجودة، فتحناها بدل إنشاء مساحة جديدة");
        return;
      }

      const { data, error } = await supabase.rpc("create_workspace", {
        workspace_name: workspaceName.trim(),
        display_name: displayName.trim(),
      });
      if (error) throw error;
      const createdWorkspace = { id: data, name: workspaceName.trim(), role: "owner" } as WorkspaceState;
      toast.success("انعملت مساحة المحل");
      setWorkspace(createdWorkspace);
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
      const joinedWorkspace = { id: workspaceId.trim(), name: data?.name ?? "مركز حلب", role: "member" } as WorkspaceState;
      toast.success("انضمّيت لمساحة المحل");
      setWorkspace(joinedWorkspace);
          } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الانضمام. تأكد من Workspace ID");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="cloud-loading"><Loader2 className="spin" size={22} /> عم نجهّز الدخول…</div>;
  if (!isSupabaseConfigured || !supabase) return <main className="cloud-loading"><strong>Cloud Only</strong><span>الاتصال بـ Supabase غير مهيأ. الوضع المحلي غير متاح.</span></main>;
  if (session && workspace) return <Home cloudUser={session.user} cloudWorkspace={workspace} />;
  if (session && workspaceLoading) return <div className="cloud-loading"><Loader2 className="spin" size={22} /> عم نتحقق من مساحة المحل…</div>;

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
        <button className="primary-btn full" disabled={busy || (mode === "signup" && signupCooldownUntil > Date.now())} onClick={() => void submitAuth()}>{busy ? <Loader2 className="spin" size={17} /> : mode === "login" ? <LogIn size={17} /> : <UserPlus size={17} />}{mode === "login" ? "فوت على الحساب" : signupCooldownUntil > Date.now() ? `انتظر ${Math.ceil((signupCooldownUntil - Date.now()) / 1000)}ث` : "إنشاء حساب"}<ArrowLeft size={17} /></button>
        <div className="privacy-note"><KeyRound size={16} /> TLS وحماية صلاحيات — مو E2EE</div>
      </section>
      <footer className="login-footer">Aleppo Center Cash <span>© 2026</span></footer>
    </main>
  );
}
