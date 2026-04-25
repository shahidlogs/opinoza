import nodemailer from "nodemailer";

const FROM_NAME = "Opinoza";
const FROM_EMAIL = "support@opinoza.com";

// Base URL for all links in emails. Set APP_BASE_URL in environment variables
// to override (e.g. the real production domain). No trailing slash.
const APP_BASE_URL = (process.env.APP_BASE_URL || "https://opinoza.com").replace(/\/+$/, "");

function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  // ── Automated emails temporarily disabled ────────────────────────────────
  // All communication is handled manually via support@opinoza.com.
  // Re-enable by removing this early return and restoring the SMTP block below.
  console.info(`[email] Disabled — would have sent "${opts.subject}" to ${opts.to}`);
  return false;

  /* eslint-disable no-unreachable */
  const transporter = createTransporter();

  if (!transporter) {
    console.warn("[email] SMTP_USER / SMTP_PASSWORD not set — email skipped");
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    console.info(`[email] Sent to ${opts.to} — messageId: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error("[email] Send failed:", err);
    return false;
  }
  /* eslint-enable no-unreachable */
}

/**
 * Sends an email bypassing the global disable flag.
 * Use only for critical transactional emails (e.g. payment confirmation).
 */
export async function sendEmailDirect(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; path: string; contentType?: string }>;
}): Promise<boolean> {
  const transporter = createTransporter();

  if (!transporter) {
    console.warn("[email:direct] SMTP_USER / SMTP_PASSWORD not set — email skipped");
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      attachments: opts.attachments,
    });
    console.info(`[email:direct] Sent to ${opts.to} — messageId: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error("[email:direct] Send failed:", err);
    return false;
  }
}

export function questionAnsweredEmail(opts: {
  creatorName?: string | null;
  creatorEmail: string;
  questionTitle: string;
  rewardCents: number;
}): { subject: string; html: string; text: string } {
  const greeting = opts.creatorName ? `Hi ${opts.creatorName}` : "Hi there";
  const rewardStr = Number.isInteger(opts.rewardCents)
    ? `${opts.rewardCents}¢`
    : `${opts.rewardCents.toFixed(1)}¢`;
  const shortTitle = opts.questionTitle.length > 70
    ? opts.questionTitle.substring(0, 70) + "…"
    : opts.questionTitle;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your question was answered!</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5282 100%);padding:28px 40px;text-align:center;">
              <span style="font-size:26px;font-weight:900;color:#f59e0b;letter-spacing:-0.5px;">Opinoza</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1e3a5f;">${greeting} 🎉</h1>
              <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6;">
                Someone just answered your question on Opinoza — and you earned a reward!
              </p>

              <!-- Question box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1e3a5f;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Question</p>
                    <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;line-height:1.5;">${shortTitle}</p>
                  </td>
                </tr>
              </table>

              <!-- Reward box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fde68a;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size:14px;color:#92400e;font-weight:500;">Creator reward earned</td>
                        <td align="right" style="font-size:20px;font-weight:800;color:#d97706;">+${rewardStr}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
                Every answer on your question earns you <strong style="color:#1e3a5f;">${rewardStr}</strong>.
                Keep creating questions to grow your balance faster.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;">
                    <a href="${APP_BASE_URL}/wallet"
                       style="display:inline-block;padding:11px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                      View My Wallet →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
                Questions? Reach us at
                <a href="mailto:support@opinoza.com" style="color:#d97706;text-decoration:none;">support@opinoza.com</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © 2026 Opinoza ·
                <a href="${APP_BASE_URL}/privacy" style="color:#94a3b8;text-decoration:none;">Privacy</a> ·
                <a href="${APP_BASE_URL}/terms" style="color:#94a3b8;text-decoration:none;">Terms</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const text = `${greeting},

Someone answered your question on Opinoza — and you earned ${rewardStr}!

Question: "${opts.questionTitle}"

Creator reward earned: +${rewardStr}

Every answer on your question earns you ${rewardStr}. Keep creating questions to grow your balance.

View your wallet: ${APP_BASE_URL}/wallet

— The Opinoza Team
`;

  return {
    subject: `Your question was answered — you earned ${rewardStr} 🪙`,
    html,
    text,
  };
}

