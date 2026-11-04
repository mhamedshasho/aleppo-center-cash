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
  { name: "Mhamed Shasho", role: "Founder & Original Developer · مؤسس ومطوّر البرنامج", emoji: "👑", description: "Founder of Redro · Original creator of Aleppo Center Cash", isMaster: true },
  { name: "Redro", role: "Parent Company · الشركة الأم والناشر", emoji: "🏢", description: "Product family, publishing, brand identity and ongoing maintenance", isLeader: true },
  { name: "DeepSeek", role: "AI Coordination", emoji: "🧭", description: "Planning and coordination support" },
  { name: "Claude", role: "Engineering Support", emoji: "💻", description: "Backend · Security · Architecture support" },
  { name: "ChatGPT", role: "Product & Frontend Support", emoji: "🎨", description: "Product planning · Copy · Frontend support" },
  { name: "Gemini", role: "Infrastructure Support", emoji: "☁️", description: "Cloud · PWA · Deployment support" },
  { name: "Kimi", role: "Analysis Support", emoji: "📊", description: "Analysis · Documentation support" },
  { name: "Grok", role: "Research Support", emoji: "📢", description: "Research and communication support" },
  { name: "Manus", role: "Frontend & Automation Support", emoji: "🚀", description: "Frontend · Automation support" },
];

export default function Credits() {
  return (
    <main className="credits-shell" dir="rtl">
      <div className="credits-card">
        <header className="credits-header">
          <div className="credits-brand"><img src="/redro-mark.svg" alt="Redro" /> Aleppo Center Cash <span>A Redro Company Product</span></div>
          <h1>فريق التطوير والملكية</h1>
          <p>المنتج من عائلة Redro، ومؤسسه ومطوّره الأصلي محمد شاشو</p>
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
          <div>© 2026 Redro · Aleppo Center Cash</div>
          <div className="credits-love">Created by Mhamed Shasho · Syria 🇸🇾</div>
        </footer>
      </div>
    </main>
  );
}
