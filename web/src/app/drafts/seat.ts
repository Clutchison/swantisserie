import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import type { PlayerView } from 'contract';
import { LoadedAvatars } from './loaded-avatars';
import { PlayerAvatar } from './player-avatar';

/** A seat's avatar's width and height, in CSS pixels; its styles read it as `--avatar-size`. */
const AVATAR_SIZE = 24;

/**
 * A seat, as the Seat strip and the Board tab show it: its player's avatar,
 * or a disc with their initial until the avatar loads, or if it fails or is
 * missing. Focusable, so a keyboard user can bring up the player's name as a
 * mouse user does: hovered or focused, it gives itself as `nameHint`, for a
 * `SeatHint` to show the name under. A screen reader names it by its player,
 * whether they are a bot or the viewer's own, then its `extraNameParts`, such
 * as the Seat strip's "picking". Its host marks anything else, such as whose
 * turn it is, on it: the seat is the host element, and `--seat-focus-offset`
 * says how far out its focus outline sits.
 */
@Component({
  selector: 'app-seat',
  imports: [PlayerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="initial">{{ initial() }}</span>
    <app-player-avatar
      [src]="player().avatarUrl"
      [size]="avatarSize"
      (loaded)="loadedAvatars.add(player().avatarUrl)"
    />
  `,
  styleUrl: './seat.scss',
  host: {
    role: 'img',
    tabindex: '0',
    '[attr.aria-label]': 'accessibleName()',
    '[class.avatar-shown]': 'loadedAvatars.has(player().avatarUrl)',
    '[style.--avatar-size.px]': 'avatarSize',
    '(mouseenter)': 'showName()',
    '(mouseleave)': 'nameHint.emit(null)',
    '(focus)': 'showName()',
    '(blur)': 'nameHint.emit(null)',
  },
})
export class Seat {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly loadedAvatars = inject(LoadedAvatars);
  protected readonly avatarSize = AVATAR_SIZE;

  readonly player = input.required<PlayerView>();
  /** Whether the player is the viewer: their own seat. */
  readonly own = input(false);
  /** What else a screen reader names the seat, after who its player is. */
  readonly extraNameParts = input<readonly string[]>([]);
  /** The seat as it is hovered or focused, to show its player's name under; null as it no longer is. */
  readonly nameHint = output<HTMLElement | null>();

  protected readonly accessibleName = computed(() => {
    const player = this.player();
    return [
      player.name,
      ...(player.isBot ? ['bot'] : []),
      ...(this.own() ? ['you'] : []),
      ...this.extraNameParts(),
    ].join(', ');
  });

  /** The player's initial, shown while their avatar is missing or hasn't loaded. */
  protected readonly initial = computed(() => {
    const [first] = new Intl.Segmenter().segment(this.player().name);
    return first?.segment.toUpperCase() ?? '';
  });

  protected showName() {
    this.nameHint.emit(this.element);
  }
}
