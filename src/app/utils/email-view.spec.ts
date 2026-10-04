import {conversationLabel, isConversation, participantsLabel, rejectedReasonLabel} from './email-view';

describe('email-view', () => {
  describe('isConversation', () => {
    it('is true only for an entry flagged as a thread', () => {
      expect(isConversation({is_thread: true})).toBe(true);
      expect(isConversation({is_thread: false})).toBe(false);
      expect(isConversation({message_count: 3})).toBe(false);
      expect(isConversation({})).toBe(false);
    });
  });

  describe('conversationLabel', () => {
    it('shows the number of messages', () => {
      expect(conversationLabel({message_count: 3})).toBe('Conversation · 3 messages');
      expect(conversationLabel({message_count: 1})).toBe('Conversation · 1 message');
    });

    it('leaves the count out when it is missing or zero', () => {
      expect(conversationLabel({})).toBe('Conversation');
      expect(conversationLabel({message_count: 0})).toBe('Conversation');
    });
  });

  describe('participantsLabel', () => {
    it('lists names with addresses, and bare addresses', () => {
      expect(participantsLabel({
        participants: [
          {email: 'jane@example.com', name: 'Jane Parent'},
          {email: 'admin@btc.test'},
        ],
      })).toBe('Jane Parent <jane@example.com>, admin@btc.test');
    });

    it('skips entries without an address', () => {
      expect(participantsLabel({
        participants: [{email: ''}, null as never, {email: 'a@b.co'}],
      })).toBe('a@b.co');
    });

    it('is empty when nobody is listed', () => {
      expect(participantsLabel({})).toBe('');
      expect(participantsLabel({participants: []})).toBe('');
    });
  });

  describe('rejectedReasonLabel', () => {
    it.each([
      ['unknown_sender', 'Sender is not staff'],
      ['unverified', 'Sender could not be verified'],
      ['spam', 'Flagged as spam'],
      ['virus', 'Flagged as a virus'],
      [undefined, 'Rejected'],
    ] as const)('%s reads "%s"', (reason, label) => {
      expect(rejectedReasonLabel({rejected_reason: reason})).toBe(label);
    });
  });
});
