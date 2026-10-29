import { Routes } from '@angular/router';
import { signedIn } from './auth/auth';
import { SignInPage } from './auth/sign-in-page';
import { StatusPage } from './status/status-page';

export const routes: Routes = [
  { path: '', component: StatusPage, canActivate: [signedIn] },
  { path: 'sign-in', component: SignInPage },
];
