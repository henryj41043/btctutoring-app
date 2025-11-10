import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SessionDialog } from './session-dialog';

describe('SessionDialog', () => {
  let component: SessionDialog;
  let fixture: ComponentFixture<SessionDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SessionDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
