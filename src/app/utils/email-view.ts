import {EmailEntry, EmailParticipant} from '../models/email-entry.model';

/** A forwarded conversation: several messages filed as one entry. */
export function isConversation(entry: EmailEntry): boolean {
  return entry.is_thread === true;
}

/** "Conversation · 3 messages" (the count is left out when unknown). */
export function conversationLabel(entry: EmailEntry): string {
  const count = entry.message_count ?? 0;
  return count > 0 ? `Conversation · ${count} message${count === 1 ? '' : 's'}` : 'Conversation';
}

function participantLabel(participant: EmailParticipant): string {
  return participant.name ? `${participant.name} <${participant.email}>` : participant.email;
}

/** Everyone in the conversation, comma separated; '' when nobody is listed. */
export function participantsLabel(entry: EmailEntry): string {
  return (entry.participants ?? [])
    .filter(participant => !!participant?.email)
    .map(participantLabel)
    .join(', ');
}

/** Why the Hub refused a forward, in plain words. */
export function rejectedReasonLabel(entry: EmailEntry): string {
  switch (entry.rejected_reason) {
    case 'unknown_sender':
      return 'Sender is not staff';
    case 'unverified':
      return 'Sender could not be verified';
    case 'spam':
      return 'Flagged as spam';
    case 'virus':
      return 'Flagged as a virus';
    default:
      return 'Rejected';
  }
}
