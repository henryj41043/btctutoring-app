import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
  });

  it('creates the root component', () => {
    const component = TestBed.createComponent(App).componentInstance;
    expect(component).toBeTruthy();
  });

  it('exposes the application title', () => {
    const component = TestBed.createComponent(App).componentInstance;
    expect((component as unknown as { title: () => string }).title()).toBe(
      'btctutoring-app',
    );
  });
});
