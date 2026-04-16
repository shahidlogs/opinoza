import { motion } from "framer-motion";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </div>
);

export default function Terms() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Terms of Service</h1>
          <p className="text-muted-foreground mt-2 text-sm">Last updated: April 6, 2026</p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 shadow-sm">
          <Section title="1. Acceptance of Terms">
            <p>By accessing or using Opinoza, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our platform.</p>
          </Section>

          <Section title="2. Eligibility">
            <p>You must be at least 13 years of age to use Opinoza. By creating an account, you represent that you meet this age requirement and that all information you provide is accurate.</p>
          </Section>

          <Section title="3. Earning Rewards">
            <p>Opinoza awards 1¢ per valid answer submitted to available questions. Question creators earn 0.5¢ per valid answer received on their approved custom questions. Rewards are credited to your Opinoza wallet.</p>
            <p>Question creators also receive a one-time $1 bonus when their question reaches 50 unique answers. This is the only creator bonus available — no other milestones exist.</p>
            <p>Rewards are subject to change. We reserve the right to adjust reward amounts, eligibility criteria, and payout terms at any time with reasonable notice.</p>
          </Section>

          <Section title="4. Custom Questions">
            <p>Submitting a custom question costs 10¢ deducted from your wallet balance and requires admin approval before it becomes publicly visible. We reserve the right to reject or remove questions that violate our content guidelines.</p>
          </Section>

          <Section title="5. Withdrawals">
            <p>The minimum withdrawal amount is $10.00 (1000¢). Withdrawal requests are reviewed within 2–3 business days. We reserve the right to withhold withdrawals pending investigation of suspected fraud or abuse.</p>
          </Section>

          <Section title="6. Prohibited Conduct">
            <p>You agree not to: submit fraudulent answers, create multiple accounts to abuse rewards, attempt to manipulate the platform, post illegal or harmful content, or interfere with the platform's operation.</p>
            <p>Violation of these rules may result in account suspension and forfeiture of earned rewards.</p>
          </Section>

          <Section title="7. Intellectual Property">
            <p>Content you submit (questions, answers) remains your responsibility. By submitting content, you grant Opinoza a non-exclusive license to display and use that content on the platform.</p>
          </Section>

          <Section title="8. Disclaimers">
            <p>Opinoza is provided "as is" without warranties of any kind. We do not guarantee uninterrupted access or that the platform will be error-free.</p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>To the maximum extent permitted by law, Opinoza shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.</p>
          </Section>

          <Section title="10. Changes to Terms">
            <p>We may update these Terms at any time. Continued use of Opinoza after changes constitutes your acceptance of the revised Terms.</p>
          </Section>

          <Section title="11. Contact">
            <p>For questions about these Terms, contact us at{" "}
              <a href="mailto:support.opinoza@gmail.com" className="text-amber-600 font-medium hover:text-amber-700 transition-colors">
                support.opinoza@gmail.com
              </a>.
            </p>
          </Section>
        </div>
      </motion.div>
    </div>
  );
}
