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

  it('createContact swallows errors without closing', () => {
    fillValid();
    contactService.createContact.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    component.createContact();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
