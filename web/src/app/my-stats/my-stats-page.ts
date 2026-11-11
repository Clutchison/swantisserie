import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MyStatsView } from 'contract';
import { CompletionDatePipe } from '../completion-date';
import { LoadingAnimation } from '../loading/loading-animation';
import { poolSourceHeader } from '../pool-source-header';
import { percent, place, record } from '../record';

/**
 * My stats: the signed-in player's own results across complete
 * tournaments, which only they can see. Fetched afresh on each visit.
 */
@Component({
  selector: 'app-my-stats-page',
  imports: [CompletionDatePipe, LoadingAnimation, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-stats-page.html',
  styleUrls: ['../page.scss', './my-stats-page.scss'],
})
export class MyStatsPage {
  protected readonly stats = httpResource<MyStatsView>(() => '/api/my-stats');
  protected readonly record = record;
  protected readonly place = place;
  protected readonly poolSourceHeader = poolSourceHeader;

  /** A rate as the page shows it, or a dash when there is nothing to count it over. */
  protected rate(value: number | null): string {
    return value === null ? '–' : percent(value);
  }
}
