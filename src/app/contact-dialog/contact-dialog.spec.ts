import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { MatDialogRef } from '@angular/material/dialog';
import { FormGroup } from '@angular/forms';
import { ContactDialog } from './contact-dialog';
import { ContactService } from '../services/contact.service';

describe('ContactDialog', () => {
  const dialogRef = { close: jest.fn() };
  const contactService = { createContact: jest.fn(), getContactsSummary: jest.fn() };
  let component: ContactDialog;

  const form = (): FormGroup =>
    (component as unknown as { contactForm: FormGroup }).contactForm;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    contactService.getContactsSummary.mockReturnValue(of([]));
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

  it('initializes form defaults, validators and error state', () => {
    const f = form();
    // Defaults
    expect(f.controls['first_name'].value).toBe('');
    expect(f.controls['last_name'].value).toBe('');
    expect(f.controls['email'].value).toBe('');
    expect(f.controls['phone_number'].value).toBe('');
    expect(f.controls['service'].value).toBeNull(); // FormBuilder normalizes undefined -> null
    const c = component as unknown as {
      hasError: boolean; errorMessage: string; serviceOptions: string[];
    };
    expect(c.hasError).toBe(false);
    expect(c.errorMessage).toBe('');
    expect(c.serviceOptions.length).toBeGreaterThan(0);

    // Validators: required on first_name, email, service; none on last_name.
    expect(f.controls['first_name'].hasError('required')).toBe(true);
    f.controls['first_name'].setValue('Ada');
    expect(f.controls['first_name'].valid).toBe(true);
    expect(f.controls['last_name'].valid).toBe(true);
    expect(f.controls['email'].hasError('required')).toBe(true);
    f.controls['email'].setValue('not-an-email');
    expect(f.controls['email'].hasError('email')).toBe(true);
    f.controls['email'].setValue('ada@example.com');
    expect(f.controls['email'].valid).toBe(true);
    f.controls['phone_number'].setValue('123');
    expect(f.controls['phone_number'].hasError('phoneNumber')).toBe(true);
    f.controls['phone_number'].setValue('1234567890');
    expect(f.controls['phone_number'].valid).toBe(true);
    expect(f.controls['service'].hasError('required')).toBe(true);
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


  it('shows the spinner and blocks a second submit while the request is in flight', () => {
    fillValid();
    const inflight = new Subject<unknown>();
    contactService.createContact.mockReturnValue(inflight.asObservable());
    component.createContact();
    const c = component as unknown as { submitting: boolean };
    expect(c.submitting).toBe(true);
    // A second click (or a spam re-invoke) issues no further request.
    component.createContact();
    expect(contactService.createContact).toHaveBeenCalledTimes(1);
    // cancel is a no-op while submitting.
    component.cancel();
    expect(dialogRef.close).not.toHaveBeenCalled();
    inflight.next({ id: 'c-1' });
  });

  it('clears submitting on error so the user can retry', () => {
    fillValid();
    contactService.createContact.mockReturnValue(throwError(() => ({ status: 500 })));
    component.createContact();
    expect((component as unknown as { submitting: boolean }).submitting).toBe(false);
  });

  describe('possible-duplicate name warning', () => {
    const existing = [
      { id: 'c-1', first_name: 'Ada', last_name: 'Lovelace', service: 'Tutoring', status: 'Past Student' },
      { id: 'c-2', first_name: 'Sam', last_name: 'Roe', service: 'Hiring', status: 'Staff' },
    ];

    const withExisting = () => {
      contactService.getContactsSummary.mockReturnValue(of(existing));
      component.ngOnInit();
    };

    it('warns on a name match and only creates on the second click', () => {
      withExisting();
      contactService.createContact.mockReturnValue(of({ id: 'new' }));
      fillValid(); // Ada Lovelace — matches c-1
      component.createContact();
      expect(contactService.createContact).not.toHaveBeenCalled();
      const c = component as unknown as { duplicateMatches: string[] };
      // Legacy parent status displays mapped, like the chips.
      expect(c.duplicateMatches).toEqual(['Ada Lovelace (Tutoring, Former Client)']);
      component.createContact(); // Create Anyway
      expect(contactService.createContact).toHaveBeenCalled();
    });

    it('matches case- and whitespace-insensitively incl. staff labels', () => {
      withExisting();
      contactService.createContact.mockReturnValue(of({ id: 'new' }));
      fillValid();
      form().patchValue({ first_name: '  sam ', last_name: 'ROE' });
      component.createContact();
      expect((component as unknown as { duplicateMatches: string[] }).duplicateMatches)
        .toEqual(['Sam Roe (Hiring, Active Staff)']);
    });

    it('editing the name re-arms the warning', () => {
      withExisting();
      contactService.createContact.mockReturnValue(of({ id: 'new' }));
      fillValid();
      component.createContact(); // warned + armed
      form().controls['first_name'].setValue('Adaline'); // re-arms
      component.createContact(); // no match now -> creates directly
      expect(contactService.createContact).toHaveBeenCalledTimes(1);
      expect((component as unknown as { duplicateMatches: string[] }).duplicateMatches).toEqual([]);
    });

    it('creates straight through when no name matches', () => {
      withExisting();
      contactService.createContact.mockReturnValue(of({ id: 'new' }));
      fillValid();
      form().patchValue({ first_name: 'Unique', last_name: 'Person' });
      component.createContact();
      expect(contactService.createContact).toHaveBeenCalledTimes(1);
    });

    it('fails open when the summary cannot load', () => {
      contactService.getContactsSummary.mockReturnValue(throwError(() => new Error('x')));
      component.ngOnInit();
      contactService.createContact.mockReturnValue(of({ id: 'new' }));
      fillValid();
      component.createContact();
      expect(contactService.createContact).toHaveBeenCalledTimes(1);
    });
  });
});
