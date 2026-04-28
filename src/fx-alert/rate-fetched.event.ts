export class RateFetchedEvent {
  constructor(
    public readonly pair: string,
    public readonly rate: number,
    public readonly timestamp: Date = new Date(),
  ) {}
}
