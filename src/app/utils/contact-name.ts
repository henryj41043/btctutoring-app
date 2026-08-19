import {Contact} from '../models/contact.model';

/**
 * A contact's display name, falling back to their email when both name
 * fields are blank — names are optional (newsletter signups arrive with
 * only an address).
 */
export function contactDisplayName(
  contact: Pick<Contact, 'first_name' | 'last_name' | 'email'>,
): string {
  return `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || (contact.email ?? '');
}