export function withdrawalApprovedEmail(opts: {
  name?: string | null;
  amountCents: number;
}): { subject: string; html: string; text: string } {
  const greeting = opts.name ? `Hi ${opts.name}` : "Hi there";
  const dollars = (opts.amountCents / 100).toFixed(2);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Withdrawal Approved</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5282 100%);padding:28px 40px;text-align:center;">
              <span style="font-size:26px;font-weight:900;color:#f59e0b;letter-spacing:-0.5px;">Opinoza</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1e3a5f;">${greeting} ✅</h1>
              <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6;">
                Great news — your withdrawal request has been approved!
              </p>

              <!-- Amount box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size:14px;color:#166534;font-weight:500;">Approved withdrawal amount</td>
                        <td align="right" style="font-size:22px;font-weight:800;color:#15803d;">$${dollars}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">
                      The payment will be transferred to your account within <strong>7 days</strong>. Please ensure your payment details are correct in your profile.
                    </p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;">
                    <a href="${APP_BASE_URL}/wallet"
                       style="display:inline-block;padding:11px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                      View My Wallet →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
                Questions? Reach us at
                <a href="mailto:support@opinoza.com" style="color:#d97706;text-decoration:none;">support@opinoza.com</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © 2026 Opinoza ·
                <a href="${APP_BASE_URL}/privacy" style="color:#94a3b8;text-decoration:none;">Privacy</a> ·
                <a href="${APP_BASE_URL}/terms" style="color:#94a3b8;text-decoration:none;">Terms</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const text = `${greeting},

Your withdrawal request has been approved.

Approved amount: $${dollars}

The payment will be transferred to your account within 7 days. Please ensure your payment details are correct in your profile.

View your wallet: ${APP_BASE_URL}/wallet

Questions? Email us at support@opinoza.com

— The Opinoza Team
`;

  return {
    subject: "Your withdrawal has been approved ✅",
    html,
    text,
  };
}

export function withdrawalRejectedEmail(opts: {
  name?: string | null;
  amountCents: number;
}): { subject: string; html: string; text: string } {
  const greeting = opts.name ? `Hi ${opts.name}` : "Hi there";
  const dollars = (opts.amountCents / 100).toFixed(2);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Withdrawal Update</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5282 100%);padding:28px 40px;text-align:center;">
              <span style="font-size:26px;font-weight:900;color:#f59e0b;letter-spacing:-0.5px;">Opinoza</span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1e3a5f;">${greeting}</h1>
              <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6;">
                Your withdrawal request of <strong>$${dollars}</strong> could not be processed at this time. The full amount has been returned to your wallet balance.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:14px;color:#7c2d12;line-height:1.6;">
                      If you believe this is an error or need more information, please contact us at
                      <a href="mailto:support@opinoza.com" style="color:#ea580c;">support@opinoza.com</a>.
                    </p>
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;">
                    <a href="${APP_BASE_URL}/wallet"
                       style="display:inline-block;padding:11px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                      View My Wallet →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">© 2026 Opinoza</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const text = `${greeting},

Your withdrawal request of $${dollars} could not be processed at this time.

The full amount has been returned to your wallet balance. If you believe this is an error, please contact us at support@opinoza.com.

View your wallet: ${APP_BASE_URL}/wallet

— The Opinoza Team
`;

  return {
    subject: "Update on your withdrawal request",
    html,
    text,
  };
}

