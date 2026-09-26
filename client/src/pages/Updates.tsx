import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, CheckCircle2, ExternalLink, GitCommitHorizontal, Github, Loader2, RefreshCw, Tag, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

type Commit = { sha: string; html_url: string; commit: { message: string; author?: { name?: string; date?: string } } };
type Release = { id: number; name?: string; tag_name: string; html_url: string; published_at?: string; body?: string; prerelease?: boolean; draft?: boolean };

const repo = "mhamedshasho/aleppo-center-cash";
const api = "https://api.github.com/repos/" + repo;

const dateText = (value?: string) => value ? new Intl.DateTimeFormat("ar-SY", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "غير معروف";
const cleanMessage = (message: string) => message.split("\n")[0].trim();

export default function Updates({ onBack }: { onBack: () => void }) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [commitResponse, releaseResponse] = await Promise.all([
        fetch(api + "/commits?per_page=15"),
        fetch(api + "/releases?per_page=8"),
      ]);
      if (!commitResponse.ok) throw new Error("GitHub commits: " + commitResponse.status);
      if (!releaseResponse.ok) throw new Error("GitHub releases: " + releaseResponse.status);
      const commitData = await commitResponse.json();
      const releaseData = await releaseResponse.json();
      setCommits(commitData);
      setReleases(releaseData);
    } catch (e) {
      console.error(e);
      setError("تعذر جلب آخر التحديثات من GitHub حالياً.");
      toast.error("تعذر الاتصال بـ GitHub");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  return <main className="updates-page page-enter" dir="rtl">
    <header className="updates-header">
      <div>
        <button className="text-btn" onClick={onBack}>رجوع</button>
        <div className="eyebrow">ALEPPO CENTER CASH <span>•</span> GITHUB UPDATES</div>
        <h1>آخر التحديثات</h1>
        <p>التحديثات تُقرأ مباشرة من مستودع Aleppo Center Cash على GitHub.</p>
      </div>
      <div className="updates-actions"><a className="secondary-btn" href={"https://github.com/" + repo} target="_blank" rel="noreferrer"><Github size={17} /> GitHub <ExternalLink size={13} /></a><button className="icon-btn bordered" onClick={() => void load()} disabled={loading} aria-label="تحديث">{loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}</button></div>
    </header>
    {loading ? <div className="updates-loading surface-card"><Loader2 className="spin" size={25} /><strong>عم نجيب آخر التحديثات من GitHub…</strong></div> : error ? <div className="updates-error surface-card"><TriangleAlert size={24} /><strong>{error}</strong><button className="secondary-btn" onClick={() => void load()}>إعادة المحاولة</button></div> : <div className="updates-grid">
      <section className="surface-card updates-releases"><div className="section-head"><div><h2>الإصدارات</h2><p>Releases المنشورة على GitHub</p></div><Tag size={19} /></div>{releases.length ? releases.map((release) => <article className="release-card" key={release.id}><div className="release-icon"><Tag size={17} /></div><div><div className="release-title"><h3>{release.name || release.tag_name}</h3><span>{release.tag_name}</span></div><p>{release.body ? release.body.slice(0, 280) : "لا يوجد وصف للإصدار."}</p><small><CalendarDays size={13} /> {dateText(release.published_at)} {release.prerelease ? "• تجريبي" : ""}</small></div><a href={release.html_url} target="_blank" rel="noreferrer" aria-label="فتح الإصدار"><ArrowUpRight size={17} /></a></article>) : <div className="updates-empty"><Tag size={22} /><strong>لا توجد Releases منشورة بعد</strong><span>نعرض بدلاً منها سجل الـ commits في الأسفل.</span></div>}</section>
      <section className="surface-card updates-commits"><div className="section-head"><div><h2>سجل التحديثات</h2><p>آخر commits من المستودع</p></div><GitCommitHorizontal size={19} /></div><div className="commit-list">{commits.map((commit) => <a className="commit-card" href={commit.html_url} target="_blank" rel="noreferrer" key={commit.sha}><div className="commit-icon"><GitCommitHorizontal size={16} /></div><div><strong>{cleanMessage(commit.commit.message)}</strong><small><span>{commit.commit.author?.name || "GitHub"}</span><i>•</i>{dateText(commit.commit.author?.date)}</small></div><code>{commit.sha.slice(0, 7)}</code></a>)}</div></section>
    </div>}
    <footer className="updates-footer"><CheckCircle2 size={16} /><span>المصدر: GitHub — {repo}</span><a href={"https://github.com/" + repo + "/commits/main"} target="_blank" rel="noreferrer">فتح سجل commits <ExternalLink size={13} /></a></footer>
  </main>;
}
