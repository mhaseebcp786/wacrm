import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getT } from '@/lib/i18n/translate';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { SendMessageError } from '@/lib/whatsapp/send-message';
import { isUuid } from '@/saas/lib/quick-replies/ids';
import { sendQuickReplyToConversation } from '@/saas/lib/quick-replies/send';

const t = getT('Api');

// Send a saved reply into a conversation. Mirrors /api/whatsapp/send: agent
// role (a viewer's request would still deliver to Meta before RLS refused to
// record it), the same per-user rate-limit bucket, then the shared send core.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { supabase, accountId, userId } = await requireRole('agent');

    if (!isUuid(id)) {
      return NextResponse.json(
        { error: t('saasQuickReplies.notFound') },
        { status: 404 }
      );
    }

    const limit = checkRateLimit(`send:${userId}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const conversationId =
      typeof body?.conversation_id === 'string' ? body.conversation_id : '';
    if (!conversationId) {
      return NextResponse.json(
        { error: t('saasQuickReplies.conversationRequired') },
        { status: 400 }
      );
    }

    const result = await sendQuickReplyToConversation(supabase, accountId, {
      id,
      conversationId,
      replyToMessageId:
        typeof body?.reply_to_message_id === 'string'
          ? body.reply_to_message_id
          : null,
    });

    if (result.ok) {
      return NextResponse.json({
        success: true,
        message_id: result.value.messageId,
        whatsapp_message_id: result.value.whatsappMessageId,
      });
    }
    switch (result.error) {
      case 'notFound':
        return NextResponse.json(
          { error: t('saasQuickReplies.notFound') },
          { status: 404 }
        );
      case 'conversationNotFound':
        return NextResponse.json(
          { error: t('common.conversationNotFound') },
          { status: 404 }
        );
      case 'inactive':
        return NextResponse.json(
          { error: t('saasQuickReplies.inactive') },
          { status: 409 }
        );
      case 'unsupported':
        return NextResponse.json(
          { error: t('saasQuickReplies.unsupported') },
          { status: 422 }
        );
      case 'invalidMessage':
        return NextResponse.json(
          {
            error: t('saasQuickReplies.invalidMessage'),
            issues: result.issues,
          },
          { status: 422 }
        );
    }
  } catch (err) {
    if (err instanceof SendMessageError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Error in suggested-reply send POST:', err);
    return toErrorResponse(err);
  }
}
