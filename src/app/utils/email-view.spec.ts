import {conversationLabel, isConversation, participantsLabel} from './email-view';

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
});
