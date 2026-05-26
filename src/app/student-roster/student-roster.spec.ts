import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentRoster } from './student-roster';

describe('StudentRoster', () => {
  let component: StudentRoster;
  let fixture: ComponentFixture<StudentRoster>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentRoster]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentRoster);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
