import { motion } from "framer-motion";

const ContactCard = ({
  icon, title, body,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) => (
  <div className="bg-card border border-card-border rounded-2xl p-6 flex items-start gap-4 shadow-sm">
    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div>
      <p className="font-semibold text-foreground mb-1">{title}</p>
      <div className="text-sm text-muted-foreground leading-relaxed">{body}</div>
    </div>
  </div>
);

export default function Contact() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Contact Us</h1>
          <p className="text-muted-foreground mt-2">We're here to help. Reach out any time.</p>
        </div>

        <div className="space-y-4">
          <ContactCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 46%)" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            }
            title="Email Support"
            body={
              <p>
                Send us an email at{" "}
                <a
                  href="mailto:support.opinoza@gmail.com"
                  className="text-amber-600 font-semibold hover:text-amber-700 transition-colors underline underline-offset-2"
                >
                  support.opinoza@gmail.com
                </a>
                {" "}and we'll get back to you as soon as possible.
              </p>
            }
          />

          <ContactCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 46%)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4m0 4h.01"/>
              </svg>
            }
            title="Account or Rewards Issues"
            body={
              <p>For help with your wallet, earnings, withdrawals, or question submissions, include your registered email and a description of the issue when you write to us.</p>
            }
          />

          <ContactCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 46%)" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            }
            title="Report Abuse"
            body={
              <p>To report inappropriate content or suspected fraud, please email us with the subject line <span className="font-medium text-foreground">"Abuse Report"</span>. We take all reports seriously and respond within 24 hours.</p>
            }
          />

          <ContactCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 46%)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>
              </svg>
            }
            title="General Inquiries"
            body={
              <p>For partnership opportunities, press inquiries, or anything else, feel free to reach out at{" "}
                <a
                  href="mailto:support.opinoza@gmail.com"
                  className="text-amber-600 font-medium hover:text-amber-700 transition-colors"
                >
                  support.opinoza@gmail.com
                </a>.
              </p>
            }
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-8 bg-amber-50 border border-amber-100 rounded-2xl p-5 text-center"
        >
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Typical response time:</span> within 1–2 business days.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