export function paymentTransferredEmail(opts: {
  name?: string | null;
  amountCents: number;
  paymentMethod: string;
  referralCode?: string | null;
}): { subject: string; html: string; text: string } {
  const greeting = opts.name ? `Dear ${opts.name}` : "Dear User";
  const dollars = (opts.amountCents / 100).toFixed(2);
  const referralLink = opts.referralCode
    ? `${APP_BASE_URL}/?ref=${opts.referralCode}`
    : `${APP_BASE_URL}/`;
  const posterUrl = `${APP_BASE_URL}/payment.png`;

  const shareText = encodeURIComponent(
    `🎉 I just received my payment from Opinoza!\nJoin using my link and start earning by answering simple questions 💰`
  );
  const whatsappLink = `https://wa.me/?text=${shareText}%20${encodeURIComponent(referralLink)}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Opinoza payment has been transferred</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5282 100%);padding:28px 40px;text-align:center;">
              <span style="font-size:26px;font-weight:900;color:#f59e0b;letter-spacing:-0.5px;">Opinoza</span>
            </td>
          </tr>

          <!-- Payment Poster Image -->
          <tr>
            <td style="padding:0;">
              <img src="${posterUrl}" alt="Payment Received" style="max-width:600px;width:100%;display:block;border-radius:0;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1e3a5f;">${greeting},</h1>
              <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#1e3a5f;">Congratulations! 🎉</p>
              <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
                Your withdrawal request has been successfully processed, and the amount has been transferred to your provided account.
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6;">
                We truly appreciate your activity and contribution on Opinoza.
              </p>

              <!-- Payment details box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#166534;font-weight:500;">Amount Transferred</td>
                        <td align="right" style="padding:4px 0;font-size:20px;font-weight:800;color:#15803d;">$${dollars}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:13px;color:#166534;">Payment Method</td>
                        <td align="right" style="padding:4px 0;font-size:13px;color:#15803d;font-weight:600;">${opts.paymentMethod === "USDT" ? "USDT (Crypto)" : opts.paymentMethod}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Referral section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fde68a;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#92400e;">🎁 Earn More with Referrals!</p>
                    <p style="margin:0 0 10px;font-size:14px;color:#78350f;line-height:1.6;">Invite others and increase your earnings:</p>
                    <p style="margin:0 0 6px;font-size:14px;color:#92400e;">💰 Earn <strong>$0.10</strong> for every new user who joins using your invitation link</p>
                    <p style="margin:0 0 14px;font-size:14px;color:#92400e;">💸 Earn <strong>$0.005</strong> on every answer they submit</p>
                    <hr style="border:none;border-top:1px solid #fde68a;margin:0 0 14px;" />
                    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">📢 Share &amp; Earn</p>
                    <p style="margin:0 0 12px;font-size:13px;color:#78350f;line-height:1.6;font-style:italic;">
                      "🎉 I just received my payment from Opinoza!<br/>
                      Join using my link and start earning by answering simple questions 💰"
                    </p>
                    <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#92400e;">Your invitation link:</p>
                    <a href="${referralLink}" style="display:block;font-size:13px;color:#d97706;word-break:break-all;text-decoration:underline;margin-bottom:14px;">${referralLink}</a>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:#25d366;border-radius:8px;">
                          <a href="${whatsappLink}" style="display:inline-block;padding:9px 20px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;">
                            Share on WhatsApp
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
                If you have any questions, feel free to contact us anytime at
                <a href="mailto:support@opinoza.com" style="color:#d97706;text-decoration:none;">support@opinoza.com</a>.
              </p>

              <p style="margin:0 0 6px;font-size:14px;color:#64748b;">Thank you for being a valued part of Opinoza.</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#1e3a5f;">Best regards,<br/>Opinoza Team</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © 2026 Opinoza ·
                <a href="${APP_BASE_URL}/privacy" style="color:#94a3b8;text-decoration:none;">Privacy</a> ·
                <a href="${APP_BASE_URL}/terms" style="color:#94a3b8;text-decoration:none;">Terms</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const text = `${greeting},

Congratulations! 🎉

Your withdrawal request has been successfully processed, and the amount has been transferred to your provided account.

Amount Transferred: $${dollars}
Payment Method: ${opts.paymentMethod === "USDT" ? "USDT (Crypto)" : opts.paymentMethod}

We truly appreciate your activity and contribution on Opinoza.

🎁 Earn More with Referrals!

Invite others and increase your earnings:
💰 Earn $0.10 for every new user who joins using your invitation link
💸 Earn $0.005 on every answer they submit

📢 Share & Earn
"🎉 I just received my payment from Opinoza!
Join using my link and start earning by answering simple questions 💰"

Your invitation link:
${referralLink}

If you have any questions, feel free to contact us anytime at support@opinoza.com.

Thank you for being a valued part of Opinoza.

Best regards,
Opinoza Team
`;

  return {
    subject: "🎉 Your Opinoza payment has been transferred",
    html,
    text,
  };
}

export function welcomeEmail(opts: { name?: string | null; email: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = opts.name ? `Hi ${opts.name}` : "Hi there";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Opinoza</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5282 100%);padding:36px 40px;text-align:center;">
              <span style="font-size:28px;font-weight:900;color:#f59e0b;letter-spacing:-0.5px;">Opinoza</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a5f;">${greeting} 👋</h1>
              <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6;">
                Welcome to <strong style="color:#1e3a5f;">Opinoza</strong> — the platform where your opinions earn real money.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fde68a;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">How it works</p>
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#1e3a5f;">
                          <span style="display:inline-block;width:20px;font-weight:700;color:#d97706;">1¢</span>
                          earned for every question you answer
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#1e3a5f;">
                          <span style="display:inline-block;width:20px;font-weight:700;color:#d97706;">0.5¢</span>
                          creator reward per answer on your custom questions
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#1e3a5f;">
                          <span style="display:inline-block;width:20px;font-weight:700;color:#d97706;">$10</span>
                          minimum to withdraw via PayPal, bank transfer, or gift card
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.6;">
                Start by browsing the question feed — each answer adds to your balance instantly. Fill out your profile to earn bonus cents too.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;">
                    <a href="${APP_BASE_URL}/questions"
                       style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                      Start Earning →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
                If you have any questions, reply to this email or reach us at
                <a href="mailto:support@opinoza.com" style="color:#d97706;text-decoration:none;">support@opinoza.com</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © 2026 Opinoza · 
                <a href="${APP_BASE_URL}/privacy" style="color:#94a3b8;text-decoration:none;">Privacy</a> · 
                <a href="${APP_BASE_URL}/terms" style="color:#94a3b8;text-decoration:none;">Terms</a>
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">
                You're receiving this because you signed up at Opinoza.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const text = `${greeting},

Welcome to Opinoza — the platform where your opinions earn real money.

How it works:
• 1¢ earned for every question you answer
• 0.5¢ creator reward per answer on your custom questions
• $10 minimum to withdraw via PayPal, bank transfer, or gift card

Start browsing: ${APP_BASE_URL}/questions

Questions? Email us at support@opinoza.com

— The Opinoza Team
`;

  return {
    subject: "Welcome to Opinoza — start earning today 🪙",
    html,
    text,
  };
}

function emailShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5282 100%);padding:28px 40px;text-align:center;">
              <span style="font-size:26px;font-weight:900;color:#f59e0b;letter-spacing:-0.5px;">Opinoza</span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 28px;">${body}</td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © 2026 Opinoza ·
                <a href="${APP_BASE_URL}/privacy" style="color:#94a3b8;text-decoration:none;">Privacy</a> ·
                <a href="${APP_BASE_URL}/terms" style="color:#94a3b8;text-decoration:none;">Terms</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function ctaButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
    <tr>
      <td style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;">
        <a href="${href}" style="display:inline-block;padding:11px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${label} →</a>
      </td>
    </tr>
  </table>`;
}

