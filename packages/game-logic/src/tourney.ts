export enum TourneyStatus {
  WAITING = "waiting",
  STARTING = "starting",
  IN_PROGRESS = "in_progress",
  BETWEEN_GAMES = "between_games",
  COMPLETED = "completed",
}

export interface SeatData {
  position: number;
  playerId: string | null;
  playerName: string | null;
  connectionId: string | null;
  score: number;
  gamesWon: number;
  lastGamePoints: number;
  ready: boolean;
  disconnectedAt?: number;
  isBot: boolean;
  botProfile?: string;
}

export class Seat {
  position: number;
  playerId: string | null;
  playerName: string | null;
  connectionId: string | null;
  score: number;
  gamesWon: number;
  lastGamePoints: number;
  ready: boolean;
  disconnectedAt?: number;
  isBot: boolean;
  botProfile?: string;

  constructor(position: number, data?: Partial<SeatData>) {
    this.position = position;
    this.playerId = data?.playerId ?? null;
    this.playerName = data?.playerName ?? null;
    this.connectionId = data?.connectionId ?? null;
    this.score = data?.score ?? 0;
    this.gamesWon = data?.gamesWon ?? 0;
    this.lastGamePoints = data?.lastGamePoints ?? 0;
    this.ready = data?.ready ?? false;
    this.disconnectedAt = data?.disconnectedAt;
    this.isBot = data?.isBot ?? false;
    this.botProfile = data?.botProfile;
  }

  isOccupied(): boolean {
    return this.playerId !== null;
  }

  isEmpty(): boolean {
    return this.playerId === null;
  }

  clear(): void {
    this.playerId = null;
    this.playerName = null;
    this.connectionId = null;
    this.score = 0;
    this.gamesWon = 0;
    this.lastGamePoints = 0;
    this.ready = false;
    this.isBot = false;
    this.botProfile = undefined;
    this.disconnectedAt = undefined;
  }

  toDict(): SeatData {
    const result: SeatData = {
      position: this.position,
      playerId: this.playerId,
      playerName: this.playerName,
      connectionId: this.connectionId,
      score: this.score,
      gamesWon: this.gamesWon,
      lastGamePoints: this.lastGamePoints,
      ready: this.ready,
      isBot: this.isBot,
    };
    if (this.disconnectedAt !== undefined)
      result.disconnectedAt = this.disconnectedAt;
    if (this.botProfile !== undefined) result.botProfile = this.botProfile;
    return result;
  }

  static fromDict(data: SeatData): Seat {
    return new Seat(data.position, data);
  }
}

type Result = [success: boolean, error: string];
type ClaimResult = [success: boolean, error: string, position: number | null];

export class Tourney {
  static readonly GLOBAL_ID = "global";
  static readonly TARGET_SCORE = 21;
  static readonly SEATS_COUNT = 4;

  tourneyId: string;
  status: TourneyStatus;
  targetScore: number;
  seats: Seat[];
  currentGame: Record<string, unknown> | null;
  gameHistory: Record<string, unknown>[];

  constructor(tourneyId = Tourney.GLOBAL_ID) {
    this.tourneyId = tourneyId;
    this.status = TourneyStatus.WAITING;
    this.targetScore = Tourney.TARGET_SCORE;
    this.seats = Array.from({ length: Tourney.SEATS_COUNT }, (_, i) => new Seat(i));
    this.currentGame = null;
    this.gameHistory = [];
  }

  static fromDynamo(item: Record<string, unknown>): Tourney {
    const tourney = new Tourney(item.tourneyId as string);
    tourney.status =
      (item.status as TourneyStatus) ?? TourneyStatus.WAITING;
    tourney.targetScore = Number(item.targetScore ?? Tourney.TARGET_SCORE);

    const seatsData = (item.seats as SeatData[]) ?? [];
    tourney.seats = seatsData.map((s) => Seat.fromDict(s));
    while (tourney.seats.length < Tourney.SEATS_COUNT) {
      tourney.seats.push(new Seat(tourney.seats.length));
    }

    tourney.currentGame =
      (item.currentGame as Record<string, unknown>) ?? null;
    tourney.gameHistory =
      (item.gameHistory as Record<string, unknown>[]) ?? [];

    return tourney;
  }

