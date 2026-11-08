/**
 * Setup for the Stryker-only vitest config (#544). `ng test`'s builder sets up
 * TestBed itself; plain vitest doesn't, so do it here. Imports are hoisted, so
 * the usual setup runs before `setupTestBed()`: safe, as it never touches TestBed.
 */
import '@angular/compiler';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import './test-setup';

setupTestBed();
