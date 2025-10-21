import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventCalendar } from './event-calendar';

describe('EventCalendar', () => {
  let component: EventCalendar;
  let fixture: ComponentFixture<EventCalendar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventCalendar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventCalendar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
