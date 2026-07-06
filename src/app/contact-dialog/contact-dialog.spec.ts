import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialogRef } from '@angular/material/dialog';
import { FormGroup } from '@angular/forms';
import { ContactDialog } from './contact-dialog';
import { ContactService } from '../services/contact.service';

describe('ContactDialog', () => {
  const dialogRef = { close: jest.fn() };
  const contactService = { createContact: jest.fn() };
  let component: ContactDialog;

  const form = (): FormGroup =>
    (component as unknown as { contactForm: FormGroup }).contactForm;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      imports: [ContactDialog],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: ContactService, useValue: contactService },
      ],
    });
    component = TestBed.createComponent(ContactDialog).componentInstance;
  });

  const fillValid = () =>
    form().patchValue({
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      phone_number: '1234567890',
      service: 'Tutoring',
    });

  it('cancel closes the dialog', () => {
    component.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('createContact does nothing while the form is invalid', () => {
    component.createContact();
    expect(contactService.createContact).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('createContact submits a valid form and closes with the response', () => {
    fillValid();
    contactService.createContact.mockReturnValue(of({ id: 'c-1' }));
    component.createContact();
    expect(contactService.createContact).toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalledWith({ id: 'c-1' });
  });

  it('shows a duplicate-contact message on a 409 conflict', () => {
    fillValid();
    contactService.createContact.mockReturnValue(
      throwError(() => ({ status: 409 })),
    );
    component.createContact();
    expect(dialogRef.close).not.toHaveBeenCalled();
    const c = component as unknown as { hasError: boolean; errorMessage: string };
    expect(c.hasError).toBe(true);
    expect(c.errorMessage).toBe('A contact with this email already exists.');
  });

  it('shows a generic message on other create failures', () => {
    fillValid();
    contactService.createContact.mockReturnValue(
      throwError(() => ({ status: 500 })),
    );
    component.createContact();
    expect(dialogRef.close).not.toHaveBeenCalled();
    const c = component as unknown as { hasError: boolean; errorMessage: string };
    expect(c.hasError).toBe(true);
    expect(c.errorMessage).toBe('Failed to create the contact. Please try again.');
  });

  it('clears a previous error on a successful retry', () => {
    fillValid();
    contactService.createContact.mockReturnValue(
      throwError(() => ({ status: 409 })),
    );
    component.createContact();
    contactService.createContact.mockReturnValue(of({ id: 'c-2' }));
    component.createContact();
    expect((component as unknown as { hasError: boolean }).hasError).toBe(false);
    expect(dialogRef.close).toHaveBeenCalledWith({ id: 'c-2' });
  });
});
