import { describe, it, expect } from "vitest";
import { Tourney, Seat, TourneyStatus } from "../src/tourney.js";

describe("Seat", () => {
  it("starts empty", () => {
    const seat = new Seat(0);
    expect(seat.isEmpty()).toBe(true);
    expect(seat.isOccupied()).toBe(false);
  });

  it("clear resets all fields", () => {
    const seat = new Seat(0, {
      playerId: "p1",
      playerName: "Alice",
      connectionId: "conn1",
      score: 10,
      gamesWon: 2,
      lastGamePoints: 4,
      ready: true,
      isBot: false,
    });
    seat.clear();
    expect(seat.isEmpty()).toBe(true);
    expect(seat.score).toBe(0);
    expect(seat.ready).toBe(false);
  });

  it("round-trips through toDict/fromDict", () => {
    const seat = new Seat(2, {
      playerId: "p1",
      playerName: "Bob",
      connectionId: "c1",
      score: 5,
      gamesWon: 1,
      lastGamePoints: 2,
      ready: true,
      isBot: true,
      botProfile: "greedy",
    });
    const restored = Seat.fromDict(seat.toDict());
    expect(restored.position).toBe(2);
    expect(restored.playerId).toBe("p1");
    expect(restored.isBot).toBe(true);
    expect(restored.botProfile).toBe("greedy");
  });
});

