import { Routes } from '@angular/router';
import {EventCalendar} from './event-calendar/event-calendar';
import {Login} from './login/login';
import {AuthGuard} from './guards/auth.guard';
import {SessionsTable} from './sessions-table/sessions-table';
import {ClientsTable} from './clients-table/clients-table';

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
    path: 'sessions',
    component: SessionsTable,
    canActivate: [AuthGuard],
  },
  {
    path: 'clients',
    component: ClientsTable,
    canActivate: [AuthGuard],
  },
  {
    path: '**',
    redirectTo: '/login',
  }
];
