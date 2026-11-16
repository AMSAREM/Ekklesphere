/**
 * Server-side Communication Gateways:
 * - Arkesel SMS API v2 (https://sms.arkesel.com/api/v2/sms/send)
 * - Resend Email API (https://api.resend.com/emails)
 *
 * API keys are strictly read from server environment variables (process.env)
 * and never sent to or collected from browser UI forms.
 */

export interface CommunicationGatewayStatus {
  arkeselConfigured: boolean;
  resendConfigured: boolean;
  defaultSmsSenderId: string;
  defaultFromEmail: string;
  defaultFromName: string;
}

export interface ArkeselSmsResult {
  ok: boolean;
  configured: boolean;
  provider: string;
  senderId: string;
  sentCount: number;
  invalidCount: number;
  recipients: string[];
  message: string;
  providerResponse?: unknown;
  error?: string;
}

export interface ResendEmailResult {
  ok: boolean;
  configured: boolean;
  provider: string;
  from: string;
  sentCount: number;
  failedCount: number;
  emailIds: string[];
  message: string;
  error?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildHtmlFromPlainText(subject: string, text: string, orgName?: string): string {
  const safeOrg = escapeHtml((orgName || 'Ekklesphere Church').trim());
  const safeSubject = escapeHtml(subject.trim());
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px 0;line-height:1.6;">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#F6F7FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1D1B3A;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E9EBF5;border-radius:16px;padding:24px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6D5CF2;margin-bottom:8px;">${safeOrg}</div>
    <h2 style="margin:0 0 16px 0;font-size:18px;line-height:1.3;color:#1D1B3A;">${safeSubject}</h2>
    <div style="font-size:14px;color:#3E4259;">${paragraphs}</div>
    <hr style="border:none;border-top:1px solid #E9EBF5;margin:20px 0 12px 0;" />
    <div style="font-size:11px;color:#666A86;">Sent via ${safeOrg} pastoral &amp; congregational communications.</div>
  </div>
</body>
</html>`;
}

/**
 * Normalizes phone numbers into Arkesel international MSISDN digits (e.g. 233240000000).
 */
export function normalizeArkeselPhone(raw?: string | null): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  let digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  // Convert Ghana national 10-digit numbers (024xxxxxxx, 050xxxxxxx, 020xxxxxxx)
  if (digits.startsWith('0') && digits.length === 10) {
    digits = `233${digits.slice(1)}`;
  }
  if (digits.length < 9 || digits.length > 15) {
    return null;
  }
  return digits;
}

export function getCommunicationGatewayStatus(): CommunicationGatewayStatus {
  const arkeselKey = (process.env.ARKESEL_API_KEY || '').trim();
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const defaultSmsSenderId = ((process.env.ARKESEL_SENDER_ID || 'EKKLESPHERE').trim() || 'EKKLESPHERE')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .slice(0, 11);
  const defaultFromEmail =
    (process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev').trim() || 'onboarding@resend.dev';
  const defaultFromName =
    (process.env.RESEND_FROM_NAME || 'Ekklesphere Church').trim() || 'Ekklesphere Church';

  return {
    arkeselConfigured: Boolean(arkeselKey),
    resendConfigured: Boolean(resendKey),
    defaultSmsSenderId,
    defaultFromEmail,
    defaultFromName,
  };
}

export async function sendArkeselSms(params: {
  senderId?: string;
  recipients: string[];
  message: string;
  sandbox?: boolean;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<ArkeselSmsResult> {
  const status = getCommunicationGatewayStatus();
  const apiKey = (params.apiKey ?? process.env.ARKESEL_API_KEY ?? '').trim();
  const cleanSenderId = ((params.senderId || status.defaultSmsSenderId || 'EKKLESPHERE').trim())
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .slice(0, 11);

  const uniqueRecipients = new Set<string>();
  let invalidCount = 0;
  for (const raw of params.recipients) {
    const normalized = normalizeArkeselPhone(raw);
    if (normalized) {
      uniqueRecipients.add(normalized);
    } else if (String(raw || '').trim()) {
      invalidCount++;
    }
  }
  const recipients = Array.from(uniqueRecipients);

  if (recipients.length === 0) {
    return {
      ok: false,
      configured: Boolean(apiKey),
      provider: 'Arkesel SMS',
      senderId: cleanSenderId,
      sentCount: 0,
      invalidCount,
      recipients: [],
      message: 'No valid recipient phone numbers were found to send SMS.',
      error: 'NO_VALID_RECIPIENTS',
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      provider: 'Arkesel SMS',
      senderId: cleanSenderId,
      sentCount: 0,
      invalidCount,
      recipients,
      message:
        'Arkesel API key is not configured on the server (set ARKESEL_API_KEY in environment secrets).',
      error: 'ARKESEL_NOT_CONFIGURED',
    };
  }

  const doFetch = params.fetchImpl || fetch;
  const bodyPayload: Record<string, unknown> = {
    sender: cleanSenderId,
    message: params.message,
    recipients,
  };
  if (params.sandbox) {
    bodyPayload.sandbox = true;
  }

  try {
    const resp = await doFetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    const data: any = await resp.json().catch(() => ({}));
    const apiOk =
      resp.ok &&
      (data?.status === 'success' || data?.code === '200' || data?.data !== undefined || !data?.status);

    if (!apiOk) {
      const errMsg =
        data?.message || data?.error || `Arkesel SMS request failed with HTTP ${resp.status}.`;
      return {
        ok: false,
        configured: true,
        provider: 'Arkesel SMS',
        senderId: cleanSenderId,
        sentCount: 0,
        invalidCount,
        recipients,
        message: errMsg,
        providerResponse: data,
        error: 'ARKESEL_API_ERROR',
      };
    }

    return {
      ok: true,
      configured: true,
      provider: 'Arkesel SMS',
      senderId: cleanSenderId,
      sentCount: recipients.length,
      invalidCount,
      recipients,
      message: `SMS delivered via Arkesel to ${recipients.length} recipient${
        recipients.length === 1 ? '' : 's'
      } (Sender ID: ${cleanSenderId}).`,
      providerResponse: data,
    };
  } catch (err: any) {
    return {
      ok: false,
      configured: true,
      provider: 'Arkesel SMS',
      senderId: cleanSenderId,
      sentCount: 0,
      invalidCount,
      recipients,
      message: err?.message || 'Network error reaching Arkesel SMS API.',
      error: 'ARKESEL_NETWORK_ERROR',
    };
  }
}

export async function sendResendEmail(params: {
  fromEmail?: string;
  fromName?: string;
  organizationName?: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<ResendEmailResult> {
  const status = getCommunicationGatewayStatus();
  const apiKey = (params.apiKey ?? process.env.RESEND_API_KEY ?? '').trim();
  const cleanFromEmail = (params.fromEmail || status.defaultFromEmail || 'onboarding@resend.dev').trim();
  const cleanFromName = (params.fromName || params.organizationName || status.defaultFromName).trim();
  const fromHeader = cleanFromName ? `${cleanFromName} <${cleanFromEmail}>` : cleanFromEmail;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const recipients = Array.from(
    new Set(
      params.to
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => emailRegex.test(e))
    )
  );

  if (recipients.length === 0) {
    return {
      ok: false,
      configured: Boolean(apiKey),
      provider: 'Resend Email',
      from: fromHeader,
      sentCount: 0,
      failedCount: 0,
      emailIds: [],
      message: 'No valid recipient email addresses were found.',
      error: 'NO_VALID_EMAIL_RECIPIENTS',
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      provider: 'Resend Email',
      from: fromHeader,
      sentCount: 0,
      failedCount: recipients.length,
      emailIds: [],
      message:
        'Resend API key is not configured on the server (set RESEND_API_KEY in environment secrets).',
      error: 'RESEND_NOT_CONFIGURED',
    };
  }

  const doFetch = params.fetchImpl || fetch;
  const htmlBody =
    params.html || buildHtmlFromPlainText(params.subject, params.text, params.organizationName);

  const emailIds: string[] = [];
  let failedCount = 0;
  let lastError = '';

  try {
    if (recipients.length === 1) {
      const resp = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          from: fromHeader,
          to: [recipients[0]],
          subject: params.subject,
          text: params.text,
          html: htmlBody,
        }),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          ok: false,
          configured: true,
          provider: 'Resend Email',
          from: fromHeader,
          sentCount: 0,
          failedCount: 1,
          emailIds: [],
          message: data?.message || data?.error || `Resend Email failed with HTTP ${resp.status}.`,
          error: 'RESEND_API_ERROR',
        };
      }
      if (data?.id) emailIds.push(String(data.id));
      return {
        ok: true,
        configured: true,
        provider: 'Resend Email',
        from: fromHeader,
        sentCount: 1,
        failedCount: 0,
        emailIds,
        message: `Email sent via Resend to ${recipients[0]}.`,
      };
    }

    // Batch individual emails in chunks of 50 to keep each member's email private
    const chunkSize = 50;
    for (let i = 0; i < recipients.length; i += chunkSize) {
      const batch = recipients.slice(i, i + chunkSize).map((addr) => ({
        from: fromHeader,
        to: [addr],
        subject: params.subject,
        text: params.text,
        html: htmlBody,
      }));
      const resp = await doFetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        failedCount += batch.length;
        lastError = data?.message || data?.error || `Resend batch HTTP ${resp.status}`;
      } else if (Array.isArray(data?.data)) {
        for (const item of data.data) {
          if (item?.id) emailIds.push(String(item.id));
        }
      }
    }

    const sentCount = recipients.length - failedCount;
    if (sentCount <= 0) {
      return {
        ok: false,
        configured: true,
        provider: 'Resend Email',
        from: fromHeader,
        sentCount: 0,
        failedCount,
        emailIds,
        message: lastError || 'Resend could not deliver the broadcast emails.',
        error: 'RESEND_API_ERROR',
      };
    }

    return {
      ok: true,
      configured: true,
      provider: 'Resend Email',
      from: fromHeader,
      sentCount,
      failedCount,
      emailIds,
      message: `Email dispatched via Resend to ${sentCount} recipient${sentCount === 1 ? '' : 's'}${
        failedCount > 0 ? ` (${failedCount} failed)` : ''
      }.`,
    };
  } catch (err: any) {
    return {
      ok: false,
      configured: true,
      provider: 'Resend Email',
      from: fromHeader,
      sentCount: 0,
      failedCount: recipients.length,
      emailIds: [],
      message: err?.message || 'Network error reaching Resend Email API.',
      error: 'RESEND_NETWORK_ERROR',
    };
  }
}