  toDynamo(): Record<string, unknown> {
    return {
      tourneyId: this.tourneyId,
      status: this.status,
      targetScore: this.targetScore,
      seats: this.seats.map((s) => s.toDict()),
      currentGame: this.currentGame,
      gameHistory: this.gameHistory,
    };
  }

  claimSeat(
    playerId: string,
    playerName: string,
    connectionId: string,
    seatPosition?: number,
  ): ClaimResult {
    if (
      this.status !== TourneyStatus.WAITING &&
      this.status !== TourneyStatus.STARTING
    ) {
      return [false, "TOURNEY_IN_PROGRESS", null];
    }

    // Check if player already has a seat
    const existing = this.getSeatByPlayer(playerId);
    if (existing) {
      existing.connectionId = connectionId;
      return [true, "", existing.position];
    }

    let targetSeat: Seat | null;
    if (seatPosition !== undefined) {
      if (seatPosition < 0 || seatPosition >= Tourney.SEATS_COUNT) {
        return [false, "INVALID_SEAT", null];
      }
      if (this.seats[seatPosition].isOccupied()) {
        return [false, "SEAT_TAKEN", null];
      }
      targetSeat = this.seats[seatPosition];
    } else {
      targetSeat = this.getFirstEmptySeat();
      if (!targetSeat) return [false, "TOURNEY_FULL", null];
    }

    targetSeat.playerId = playerId;
    targetSeat.playerName = playerName;
    targetSeat.connectionId = connectionId;
    targetSeat.score = 0;
    targetSeat.gamesWon = 0;
    targetSeat.lastGamePoints = 0;
    targetSeat.ready = false;

    if (this.getOccupiedCount() === Tourney.SEATS_COUNT) {
      if (this.status === TourneyStatus.WAITING) {
        this.status = TourneyStatus.STARTING;
      }
    }

    return [true, "", targetSeat.position];
  }

  leaveTourney(playerId: string): Result {
    const seat = this.getSeatByPlayer(playerId);
    if (!seat) return [false, "NOT_IN_TOURNEY"];

    if (
      this.status === TourneyStatus.WAITING ||
      this.status === TourneyStatus.STARTING
    ) {
      seat.clear();
      if (this.getOccupiedCount() < Tourney.SEATS_COUNT) {
        this.status = TourneyStatus.WAITING;
      }
      return [true, ""];
    }

    return [false, "TOURNEY_IN_PROGRESS"];
  }

  addBot(seatPosition: number, botProfile?: string): Result {
    if (
      this.status !== TourneyStatus.WAITING &&
      this.status !== TourneyStatus.STARTING
    ) {
      return [false, "TOURNEY_IN_PROGRESS"];
    }
    if (seatPosition < 0 || seatPosition >= Tourney.SEATS_COUNT) {
      return [false, "INVALID_SEAT"];
    }
    const seat = this.seats[seatPosition];
    if (seat.isOccupied()) return [false, "SEAT_TAKEN"];

    const botId = `bot_${crypto.randomUUID().slice(0, 8)}`;
    seat.playerId = botId;
    seat.playerName = `Bot_${seatPosition + 1}`;
    seat.connectionId = null;
    seat.score = 0;
    seat.gamesWon = 0;
    seat.lastGamePoints = 0;
    seat.ready = true;
    seat.isBot = true;
    seat.botProfile = botProfile;

    if (this.getOccupiedCount() === Tourney.SEATS_COUNT) {
      if (this.status === TourneyStatus.WAITING) {
        this.status = TourneyStatus.STARTING;
      }
    }

    return [true, ""];
  }

