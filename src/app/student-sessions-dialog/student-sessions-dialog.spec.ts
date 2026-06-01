import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting} from '@angular/common/http/testing';
import {StudentSessionsDialog} from './student-sessions-dialog';
import {Student} from '../models/student.model';

const mockStudent: Student = {
  id: 'test-id',
  name: 'Test Student',
  status: undefined,
  package: undefined,
  available_minutes: 120,
  make_up_minutes: 0,
};

describe('StudentSessionsDialog', () => {
  let component: StudentSessionsDialog;
  let fixture: ComponentFixture<StudentSessionsDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentSessionsDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {provide: MAT_DIALOG_DATA, useValue: mockStudent},
        {provide: MatDialogRef, useValue: {}},
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StudentSessionsDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the student name in the title', () => {
    const title: HTMLElement = fixture.nativeElement.querySelector('[mat-dialog-title]');
    expect(title.textContent).toContain('Test Student');
  });

  it('should start in loading state', () => {
    const freshFixture = TestBed.createComponent(StudentSessionsDialog);
    const freshComponent = freshFixture.componentInstance;
    expect((freshComponent as any).loading).toBeTrue();
  });
});