export function confirmNameEmail(opts: {
  name?: string | null;
  email: string;
}): { subject: string; html: string; text: string } {
  const greeting = opts.name ? `Hi ${opts.name}` : "Hi there";

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1e3a5f;">${greeting} 🎉</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.6;">
      Congratulations — you've reached <strong style="color:#1e3a5f;">$5 in earnings</strong> on Opinoza!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#92400e;">⚠️ Action Required: Confirm Your Name</p>
        <p style="margin:0;font-size:14px;color:#92400e;line-height:1.7;">
          Please confirm that your profile name is your <strong>real, legal name</strong>.<br/>
          Your payment account must be registered in the <strong>exact same name</strong> as your profile.<br/>
          If the names do not match, your payment <strong>cannot be transferred</strong>.
        </p>
      </td></tr>
    </table>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
      You can review and update your profile name on Opinoza before you request a withdrawal.
      Once your earnings reach <strong>$10</strong>, your name will be locked and cannot be changed without contacting support.
    </p>
    ${ctaButton(`${APP_BASE_URL}/profile`, "Review My Profile")}
    <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? <a href="mailto:support@opinoza.com" style="color:#d97706;text-decoration:none;">support@opinoza.com</a></p>
  `;

  return {
    subject: "Action required: confirm your name to receive payments 🪙",
    html: emailShell("Confirm your profile name", body),
    text: `${greeting},

Congratulations — you've reached $5 in earnings on Opinoza!

IMPORTANT: Please confirm your profile name is your real, legal name.
Your payment account must be registered in the exact same name as your profile.
If the names do not match, your payment cannot be transferred.

Review your profile: ${APP_BASE_URL}/profile

Once your earnings reach $10, your name will be locked and cannot be changed without contacting support.

Questions? Email us at support@opinoza.com

— The Opinoza Team`,
  };
}

export function questionApprovedEmail(opts: {
  name?: string | null;
  questionTitle: string;
}): { subject: string; html: string; text: string } {
  const greeting = opts.name ? `Hi ${opts.name}` : "Hi there";
  const shortTitle = opts.questionTitle.length > 70 ? opts.questionTitle.substring(0, 70) + "…" : opts.questionTitle;

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1e3a5f;">${greeting} 🎉</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6;">Great news — your question has been approved and is now live on Opinoza!</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1e3a5f;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Your Question</p>
        <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;line-height:1.5;">${shortTitle}</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fde68a;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">
          You earn <strong>0.5¢</strong> every time someone answers your question. Share it to earn faster!
        </p>
      </td></tr>
    </table>
    ${ctaButton(`${APP_BASE_URL}/questions`, "View Your Question")}
    <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? <a href="mailto:support@opinoza.com" style="color:#d97706;text-decoration:none;">support@opinoza.com</a></p>
  `;

  return {
    subject: "Your question is live on Opinoza! 🎉",
    html: emailShell("Your question is live!", body),
    text: `${greeting},\n\nYour question has been approved and is now live on Opinoza!\n\nQuestion: "${opts.questionTitle}"\n\nYou earn 0.5¢ every time someone answers it.\n\nView it here: ${APP_BASE_URL}/questions\n\n— The Opinoza Team`,
  };
}

