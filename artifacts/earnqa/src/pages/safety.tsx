import { motion } from "framer-motion";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </div>
);

export default function Safety() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-600 text-xl">🛡️</span>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Child Safety Policy</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Opinoza is committed to preventing child sexual abuse and exploitation (CSAE). This policy
            describes our standards, moderation practices, and enforcement actions to keep our platform
            safe for everyone.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">Last updated: April 21, 2026</p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 shadow-sm">

          <Section title="1. Commitment to Safety">
            <p>
              Opinoza takes child safety with the utmost seriousness. We are fully committed to
              preventing child sexual abuse and exploitation (CSAE) on our platform. We comply with
              all applicable laws regarding the protection of minors, including mandatory reporting
              obligations to the National Center for Missing and Exploited Children (NCMEC) where
              required.
            </p>
            <p>
              We maintain a zero-tolerance policy for any content, behavior, or communication that
              sexualizes, exploits, or endangers minors. There are no exceptions.
            </p>
          </Section>

          <Section title="2. Prohibited Content">
            <p>The following content is strictly prohibited on Opinoza and will result in immediate
            removal and account termination:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Any form of sexual content involving minors (CSAM), including images, video, text, or illustrations</li>
              <li>Content that sexualizes, grooming, or facilitates exploitation of children</li>
              <li>Requests for, sharing of, or links to child sexual abuse material</li>
              <li>Questions or answers designed to elicit sexual responses from or about minors</li>
              <li>Any content that normalizes, glorifies, or promotes abuse or exploitation of children</li>
              <li>Personal information about minors that could facilitate harm</li>
            </ul>
          </Section>

          <Section title="3. Content Moderation System">
            <p>
              All user-generated content on Opinoza is subject to moderation before and after publication.
              Our moderation system operates on multiple layers:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>
                <strong className="text-foreground">Pre-publication review:</strong> New questions submitted by users are held in a
                pending queue and reviewed by our moderation team before becoming visible to the public.
              </li>
              <li>
                <strong className="text-foreground">Automated detection:</strong> We use automated systems to flag and block content
                that matches known patterns of abuse or exploitation.
              </li>
              <li>
                <strong className="text-foreground">Manual review:</strong> Our human moderation team reviews flagged content and
                makes final decisions on removal and enforcement.
              </li>
              <li>
                <strong className="text-foreground">Ongoing monitoring:</strong> Published content and user activity is continuously
                monitored for policy violations.
              </li>
            </ul>
          </Section>

          <Section title="4. User Reporting System">
            <p>
              Every user can report content or behavior they believe violates this policy. Reports are
              reviewed promptly by our moderation team.
            </p>
            <p>
              To report a concern:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Use the report button available on any question or answer in the app</li>
              <li>Email us directly at <strong className="text-foreground">support.opinoza@gmail.com</strong> with a description of the content and any relevant details</li>
            </ul>
            <p>
              Reports involving child safety are treated as the highest priority and reviewed
              immediately. We do not tolerate retaliation against users who make good-faith reports.
            </p>
          </Section>

          <Section title="5. Enforcement Actions">
            <p>
              When a violation of this policy is identified, we take swift and proportionate action:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong className="text-foreground">Content removal:</strong> Violating content is removed immediately upon identification.</li>
              <li><strong className="text-foreground">Account suspension:</strong> Accounts involved in a violation are suspended pending investigation.</li>
              <li><strong className="text-foreground">Permanent ban:</strong> Any account found to have posted or distributed CSAM or engaged in exploitation of minors is permanently banned with no possibility of reinstatement.</li>
              <li><strong className="text-foreground">Law enforcement referral:</strong> All suspected CSAM is reported to the appropriate authorities, including NCMEC's CyberTipline, and we cooperate fully with law enforcement investigations.</li>
              <li><strong className="text-foreground">Wallet freeze:</strong> Earnings and wallet balances associated with violating accounts may be frozen or forfeited.</li>
            </ul>
          </Section>

          <Section title="6. Contact Information">
            <p>
              For child safety concerns, policy questions, or to report a violation, please contact us:
            </p>
            <div className="mt-3 p-4 bg-muted/40 rounded-xl space-y-1">
              <p><strong className="text-foreground">Email:</strong>{" "}
                <a href="mailto:support.opinoza@gmail.com" className="text-blue-600 hover:underline">
                  support.opinoza@gmail.com
                </a>
              </p>
              <p><strong className="text-foreground">Platform:</strong> Opinoza — <a href="https://opinoza.com" className="text-blue-600 hover:underline">https://opinoza.com</a></p>
            </div>
            <p className="mt-3">
              We are committed to responding to all child safety reports within 24 hours.
            </p>
          </Section>

        </div>
      </motion.div>
    </div>
  );
}
