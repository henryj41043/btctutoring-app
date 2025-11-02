import { Routes } from '@angular/router';
import {EventCalendar} from './event-calendar/event-calendar';
import {Login} from './login/login';
import {AuthGuard} from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: Login,
  },
  {
    path: 'calendar',
    component: EventCalendar,
    canActivate: [AuthGuard],
  },
  {
    path: '**',
    redirectTo: '/login',
  }
];
