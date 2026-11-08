import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { SetCatalogView } from 'contract';
import { SetListPicker } from './set-list-picker';

// The draft specs' harness has the picker ask again every few milliseconds;
// this checks the pace it keeps in the app.
/** The request for the sets on Arena. */
const ARENA_SETS = '/api/sets?platform=Arena';

describe('the set list picker, at its own pace', () => {
  afterEach(() => vi.useRealTimers());

  it('asks again for the sets every 3 seconds while their cards are being counted', async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SetListPicker);
    fixture.componentRef.setInput('platform', 'Arena');
    const counting: SetCatalogView = { sets: [], counting: true };

    TestBed.tick();
    http.expectOne(ARENA_SETS).flush(counting);
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(2999);
    TestBed.tick();
    http.expectNone(ARENA_SETS);
    await vi.advanceTimersByTimeAsync(1);
    TestBed.tick();

    http.expectOne(ARENA_SETS).flush({ sets: [], counting: false });
    http.verify();
  });
});
