import { motion } from "framer-motion";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </div>
);

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2 text-sm">Last updated: April 6, 2026</p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 shadow-sm">
          <Section title="1. Information We Collect">
            <p>We collect information you provide directly to us when you create an account, submit questions, or answer questions on Opinoza. This includes your name, email address, and any content you contribute.</p>
            <p>We also automatically collect certain usage data such as your IP address, browser type, pages visited, and interaction timestamps to help us improve the platform.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use the information we collect to operate and improve Opinoza, process your earnings and reward transactions, send you notifications about your account activity, and respond to your support requests.</p>
            <p>We do not sell your personal information to third parties.</p>
          </Section>

          <Section title="3. Cookies">
            <p>We use cookies and similar tracking technologies to maintain your session, remember your preferences, and analyze how our platform is used. You can control cookie settings through your browser preferences.</p>
          </Section>

          <Section title="4. Data Sharing">
            <p>We may share your information with trusted third-party service providers (such as authentication and payment processors) only as necessary to provide our services. These providers are bound by confidentiality obligations.</p>
            <p>We may also disclose information when required by law or to protect the rights and safety of Opinoza and its users.</p>
          </Section>

          <Section title="5. Data Retention">
            <p>We retain your account data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data by contacting us.</p>
          </Section>

          <Section title="6. Security">
            <p>We implement industry-standard security measures to protect your personal information. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
          </Section>

          <Section title="7. Your Rights">
            <p>Depending on your location, you may have the right to access, correct, or delete your personal data. To exercise these rights, please contact us at the address below.</p>
          </Section>

          <Section title="8. Contact Us">
            <p>If you have any questions about this Privacy Policy, please contact us at{" "}
              <a href="mailto:support@opinoza.com" className="text-amber-600 font-medium hover:text-amber-700 transition-colors">
                support@opinoza.com
              </a>.
            </p>
          </Section>
        </div>
      </motion.div>
    </div>
  );
}
