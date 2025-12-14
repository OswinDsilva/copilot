import type { EmailDeliveryRequest, EmailDeliveryResult } from './emailTypes';

/**
 * Send an email through a lightweight backend proxy (avoids SendGrid CORS blocks).
 * Configure VITE_EMAIL_PROXY_URL to point to your proxy endpoint.
 */
export async function sendEmail(
  request: EmailDeliveryRequest
): Promise<EmailDeliveryResult> {
  const { to, subject, message } = request;

  if (!to || !isValidEmail(to)) {
    return {
      success: false,
      error: 'Invalid recipient email address.'
    };
  }

  if (!subject || subject.length === 0) {
    return {
      success: false,
      error: 'Subject cannot be empty.'
    };
  }

  if (!message || message.length === 0) {
    return {
      success: false,
      error: 'Message cannot be empty.'
    };
  }

  const proxyUrl = import.meta.env.VITE_EMAIL_PROXY_URL || 'http://localhost:8787/send-email';

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to, subject, message })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data?.error || `Email send failed (${response.status})`;
      return {
        success: false,
        error: errorMsg
      };
    }

    return {
      success: true,
      messageId: data?.messageId
    };
  } catch (error: any) {
    console.error('[Email] Send failed:', error);
    return {
      success: false,
      error: error.message || 'Network error while sending email'
    };
  }
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
