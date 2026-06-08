import {Component, inject} from '@angular/core';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {catchError, EMPTY} from 'rxjs';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {provideNativeDateAdapter} from '@angular/material/core';
import {Service} from '../enums/service.enum';
import {ContactService} from '../services/contact.service';
import {Contact} from '../models/contact.model';
import {PhoneFormatDirective} from '../directives/phone-format.directive';
import {phoneValidator} from '../utils/phone.util';

@Component({
  selector: 'app-contact-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatSelectModule,
    PhoneFormatDirective,
  ],
  templateUrl: './contact-dialog.html',
  styleUrl: './contact-dialog.scss'
})
export class ContactDialog {
  readonly dialogRef = inject(MatDialogRef<ContactDialog>);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private contactService: ContactService = inject(ContactService);

  protected contactForm: FormGroup = this.formBuilder.group({
    first_name: ['', Validators.required],
    last_name: [''],
    email: ['', [Validators.required, Validators.email]],
    phone_number: ['', phoneValidator],
    service: [undefined, Validators.required],
  });
  protected serviceOptions: string[] = Object.values(Service);

  cancel(): void {
    this.dialogRef.close();
  }

  createContact(): void {
    if (this.contactForm.valid) {
      let contact: Contact = this.contactForm.value as Contact;
      this.contactService.createContact(contact).pipe(
        catchError(error =>  {
          console.log(error);
          // TODO: show error message in dialog view
          return EMPTY;
        })
      ).subscribe(response => {
        this.dialogRef.close(response);
      });
    }
  }
}