export function questionRejectedEmail(opts: {
  name?: string | null;
  questionTitle: string;
  refunded: boolean;
  reason?: string | null;
}): { subject: string; html: string; text: string } {
  const greeting = opts.name ? `Hi ${opts.name}` : "Hi there";
  const shortTitle = opts.questionTitle.length > 70 ? opts.questionTitle.substring(0, 70) + "…" : opts.questionTitle;
  const guidelinesUrl = `${APP_BASE_URL}/guidelines`;

  const reasonBlock = opts.reason
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:8px;margin-bottom:24px;"><tr><td style="padding:16px 20px;"><p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Reason</p><p style="margin:0;font-size:14px;color:#1e293b;line-height:1.5;">${opts.reason}</p></td></tr></table>`
    : "";

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1e3a5f;">${greeting}</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6;">Your question was rejected because it appears to be spam, low-quality, unclear, a duplicate, or against platform rules.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #dc2626;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Question</p>
        <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;line-height:1.5;">${shortTitle}</p>
      </td></tr>
    </table>
    ${reasonBlock}
    ${opts.refunded ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:14px 20px;"><p style="margin:0 0 6px;font-size:14px;color:#166534;font-weight:600;">✓ 20¢ has been refunded to your wallet.</p><p style="margin:0;font-size:13px;color:#166534;">A 5¢ processing penalty was retained from your 25¢ submission fee.</p></td></tr></table>` : ""}
    <p style="margin:0 0 20px;font-size:14px;color:#64748b;line-height:1.6;">
      Please review our guidelines and submit a new question:<br/>
      <a href="${guidelinesUrl}" style="color:#d97706;font-weight:600;text-decoration:none;">${guidelinesUrl}</a>
    </p>
    ${ctaButton(`${APP_BASE_URL}/questions/new`, "Try a New Question")}
    <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? <a href="mailto:support@opinoza.com" style="color:#d97706;text-decoration:none;">support@opinoza.com</a></p>
  `;

  const refundText = opts.refunded ? "\n\n20¢ has been refunded to your wallet. 5¢ was kept as a processing penalty." : "";
  const reasonText = opts.reason ? `\n\nReason:\n${opts.reason}` : "";
  return {
    subject: "Your question was rejected",
    html: emailShell("Question rejected", body),
    text: `${greeting},\n\nYour question was rejected because it appears to be spam, low-quality, unclear, a duplicate, or against platform rules.${reasonText}${refundText}\n\nPlease review our guidelines and submit a new question.\n\n${guidelinesUrl}\n\n— The Opinoza Team`,
  };
}

export function answerFlaggedEmail(opts: {
  name?: string | null;
  questionTitle: string;
  questionId: number;
}): { subject: string; html: string; text: string } {
  const greeting = opts.name ? `Hi ${opts.name}` : "Hi there";
  const shortTitle = opts.questionTitle.length > 70 ? opts.questionTitle.substring(0, 70) + "…" : opts.questionTitle;
  const questionUrl = `${APP_BASE_URL}/questions/${opts.questionId}`;

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1e3a5f;">${greeting}</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6;">One of your answers has been flagged and needs to be corrected before you can submit new answers.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Question</p>
        <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;line-height:1.5;">${shortTitle}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
      Please review and edit your answer to ensure it meets our quality standards. Once corrected, your account will be fully unblocked.
    </p>
    ${ctaButton(questionUrl, "Fix My Answer")}
    <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? <a href="mailto:support@opinoza.com" style="color:#d97706;text-decoration:none;">support@opinoza.com</a></p>
  `;

  return {
    subject: "Your answer needs correction",
    html: emailShell("Answer needs correction", body),
    text: `${greeting},\n\nOne of your answers has been flagged and needs correction.\n\nQuestion: "${opts.questionTitle}"\n\nPlease review and edit your answer: ${questionUrl}\n\nOnce corrected, you can submit new answers normally.\n\n— The Opinoza Team`,
  };
}
