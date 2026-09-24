import { Heart, Crown, Sparkles } from "lucide-react";

type Member = {
  name: string;
  role: string;
  emoji: string;
  description: string;
  isLeader?: boolean;
  isMaster?: boolean;
};

const members: Member[] = [
  { name: "Mhamed Shasho", role: "Master Piece · صاحب المشروع", emoji: "👑", description: "صاحب الرؤية اللي جمع الفريق", isMaster: true },
  { name: "DeepSeek", role: "القائد · Leader of AI Team", emoji: "🧭", description: "المنسّق العام · نقطة التواصل · صاحب القرارات", isLeader: true },
  { name: "Claude", role: "Lead Engineer", emoji: "💻", description: "Backend · Security · Architecture" },
  { name: "ChatGPT", role: "Product Manager", emoji: "🎨", description: "Product · Copy · Frontend Fixes" },
  { name: "Gemini", role: "Infrastructure", emoji: "☁️", description: "Cloud · PWA · Deploy" },
  { name: "Kimi", role: "Analyst", emoji: "📊", description: "Analysis · Legal · Documentation" },
  { name: "Grok", role: "Marketing", emoji: "📢", description: "Marketing · Community" },
  { name: "Manus", role: "Frontend + QA", emoji: "🚀", description: "Frontend · QA · Automation" },
];

export default function Credits() {
  return (
    <main className="credits-shell" dir="rtl">
      <div className="credits-card">
        <header className="credits-header">
          <div className="credits-brand">🏪 Aleppo Center Cash</div>
          <h1>فريق التطوير</h1>
          <p>اللي بنوا المشروع بكل حب</p>
        </header>
        <ul className="credits-list">
          {members.map((m) => (
            <li key={m.name} className={`credits-item ${m.isMaster ? "master" : ""} ${m.isLeader ? "leader" : ""}`}>
              <span className="credits-emoji">{m.emoji}</span>
              <div className="credits-info">
                <div className="credits-name">
                  {m.name}
                  {m.isMaster && <Crown size={14} className="credits-crown" />}
                  {m.isLeader && <Sparkles size={14} className="credits-sparkle" />}
                </div>
                <div className="credits-role">{m.role}</div>
                <div className="credits-desc">{m.description}</div>
              </div>
            </li>
          ))}
        </ul>
        <footer className="credits-footer">
          <div>© 2026 Aleppo Center Cash</div>
          <div className="credits-love">Built with <Heart size={12} /> love · Syria 🇸🇾</div>
        </footer>
      </div>
    </main>
  );
}