describe("Tourney", () => {
  it("starts with 4 empty seats in WAITING state", () => {
    const t = new Tourney();
    expect(t.status).toBe(TourneyStatus.WAITING);
    expect(t.seats.length).toBe(4);
    expect(t.getOccupiedCount()).toBe(0);
  });

  describe("claimSeat", () => {
    it("claims first available seat", () => {
      const t = new Tourney();
      const [ok, err, pos] = t.claimSeat("p1", "Alice", "conn1");
      expect(ok).toBe(true);
      expect(err).toBe("");
      expect(pos).toBe(0);
      expect(t.getOccupiedCount()).toBe(1);
    });

    it("claims specific seat", () => {
      const t = new Tourney();
      const [ok, , pos] = t.claimSeat("p1", "Alice", "conn1", 2);
      expect(ok).toBe(true);
      expect(pos).toBe(2);
    });

    it("rejects if seat taken", () => {
      const t = new Tourney();
      t.claimSeat("p1", "Alice", "conn1", 0);
      const [ok, err] = t.claimSeat("p2", "Bob", "conn2", 0);
      expect(ok).toBe(false);
      expect(err).toBe("SEAT_TAKEN");
    });

    it("reconnects existing player", () => {
      const t = new Tourney();
      t.claimSeat("p1", "Alice", "conn1");
      const [ok, , pos] = t.claimSeat("p1", "Alice", "conn2");
      expect(ok).toBe(true);
      expect(pos).toBe(0);
      expect(t.seats[0].connectionId).toBe("conn2");
    });

    it("transitions to STARTING when full", () => {
      const t = new Tourney();
      t.claimSeat("p1", "A", "c1");
      t.claimSeat("p2", "B", "c2");
      t.claimSeat("p3", "C", "c3");
      expect(t.status).toBe(TourneyStatus.WAITING);
      t.claimSeat("p4", "D", "c4");
      expect(t.status).toBe(TourneyStatus.STARTING);
    });

    it("rejects when tourney in progress", () => {
      const t = new Tourney();
      t.status = TourneyStatus.IN_PROGRESS;
      const [ok, err] = t.claimSeat("p1", "A", "c1");
      expect(ok).toBe(false);
      expect(err).toBe("TOURNEY_IN_PROGRESS");
    });
  });

  describe("leaveTourney", () => {
    it("frees seat in waiting state", () => {
      const t = new Tourney();
      t.claimSeat("p1", "Alice", "conn1");
      const [ok] = t.leaveTourney("p1");
      expect(ok).toBe(true);
      expect(t.seats[0].isEmpty()).toBe(true);
    });

    it("reverts STARTING to WAITING", () => {
      const t = new Tourney();
      t.claimSeat("p1", "A", "c1");
      t.claimSeat("p2", "B", "c2");
      t.claimSeat("p3", "C", "c3");
      t.claimSeat("p4", "D", "c4");
      expect(t.status).toBe(TourneyStatus.STARTING);
      t.leaveTourney("p4");
      expect(t.status).toBe(TourneyStatus.WAITING);
    });
  });

  describe("bots", () => {
    it("adds a bot", () => {
      const t = new Tourney();
      const [ok] = t.addBot(1);
      expect(ok).toBe(true);
      expect(t.seats[1].isBot).toBe(true);
      expect(t.seats[1].ready).toBe(true);
      expect(t.seats[1].playerName).toBe("Bot_2");
    });

    it("rejects bot in occupied seat", () => {
      const t = new Tourney();
      t.claimSeat("p1", "Alice", "conn1", 0);
      const [ok, err] = t.addBot(0);
      expect(ok).toBe(false);
      expect(err).toBe("SEAT_TAKEN");
    });

    it("kicks a bot", () => {
      const t = new Tourney();
      t.addBot(2);
      const [ok] = t.kickBot(2);
      expect(ok).toBe(true);
      expect(t.seats[2].isEmpty()).toBe(true);
      expect(t.seats[2].isBot).toBe(false);
    });

    it("rejects kicking a human", () => {
      const t = new Tourney();
      t.claimSeat("p1", "Alice", "conn1", 0);
      const [ok, err] = t.kickBot(0);
      expect(ok).toBe(false);
      expect(err).toBe("NOT_A_BOT");
    });
  });

  describe("ready / game flow", () => {
    it("transitions to IN_PROGRESS when all ready", () => {
      const t = new Tourney();
      t.claimSeat("p1", "A", "c1");
      t.addBot(1);
      t.addBot(2);
      t.addBot(3);
      // Now STARTING (full)
      expect(t.status).toBe(TourneyStatus.STARTING);
      t.setReady("p1");
      // Bots are already ready, so all ready
      expect(t.status).toBe(TourneyStatus.IN_PROGRESS);
    });
  });

  describe("completeGame", () => {
    it("awards points and checks completion", () => {
      const t = new Tourney();
      t.claimSeat("p1", "A", "c1");
      t.claimSeat("p2", "B", "c2");
      t.claimSeat("p3", "C", "c3");
      t.claimSeat("p4", "D", "c4");
      t.currentGame = { dummy: true };

      const [ok, complete] = t.completeGame([0, 1, 2, 3]);
      expect(ok).toBe(true);
      expect(complete).toBe(false);
      expect(t.seats[0].score).toBe(4);
      expect(t.seats[1].score).toBe(2);
      expect(t.seats[2].score).toBe(1);
      expect(t.seats[3].score).toBe(0);
      expect(t.status).toBe(TourneyStatus.BETWEEN_GAMES);
    });

    it("marks tournament complete when target reached", () => {
      const t = new Tourney();
      t.claimSeat("p1", "A", "c1");
      t.claimSeat("p2", "B", "c2");
      t.claimSeat("p3", "C", "c3");
      t.claimSeat("p4", "D", "c4");
      t.seats[0].score = 20; // one game away
      t.currentGame = { dummy: true };

      const [ok, complete] = t.completeGame([0, 1, 2, 3]);
      expect(ok).toBe(true);
      expect(complete).toBe(true);
      expect(t.seats[0].score).toBe(24);
      expect(t.status).toBe(TourneyStatus.COMPLETED);
    });

    it("auto-readies bots after game completion when BETWEEN_GAMES", () => {
      const t = new Tourney();
      t.claimSeat("p1", "Human", "c1");
      t.addBot(1);
      t.addBot(2);
      t.addBot(3);
      t.currentGame = { dummy: true };

      // Complete first game
      const [ok, complete] = t.completeGame([0, 1, 2, 3]);
      expect(ok).toBe(true);
      expect(complete).toBe(false);
      expect(t.status).toBe(TourneyStatus.BETWEEN_GAMES);

      // Bots should be auto-readied
      expect(t.seats[0].ready).toBe(false); // human player
      expect(t.seats[1].ready).toBe(true);  // bot
      expect(t.seats[2].ready).toBe(true);  // bot
      expect(t.seats[3].ready).toBe(true);  // bot
    });

    it("does not auto-ready bots when tournament is COMPLETED", () => {
      const t = new Tourney();
      t.claimSeat("p1", "Human", "c1");
      t.addBot(1);
      t.addBot(2);
      t.addBot(3);
      t.seats[0].score = 20; // one game away from winning

      // Simulate game start (which resets ready flags)
      for (const seat of t.seats) {
        seat.ready = false;
      }
      t.currentGame = { dummy: true };

      // Complete final game
      const [ok, complete] = t.completeGame([0, 1, 2, 3]);
      expect(ok).toBe(true);
      expect(complete).toBe(true);
      expect(t.status).toBe(TourneyStatus.COMPLETED);

      // No seats should be ready (tournament is over, no auto-ready for COMPLETED)
      expect(t.seats[0].ready).toBe(false);
      expect(t.seats[1].ready).toBe(false);
      expect(t.seats[2].ready).toBe(false);
      expect(t.seats[3].ready).toBe(false);
    });
  });

  describe("serialization", () => {
    it("round-trips through toDynamo/fromDynamo", () => {
      const t = new Tourney("test-123");
      t.claimSeat("p1", "Alice", "conn1");
      t.addBot(1);
      t.targetScore = 15;

      const data = t.toDynamo();
      const restored = Tourney.fromDynamo(data);

      expect(restored.tourneyId).toBe("test-123");
      expect(restored.targetScore).toBe(15);
      expect(restored.seats[0].playerName).toBe("Alice");
      expect(restored.seats[1].isBot).toBe(true);
      expect(restored.getOccupiedCount()).toBe(2);
    });
  });

  describe("leaderboard", () => {
    it("returns sorted by score descending", () => {
      const t = new Tourney();
      t.claimSeat("p1", "A", "c1");
      t.claimSeat("p2", "B", "c2");
      t.claimSeat("p3", "C", "c3");
      t.claimSeat("p4", "D", "c4");
      t.seats[0].score = 5;
      t.seats[1].score = 12;
      t.seats[2].score = 3;
      t.seats[3].score = 8;

      const lb = t.getLeaderboard();
      expect(lb[0].playerName).toBe("B");
      expect(lb[1].playerName).toBe("D");
      expect(lb[2].playerName).toBe("A");
      expect(lb[3].playerName).toBe("C");
    });
  });
});
