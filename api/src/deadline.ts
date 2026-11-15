/** A deadline passed before the work raced against it settled. */
export class DeadlinePassedError extends Error {
  constructor(name: string) {
    super(`The ${name} deadline passed.`);
  }
}

/**
 * A point in time, `ms` after it is set, that work waits for no longer
 * than: a request path's outside calls, or shutdown's wait for queued
 * announcements. Racing work against it stops the wait but doesn't
 * cancel the work, which may still settle, and fill a cache, later. Several
 * pieces of work raced against one deadline share its time.
 */
export class Deadline {
  /** When the deadline passes (ms since epoch). */
  readonly endsAt: number;
  private readonly holdsProcess: boolean;

  /**
   * `name` says what the deadline is for, as its error and logs name it.
   * A race against it doesn't keep the process alive, unless `holdsProcess`:
   * then the process lives until the deadline passes, so whatever follows it
   * still runs, as a shutdown's does when nothing else holds the process.
   */
  constructor(
    readonly name: string,
    ms: number,
    { holdsProcess = false }: { holdsProcess?: boolean } = {},
  ) {
    this.endsAt = Date.now() + ms;
    this.holdsProcess = holdsProcess;
  }

  /** Whether the deadline has passed. */
  get passed(): boolean {
    return Date.now() >= this.endsAt;
  }

  /**
   * What `work` answers, or throws `passedError()` (DeadlinePassedError
   * unless given) if the deadline passes before `work` settles, or had
   * already passed, even if `work` has settled.
   */
  race<T>(
    work: Promise<T>,
    passedError: () => Error = () => new DeadlinePassedError(this.name),
  ): Promise<T> {
    if (this.passed) {
      // Nobody waits on work any more, so its failure is no one's to handle.
      work.catch(() => {});
      return Promise.reject(passedError());
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const passed = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(passedError()),
        Math.max(0, this.endsAt - Date.now()),
      );
      // A request's deadline shouldn't hold the process open by itself.
      if (!this.holdsProcess) timer.unref?.();
    });
    return Promise.race([work, passed]).finally(() => clearTimeout(timer));
  }
}
