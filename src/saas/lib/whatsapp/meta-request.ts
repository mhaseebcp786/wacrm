import { isBusinessScopedUserId } from '@/lib/whatsapp/wa-identity';
import { MetaApiError, type MetaSendResult } from '@/lib/whatsapp/meta-api';

// Fork-owned copy of the request plumbing that upstream keeps private in
// meta-api.ts (`recipientFields`, `readMetaError`, `META_API_BASE`). The 99/1
// rule forbids touching that file, so the SaaS senders (carousel, shared
// message object) share this one copy instead of each carrying their own.
// Keep it behaviourally identical to upstream: same base URL, same BSUID
// recipient rule, same MetaApiError field mapping.

export const META_API_VERSION = 'v21.0';
export const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

interface MetaErrorResponse {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
    fbtrace_id?: string;
    error_data?: { messaging_product?: string; details?: string };
  };
}

/** `to` for a phone number, `recipient` for a business-scoped user id. */
export function recipientFields(to: string): Record<string, unknown> {
  return isBusinessScopedUserId(to)
    ? { recipient: to.trim() }
    : { recipient_type: 'individual', to };
}

/**
 * POST a prepared Cloud API message body. Throws `MetaApiError` on a non-2xx
 * response (falling back to `Meta API error: <status>` for non-JSON bodies).
 */
export async function postMetaMessage(args: {
  phoneNumberId: string;
  accessToken: string;
  body: Record<string, unknown>;
}): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, body } = args;
  const response = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Meta API error: ${response.status}`;
    let envelope: MetaErrorResponse['error'] | undefined;
    try {
      const data = (await response.json()) as MetaErrorResponse;
      envelope = data.error;
      if (envelope?.message) message = envelope.message;
    } catch {
      // response body wasn't JSON — keep fallback message
    }

    throw new MetaApiError(message, {
      code: typeof envelope?.code === 'number' ? envelope.code : null,
      subcode:
        typeof envelope?.error_subcode === 'number'
          ? envelope.error_subcode
          : null,
      type: envelope?.type ?? null,
      fbtraceId: envelope?.fbtrace_id ?? null,
      httpStatus: response.status,
      details: envelope?.error_data?.details ?? null,
    });
  }

  const data = (await response.json()) as { messages: [{ id: string }] };
  return { messageId: data.messages[0].id };
}
