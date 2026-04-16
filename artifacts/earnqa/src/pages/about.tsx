import { motion } from "framer-motion";
import { Link } from "wouter";

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="text-center">
    <p className="text-2xl font-extrabold text-[#1e3a5f]">{value}</p>
    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
  </div>
);

const FeatureRow = ({
  icon, title, body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) => (
  <div className="flex items-start gap-4">
    <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 mt-0.5">
      {icon}
    </div>
    <div>
      <p className="font-semibold text-foreground text-sm">{title}</p>
      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
    </div>
  </div>
);

export default function About() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
              <defs>
                <radialGradient id="about-coin-g" cx="38%" cy="30%" r="75%" fx="38%" fy="30%">
                  <stop offset="0%"   stopColor="#fef3c7"/>
                  <stop offset="42%"  stopColor="#fbbf24"/>
                  <stop offset="100%" stopColor="#d97706"/>
                </radialGradient>
                <radialGradient id="about-edge-g" cx="50%" cy="50%" r="50%">
                  <stop offset="80%"  stopColor="#d97706" stopOpacity="0"/>
                  <stop offset="100%" stopColor="#92400e" stopOpacity="0.5"/>
                </radialGradient>
              </defs>
              <circle cx="32" cy="32" r="30" fill="url(#about-coin-g)"/>
              <circle cx="32" cy="32" r="30" fill="url(#about-edge-g)"/>
              <circle cx="32" cy="32" r="30" fill="none" stroke="#b45309" strokeWidth="1.5" opacity="0.55"/>
              <circle cx="32" cy="32" r="18" fill="none" stroke="#1e3a5f" strokeWidth="7"/>
              <circle cx="32" cy="32" r="18" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.25"/>
              <path d="M 18 20 A 17 17 0 0 1 34 14" stroke="white" strokeWidth="3.5" fill="none" opacity="0.45" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">About Opinoza</h1>
          <p className="text-muted-foreground mt-3 leading-relaxed max-w-md mx-auto">
            A reward-based Q&amp;A platform where your opinions have real value. Answer questions, earn money, and help shape a smarter community.
          </p>
        </div>

        {/* Stats */}
        <div className="bg-card border border-card-border rounded-2xl p-6 mb-6 shadow-sm">
          <div className="grid grid-cols-3 divide-x divide-border">
            <Stat value="44+" label="Questions" />
            <Stat value="1¢" label="Per answer" />
            <Stat value="0.5¢" label="Creator reward" />
          </div>
        </div>

        {/* Mission */}
        <div className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
          <h2 className="text-lg font-bold text-foreground mb-3">Our Mission</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Opinoza believes that everyday opinions are valuable. We built a platform that rewards people for sharing honest, thoughtful answers — turning casual participation into real earnings.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            Whether you're answering questions to build your balance or creating questions to gather insights from the community, Opinoza gives everyone a stake in the conversation.
          </p>
        </div>

        {/* How it works */}
        <div className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 mb-6 shadow-sm">
          <h2 className="text-lg font-bold text-foreground mb-5">How It Works</h2>
          <div className="space-y-5">
            <FeatureRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 46%)" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>}
              title="Answer & Earn"
              body="Browse the question feed and submit your answer on any question. You earn 1¢ credited instantly to your wallet for every valid answer."
            />
            <FeatureRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="hsl(43 96% 46%)"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>}
              title="Create Questions"
              body="Have a question you want the community to answer? Submit a custom question for 10¢. You'll earn 0.5¢ creator reward for every answer it receives after approval."
            />
            <FeatureRow
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 46%)" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>}
              title="Withdraw Earnings"
              body="Once your balance reaches $10 (1000¢), you can request a withdrawal via PayPal, bank transfer, or gift card. Requests are processed within 2–3 business days."
            />
          </div>
        </div>

        {/* CTA */}
        <div className="navy-gradient-deep rounded-2xl p-7 text-center text-white shadow-xl">
          <p className="font-bold text-lg mb-1">Ready to start earning?</p>
          <p className="text-sm opacity-80 mb-5">Join thousands of users sharing opinions and getting paid for it.</p>
          <div className="flex justify-center gap-3">
            <Link href="/sign-up">
              <button className="px-5 py-2.5 rounded-xl gold-gradient text-white font-semibold text-sm shadow hover:opacity-90 transition-opacity">
                Join Free
              </button>
            </Link>
            <Link href="/questions">
              <button className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-semibold text-sm hover:bg-white/20 transition-colors">
                Browse Questions
              </button>
            </Link>
          </div>
        </div>

      </motion.div>
    </div>
  );
}
