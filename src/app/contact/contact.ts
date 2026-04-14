import {Component, inject, Input, OnInit} from '@angular/core';
import {ContactService} from '../services/contact.service';
import {catchError, EMPTY} from 'rxjs';
import {FormBuilder, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {Contact as _Contact} from '../models/contact.model';
import {MatInputModule} from '@angular/material/input';
import {Service} from '../enums/service.enum';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatButtonModule} from '@angular/material/button';
import {MatSelectModule} from '@angular/material/select';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';

@Component({
  selector: 'app-contact',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
  ],
  templateUrl: './contact.html',
  styleUrl: './contact.scss'
})
export class Contact implements OnInit {
  @Input() id!: string;

  private contactService: ContactService = inject(ContactService);
  private formBuilder: FormBuilder = inject(FormBuilder);
  protected contactForm!: FormGroup;
  protected serviceOptions: string[] = Object.values(Service);

  ngOnInit() {
    this.contactService.getContact(this.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(contacts => {
      this.buildFormFromContact(contacts[0]);
    });
  }

  private buildFormFromContact(contact: _Contact) {
    this.contactForm = this.formBuilder.nonNullable.group({
      id: [contact.id],
      first_name: [contact.first_name],
      last_name: [contact.last_name],
      email: [contact.email],
      phone_number: [contact.phone_number],
      service: [contact.service],
    });
  }
}
