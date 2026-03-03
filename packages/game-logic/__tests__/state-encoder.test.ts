import { describe, it, expect } from "vitest";
import { Rank, Suit } from "../src/card.js";
import type { GameStateSnapshot, CardData } from "../src/types.js";
import { encodeState } from "../src/training/state-encoder.js";
import { STATE_SIZE, DECK_SIZE } from "../src/training/constants.js";

const cd = (rank: number, suit: number): CardData => ({
  rank,
  suit,
  value: rank * 4 + suit,
});

function emptySnapshot(overrides?: Partial<GameStateSnapshot>): GameStateSnapshot {
  return {
    hands: [[], [], [], []],
    currentPlayer: 0,
    lastPlay: null,
    lastPlayBy: -1,
    passedPlayers: [false, false, false, false],
    winOrder: [],
    playersInGame: [true, true, true, true],
    cardsPlayedByPlayer: [[], [], [], []],
    ...overrides,
  };
}

describe("encodeState", () => {
  it("returns Float32Array of STATE_SIZE length", () => {
    const result = encodeState(emptySnapshot(), 0);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(STATE_SIZE);
  });

  it("encodes own hand in first 52 positions", () => {
    const snap = emptySnapshot({
      hands: [
        [cd(Rank.THREE, Suit.SPADES), cd(Rank.TWO, Suit.HEARTS)],
        [],
        [],
        [],
      ],
    });
    const result = encodeState(snap, 0);
    expect(result[0]).toBe(1); // 3♠ = value 0
    expect(result[51]).toBe(1); // 2♥ = value 51
    expect(result[1]).toBe(0); // 3♣ not held
  });

  it("rotates perspective for different playerIndex", () => {
    const snap = emptySnapshot({
      hands: [
        [cd(Rank.THREE, Suit.SPADES)],
        [],
        [cd(Rank.ACE, Suit.HEARTS)],
        [],
      ],
    });

    // From player 2's perspective, own hand is A♥
    const result = encodeState(snap, 2);
    expect(result[Rank.ACE * 4 + Suit.HEARTS]).toBe(1); // A♥ in own hand
    expect(result[0]).toBe(0); // 3♠ is not in player 2's hand
  });

  it("encodes cards played total as union", () => {
    const snap = emptySnapshot({
      cardsPlayedByPlayer: [
        [cd(Rank.THREE, Suit.SPADES)],
        [cd(Rank.KING, Suit.HEARTS)],
        [],
        [],
      ],
    });
    const result = encodeState(snap, 0);
    const totalOffset = DECK_SIZE; // starts at 52
    expect(result[totalOffset + 0]).toBe(1); // 3♠
    expect(result[totalOffset + Rank.KING * 4 + Suit.HEARTS]).toBe(1); // K♥
    expect(result[totalOffset + 1]).toBe(0); // 3♣ not played
  });

  it("encodes per-opponent cards played in relative order", () => {
    const snap = emptySnapshot({
      cardsPlayedByPlayer: [
        [],
        [cd(Rank.FOUR, Suit.CLUBS)], // player 1 played 4♣
        [],
        [cd(Rank.KING, Suit.SPADES)], // player 3 played K♠
      ],
    });

    // From player 0's perspective:
    // rel 1 = abs 1, rel 2 = abs 2, rel 3 = abs 3
    const result = encodeState(snap, 0);
    const oppOffset = DECK_SIZE * 2; // after own hand (52) + total played (52)

    // Opponent slot 0 (rel 1 = abs player 1): 4♣
    expect(result[oppOffset + Rank.FOUR * 4 + Suit.CLUBS]).toBe(1);
    // Opponent slot 2 (rel 3 = abs player 3): K♠
    expect(result[oppOffset + 2 * DECK_SIZE + Rank.KING * 4 + Suit.SPADES]).toBe(1);
  });

  it("rotates opponent cards played for different perspectives", () => {
    const snap = emptySnapshot({
      cardsPlayedByPlayer: [
        [cd(Rank.ACE, Suit.DIAMONDS)], // player 0 played A♦
        [],
        [],
        [],
      ],
    });

    // From player 2's perspective: player 0 is relative slot 2
    const result = encodeState(snap, 2);
    const oppOffset = DECK_SIZE * 2;
    // rel 1 = abs 3, rel 2 = abs 0, rel 3 = abs 1
    // So player 0's cards should be in slot index 1 (rel 2, zero-indexed from rel 1)
    expect(result[oppOffset + 1 * DECK_SIZE + Rank.ACE * 4 + Suit.DIAMONDS]).toBe(1);
  });

  it("encodes opponent hand sizes normalized by 13", () => {
    const snap = emptySnapshot({
      hands: [
        Array.from({ length: 13 }, (_, i) => cd(i, 0)), // player 0: 13 cards
        Array.from({ length: 7 }, (_, i) => cd(i, 1)), // player 1: 7 cards
        [cd(0, 2)], // player 2: 1 card
        [], // player 3: 0 cards
      ],
    });

    const result = encodeState(snap, 0);
    const sizeOffset = DECK_SIZE * 2 + DECK_SIZE * 3; // 52 + 52 + 156 = 260
    expect(result[sizeOffset]).toBeCloseTo(7 / 13); // rel 1 = abs 1
    expect(result[sizeOffset + 1]).toBeCloseTo(1 / 13); // rel 2 = abs 2
    expect(result[sizeOffset + 2]).toBeCloseTo(0); // rel 3 = abs 3
  });

  it("encodes last play cards and combo type", () => {
    const snap = emptySnapshot({
      lastPlay: {
        combo: "PAIR",
        cards: [cd(Rank.KING, Suit.SPADES), cd(Rank.KING, Suit.CLUBS)],
        suited: false,
      },
      lastPlayBy: 1,
    });

    const result = encodeState(snap, 0);
    const lastPlayOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3; // 263
    // K♠ and K♣
    expect(result[lastPlayOffset + Rank.KING * 4 + Suit.SPADES]).toBe(1);
    expect(result[lastPlayOffset + Rank.KING * 4 + Suit.CLUBS]).toBe(1);

    const comboOffset = lastPlayOffset + DECK_SIZE; // 315
    expect(result[comboOffset + 1]).toBe(1); // PAIR = index 1
    expect(result[comboOffset + 0]).toBe(0); // SINGLE = 0, not set
  });

  it("encodes power state (null lastPlay) as combo index 7", () => {
    const snap = emptySnapshot(); // lastPlay is null
    const result = encodeState(snap, 0);
    const comboOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE; // 315
    expect(result[comboOffset + 7]).toBe(1); // POWER index
    for (let i = 0; i < 7; i++) {
      expect(result[comboOffset + i]).toBe(0);
    }
  });

  it("encodes last play suited flag", () => {
    const snap = emptySnapshot({
      lastPlay: {
        combo: "RUN",
        cards: [
          cd(Rank.THREE, Suit.HEARTS),
          cd(Rank.FOUR, Suit.HEARTS),
          cd(Rank.FIVE, Suit.HEARTS),
        ],
        suited: true,
      },
      lastPlayBy: 2,
    });
    const result = encodeState(snap, 0);
    const suitedOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8; // 323
    expect(result[suitedOffset]).toBe(1);
  });

  it("encodes lastPlayBy as relative one-hot", () => {
    const snap = emptySnapshot({
      lastPlay: {
        combo: "SINGLE",
        cards: [cd(Rank.ACE, Suit.SPADES)],
        suited: false,
      },
      lastPlayBy: 3,
    });

    // From player 0: abs 3 = rel 3
    const result = encodeState(snap, 0);
    const byOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1; // 324
    expect(result[byOffset + 3]).toBe(1);
    expect(result[byOffset + 0]).toBe(0);

    // From player 2: abs 3 = rel 1
    const result2 = encodeState(snap, 2);
    expect(result2[byOffset + 1]).toBe(1);
    expect(result2[byOffset + 3]).toBe(0);
  });

  it("encodes passed players (opponents only)", () => {
    const snap = emptySnapshot({
      passedPlayers: [false, true, false, true], // players 1 and 3 passed
    });

    const result = encodeState(snap, 0);
    const passedOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1 + 4; // 328
    expect(result[passedOffset]).toBe(1); // rel 1 = abs 1: passed
    expect(result[passedOffset + 1]).toBe(0); // rel 2 = abs 2: not passed
    expect(result[passedOffset + 2]).toBe(1); // rel 3 = abs 3: passed
  });

  it("encodes players in game (opponents only)", () => {
    const snap = emptySnapshot({
      playersInGame: [true, false, true, true], // player 1 won
    });

    const result = encodeState(snap, 0);
    const igOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1 + 4 + 3; // 331
    expect(result[igOffset]).toBe(0); // rel 1 = abs 1: out
    expect(result[igOffset + 1]).toBe(1); // rel 2 = abs 2: in
    expect(result[igOffset + 2]).toBe(1); // rel 3 = abs 3: in
  });

  it("encodes win order filled (positions 1-3)", () => {
    const snap = emptySnapshot({
      winOrder: [2, 0], // 2 players have finished
    });

    const result = encodeState(snap, 0);
    const woOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1 + 4 + 3 + 3; // 334
    expect(result[woOffset]).toBe(1); // 1st place filled
    expect(result[woOffset + 1]).toBe(1); // 2nd place filled
    expect(result[woOffset + 2]).toBe(0); // 3rd place not filled
  });

  it("encodes unseen cards (not in hand, not played)", () => {
    const snap = emptySnapshot({
      hands: [
        [cd(Rank.THREE, Suit.SPADES), cd(Rank.FIVE, Suit.HEARTS)], // values 0, 11
        [cd(Rank.KING, Suit.CLUBS)], // value 41 — opponent hand, invisible to encoding
        [],
        [],
      ],
      cardsPlayedByPlayer: [
        [cd(Rank.FOUR, Suit.CLUBS)], // value 5 — played
        [cd(Rank.SEVEN, Suit.DIAMONDS)], // value 18 — played
        [],
        [],
      ],
    });

    const result = encodeState(snap, 0);
    const unseenOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1 + 4 + 3 + 3 + 3; // 337

    // In our hand → NOT unseen
    expect(result[unseenOffset + 0]).toBe(0); // 3♠ (value 0) in hand
    expect(result[unseenOffset + 11]).toBe(0); // 5♥ (value 11) in hand

    // Played by someone → NOT unseen
    expect(result[unseenOffset + 5]).toBe(0); // 4♣ (value 5) played
    expect(result[unseenOffset + 18]).toBe(0); // 7♦ (value 18) played

    // In opponent's hand but not played and not in our hand → unseen (we don't know)
    expect(result[unseenOffset + 41]).toBe(1); // K♣ (value 41)

    // Completely unaccounted for card → unseen
    expect(result[unseenOffset + 30]).toBe(1); // some card nobody holds or played
  });

  it("encodes unseen cards as all 1s when no cards in hand or played", () => {
    const snap = emptySnapshot(); // empty hands, no cards played
    const result = encodeState(snap, 0);
    const unseenOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1 + 4 + 3 + 3 + 3; // 337

    for (let i = 0; i < DECK_SIZE; i++) {
      expect(result[unseenOffset + i]).toBe(1);
    }
  });

  it("encodes relative hand advantage", () => {
    const snap = emptySnapshot({
      hands: [
        Array.from({ length: 10 }, (_, i) => cd(i, 0)), // player 0: 10 cards
        Array.from({ length: 4 }, (_, i) => cd(i, 1)), // player 1: 4 cards
        Array.from({ length: 13 }, (_, i) => cd(i, 2)), // player 2: 13 cards
        [], // player 3: 0 cards
      ],
    });

    const result = encodeState(snap, 0);
    const advOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1 + 4 + 3 + 3 + 3 + DECK_SIZE; // 389

    // (mySize - oppSize) / 13
    expect(result[advOffset]).toBeCloseTo((10 - 4) / 13); // rel 1 = player 1: positive (I have more = bad)
    expect(result[advOffset + 1]).toBeCloseTo((10 - 13) / 13); // rel 2 = player 2: negative (I have fewer = good)
    expect(result[advOffset + 2]).toBeCloseTo((10 - 0) / 13); // rel 3 = player 3: large positive
  });

  it("rotates relative hand advantage for different perspectives", () => {
    const snap = emptySnapshot({
      hands: [
        Array.from({ length: 5 }, (_, i) => cd(i, 0)), // player 0: 5
        Array.from({ length: 8 }, (_, i) => cd(i, 1)), // player 1: 8
        Array.from({ length: 2 }, (_, i) => cd(i, 2)), // player 2: 2
        Array.from({ length: 11 }, (_, i) => cd(i, 3)), // player 3: 11
      ],
    });

    // From player 2's perspective: my_size=2, opponents are p3(11), p0(5), p1(8)
    const result = encodeState(snap, 2);
    const advOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1 + 4 + 3 + 3 + 3 + DECK_SIZE; // 389

    expect(result[advOffset]).toBeCloseTo((2 - 11) / 13); // rel 1 = player 3
    expect(result[advOffset + 1]).toBeCloseTo((2 - 5) / 13); // rel 2 = player 0
    expect(result[advOffset + 2]).toBeCloseTo((2 - 8) / 13); // rel 3 = player 1
  });

  it("encodes combo history per opponent", () => {
    const snap = emptySnapshot({
      combosPlayedByPlayer: [
        {}, // player 0: no combos
        { SINGLE: 3, PAIR: 1 }, // player 1
        { RUN: 2 }, // player 2
        { BOMB: 1, TRIPLE: 4 }, // player 3
      ],
    });

    const result = encodeState(snap, 0);
    const comboOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1 + 4 + 3 + 3 + 3 + DECK_SIZE + 3; // 392

    // rel 1 = player 1: SINGLE=3/5, PAIR=1/5
    expect(result[comboOffset + 0]).toBeCloseTo(3 / 5); // SINGLE
    expect(result[comboOffset + 1]).toBeCloseTo(1 / 5); // PAIR
    expect(result[comboOffset + 2]).toBe(0); // TRIPLE
    expect(result[comboOffset + 4]).toBe(0); // RUN

    // rel 2 = player 2: RUN=2/5
    expect(result[comboOffset + 7 + 4]).toBeCloseTo(2 / 5); // RUN (offset 7 for next opponent)
    expect(result[comboOffset + 7 + 0]).toBe(0); // SINGLE

    // rel 3 = player 3: BOMB=1/5, TRIPLE=4/5
    expect(result[comboOffset + 14 + 5]).toBeCloseTo(1 / 5); // BOMB
    expect(result[comboOffset + 14 + 2]).toBeCloseTo(4 / 5); // TRIPLE
  });

  it("rotates combo history for different perspectives", () => {
    const snap = emptySnapshot({
      combosPlayedByPlayer: [
        { SINGLE: 5 }, // player 0
        {}, // player 1
        {}, // player 2
        {}, // player 3
      ],
    });

    // From player 2's perspective: rel 1=p3, rel 2=p0, rel 3=p1
    const result = encodeState(snap, 2);
    const comboOffset = DECK_SIZE * 2 + DECK_SIZE * 3 + 3 + DECK_SIZE + 8 + 1 + 4 + 3 + 3 + 3 + DECK_SIZE + 3; // 392

    // Player 0's combos should be in rel 2 slot (offset + 7)
    expect(result[comboOffset + 7 + 0]).toBeCloseTo(5 / 5); // SINGLE = 1.0
    // rel 1 (player 3) and rel 3 (player 1) should be empty
    expect(result[comboOffset + 0]).toBe(0);
    expect(result[comboOffset + 14 + 0]).toBe(0);
  });

  it("handles missing cardsPlayedByPlayer gracefully", () => {
    const snap = emptySnapshot();
    delete snap.cardsPlayedByPlayer;

    const result = encodeState(snap, 0);
    // Cards played sections should all be zeros
    for (let i = DECK_SIZE; i < DECK_SIZE * 2 + DECK_SIZE * 3; i++) {
      expect(result[i]).toBe(0);
    }
  });

  it("fills exactly STATE_SIZE floats", () => {
    // Verify the last position is writable and nothing goes out of bounds
    const snap = emptySnapshot({ winOrder: [0, 1, 2] });
    const result = encodeState(snap, 0);
    expect(result[336]).toBe(1); // 3rd win order slot filled (offset 334 + 2)
    expect(result.length).toBe(STATE_SIZE);
  });
});
