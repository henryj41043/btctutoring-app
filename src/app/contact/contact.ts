import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, OnInit} from '@angular/core';
import {ContactService} from '../services/contact.service';
import {catchError, EMPTY} from 'rxjs';
import {FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Contact as _Contact} from '../models/contact.model';
import {MatInputModule} from '@angular/material/input';
import {Service} from '../enums/service.enum';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatButtonModule} from '@angular/material/button';
import {MatSelectModule} from '@angular/material/select';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {StudentService} from '../services/student.service';
import {NoteService} from '../services/note.service';
import {Student} from '../models/student.model';
import {Note} from '../models/note.model';
import {Status} from '../enums/status.enum';
import {Package} from '../enums/package.enum';
import {MatCheckbox} from '@angular/material/checkbox';
import {BillingCycle} from '../enums/billing-cycle.enum';

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
    MatCheckbox,
  ],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Contact implements OnInit {
  @Input() id!: string;

  private contactService: ContactService = inject(ContactService);
  private studentService: StudentService = inject(StudentService);
  private noteService: NoteService = inject(NoteService);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  protected serviceOptions: string[] = Object.values(Service);
  protected statusOptions: string[] = Object.values(Status);
  protected packageOptions: string[] = Object.values(Package);
  protected billingCycleOptions: string[] = Object.values(BillingCycle);
  protected tutorOptions: string[] = ['Peach', 'Yoshi'];
  protected contactLoading: boolean = true;
  protected studentsLoading: boolean = true;
  protected notesLoading: boolean = true;
  protected contactForm: FormGroup = this.formBuilder.group({
    id: ['', Validators.required],
    first_name: ['', Validators.required],
    last_name: [''],
    email: ['', [Validators.required, Validators.email]],
    phone_number: [''],
    service: ['', Validators.required],
    monthly_charge: 0,
    charge_per_billing_cycle: 0,
    amount_to_be_paid_this_month: 0,
    billing_cycle: '',
    cc_authorization_received: false,
    twenty_five_deducted: false,
    payment_one_received: false,
    payment_two_received: false,
    payment_three_received: false,
    payment_four_received: false,
    special_circumstance: '',
    scholarship_state: '',
    invoice_Month: '',
    date_funds_requested_by_btc: '',
    date_funds_requested_by_family: '',
    invoice_number: '',
    invoice_paid_date: '',
  });
  protected studentsForm: FormGroup = this.formBuilder.group({
    students: this.formBuilder.array([])
  });
  protected notesForm: FormGroup = this.formBuilder.group({
    notes: this.formBuilder.array([])
  });
  protected notesEditIndex: number = -1;
  protected studentsEditIndex: number = -1;

  ngOnInit() {
    this.loadContact();
    this.loadStudents();
    this.loadNotes();
  }

  get notes(): FormArray {
    return this.notesForm.controls['notes'] as FormArray;
  }

  get students(): FormArray {
    return this.studentsForm.controls['students'] as FormArray;
  }

  private loadContact() {
    this.contactService.getContact(this.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(contacts => {
      this.buildContactForm(contacts[0]);
      this.contactLoading = false;
    });
  }

  private buildContactForm(contact: _Contact) {
    this.contactForm.controls['id'].setValue(contact.id);
    this.contactForm.controls['first_name'].setValue(contact.first_name);
    this.contactForm.controls['last_name'].setValue(contact.last_name);
    this.contactForm.controls['email'].setValue(contact.email);
    this.contactForm.controls['phone_number'].setValue(contact.phone_number);
    this.contactForm.controls['service'].setValue(contact.service);
    this.contactForm.controls['monthly_charge'].setValue(contact.monthly_charge);
    this.contactForm.controls['charge_per_billing_cycle'].setValue(contact.charge_per_billing_cycle);
    this.contactForm.controls['amount_to_be_paid_this_month'].setValue(contact.amount_to_be_paid_this_month);
    this.contactForm.controls['billing_cycle'].setValue(contact.billing_cycle);
    this.contactForm.controls['cc_authorization_received'].setValue(contact.cc_authorization_received);
    this.contactForm.controls['twenty_five_deducted'].setValue(contact.twenty_five_deducted);
    this.contactForm.controls['payment_one_received'].setValue(contact.payment_one_received);
    this.contactForm.controls['payment_two_received'].setValue(contact.payment_two_received);
    this.contactForm.controls['payment_three_received'].setValue(contact.payment_three_received);
    this.contactForm.controls['payment_four_received'].setValue(contact.payment_four_received);
    this.contactForm.controls['special_circumstance'].setValue(contact.special_circumstance);
    this.contactForm.controls['scholarship_state'].setValue(contact.scholarship_state);
    this.contactForm.controls['invoice_Month'].setValue(contact.invoice_Month);
    this.contactForm.controls['date_funds_requested_by_btc'].setValue(contact.date_funds_requested_by_btc);
    this.contactForm.controls['date_funds_requested_by_family'].setValue(contact.date_funds_requested_by_family);
    this.contactForm.controls['invoice_number'].setValue(contact.invoice_number);
    this.contactForm.controls['invoice_paid_date'].setValue(contact.invoice_paid_date);
    this.contactForm.updateValueAndValidity();
  }

  private loadStudents() {
    this.studentService.getStudentsByContact(this.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(students => {
      this.buildStudentsFormArray(students);
      this.studentsLoading = false;
    });
  }

  private buildStudentsFormArray(students: Student[]) {
    students.forEach(student => {
      this.students.push(this.formBuilder.group({
        id: [student.id, Validators.required],
        contact_id: [student.contact_id, Validators.required],
        name: [student.name, Validators.required],
        birthday: student.birthday,
        status: [student.status, Validators.required],
        assigned_tutor_id: student.assigned_tutor_id,
        package: student.package,
        scholarship: student.scholarship,
        available_minutes: student.available_minutes,
        make_up_minutes: student.make_up_minutes,
      }));
    });
    this.students.updateValueAndValidity();
  }

  private loadNotes() {
    this.noteService.getNotesByRecipient(this.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(notes => {
      this.buildNotesFormArray(notes);
      this.notesLoading = false;
    });
  }

  private buildNotesFormArray(notes: Note[]) {
    notes.forEach(note => {
      this.notes.push(this.formBuilder.group({
        id: [note.id, Validators.required],
        message: note.message,
        date_time: note.date_time,
        author: note.author,
        author_id: note.author_id,
        recipient: note.recipient,
        recipient_id: note.recipient_id,
        type: note.type,
      }));
    });
  }

  setNotesEditIndex(index: number) {
    this.notesEditIndex = index;
    this.cdr.markForCheck();
  }

  setStudentsEditIndex(index: number) {
    this.studentsEditIndex = index;
    this.cdr.markForCheck();
  }

  deleteNoteAt(index: number) {
    this.notes.removeAt(index);
    this.notes.updateValueAndValidity();
  }

  deleteStudentAt(index: number) {
    this.students.removeAt(index);
    this.students.updateValueAndValidity();
  }

  saveNoteAt(index: number) {
    // make call to update note
    this.setNotesEditIndex(-1);
    console.log(this.notes.controls.at(index)?.value);
  }

  saveStudentAt(index: number) {
    // make service call to update student
    this.setStudentsEditIndex(-1);
    console.log(this.students.controls.at(index)?.value);
  }

  addNote() {
    this.notes.push(this.formBuilder.group({
      id: '',
      message: '',
      date_time: '',
      author: 'This is a TEST',
      author_id: '',
      recipient: '',
      recipient_id: '',
      type: '',
    }));
    this.notes.updateValueAndValidity();
    this.setNotesEditIndex(this.notes.controls.length - 1);
  }

  addStudent() {
    this.students.push(this.formBuilder.group({
      id: '',
      contact_id: this.id,
      name: ['', Validators.required],
      birthday: '',
      status: ['', Validators.required],
      assigned_tutor_id: '',
      package: ['', Validators.required],
      scholarship: false,
      available_minutes: 0,
      make_up_minutes: 0
    }));
    this.students.updateValueAndValidity();
    this.setStudentsEditIndex(this.students.controls.length - 1);
  }
}