  kickBot(seatPosition: number): Result {
    if (
      this.status !== TourneyStatus.WAITING &&
      this.status !== TourneyStatus.STARTING
    ) {
      return [false, "TOURNEY_IN_PROGRESS"];
    }
    if (seatPosition < 0 || seatPosition >= Tourney.SEATS_COUNT) {
      return [false, "INVALID_SEAT"];
    }
    const seat = this.seats[seatPosition];
    if (!seat.isOccupied()) return [false, "SEAT_EMPTY"];
    if (!seat.isBot) return [false, "NOT_A_BOT"];

    seat.clear();
    if (this.getOccupiedCount() < Tourney.SEATS_COUNT) {
      this.status = TourneyStatus.WAITING;
    }

    return [true, ""];
  }

  setReady(playerId: string, ready = true): Result {
    const seat = this.getSeatByPlayer(playerId);
    if (!seat) return [false, "NOT_IN_TOURNEY"];

    if (
      this.status !== TourneyStatus.STARTING &&
      this.status !== TourneyStatus.BETWEEN_GAMES
    ) {
      return [false, "INVALID_STATE"];
    }

    seat.ready = ready;

    if (this.areAllReady()) {
      this.status = TourneyStatus.IN_PROGRESS;
    }

    return [true, ""];
  }

  completeGame(winOrder: number[]): [success: boolean, tournamentComplete: boolean] {
    if (!this.currentGame) return [false, false];

    const pointsAwarded = [4, 2, 1, 0];
    for (let i = 0; i < winOrder.length; i++) {
      const seat = this.seats[winOrder[i]];
      const points = pointsAwarded[i];
      seat.score += points;
      seat.lastGamePoints = points;
      if (i === 0) seat.gamesWon++;
    }

    this.gameHistory.push({
      gameNumber: this.gameHistory.length + 1,
      winOrder,
      pointsAwarded,
    });

    this.currentGame = null;

    const maxScore = Math.max(...this.seats.map((s) => s.score));
    const tournamentComplete = maxScore >= this.targetScore;

    this.status = tournamentComplete
      ? TourneyStatus.COMPLETED
      : TourneyStatus.BETWEEN_GAMES;

    return [true, tournamentComplete];
  }

  getLeaderboard(): Array<{
    position: number;
    playerName: string | null;
    totalScore: number;
    lastGamePoints: number;
    gamesWon: number;
  }> {
    return this.seats
      .filter((s) => s.isOccupied())
      .map((s) => ({
        position: s.position,
        playerName: s.playerName,
        totalScore: s.score,
        lastGamePoints: s.lastGamePoints,
        gamesWon: s.gamesWon,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  toClientState(): Record<string, unknown> {
    return {
      status: this.status,
      seats: this.seats.map((s) => ({
        position: s.position,
        playerName: s.playerName,
        score: s.score,
        gamesWon: s.gamesWon,
        ready: s.ready,
        isBot: s.isBot,
      })),
      targetScore: this.targetScore,
      currentGameNumber:
        this.gameHistory.length + (this.currentGame ? 1 : 0),
      readyCount: this.getReadyCount(),
    };
  }

  // ── Helpers ──

  getSeatByPlayer(playerId: string): Seat | null {
    return this.seats.find((s) => s.playerId === playerId) ?? null;
  }

  getFirstEmptySeat(): Seat | null {
    return this.seats.find((s) => s.isEmpty()) ?? null;
  }

  getOccupiedCount(): number {
    return this.seats.filter((s) => s.isOccupied()).length;
  }

  getReadyCount(): number {
    return this.seats.filter((s) => s.isOccupied() && s.ready).length;
  }

  areAllReady(): boolean {
    const occupied = this.seats.filter((s) => s.isOccupied());
    if (occupied.length === 0) return false;
    return occupied.every((s) => s.ready);
  }
}
