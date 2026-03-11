import { describe, it, expect } from "vitest";
import { Rank, Suit } from "../src/card.js";
import type { GameStateSnapshot, CardData } from "../src/types.js";
import { encodeState } from "../src/training/state-encoder.js";
import { STATE_SIZE, DECK_SIZE, NUM_ACTION_COMBO_TYPES } from "../src/training/constants.js";

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

// First block is now handComboTypeMap (52×7 = 364), not own hand (52)
const COMBO_MAP_SIZE = DECK_SIZE * NUM_ACTION_COMBO_TYPES; // 364
// Offsets for blocks after the combo type map
const TOTAL_PLAYED_OFFSET = COMBO_MAP_SIZE; // 364
const OPP_PLAYED_OFFSET = COMBO_MAP_SIZE + DECK_SIZE; // 416
const HAND_SIZE_OFFSET = OPP_PLAYED_OFFSET + DECK_SIZE * 3; // 572
const LAST_PLAY_OFFSET = HAND_SIZE_OFFSET + 3; // 575
const COMBO_TYPE_OFFSET = LAST_PLAY_OFFSET + DECK_SIZE; // 627
const SUITED_OFFSET = COMBO_TYPE_OFFSET + 8; // 635
const PLAYED_BY_OFFSET = SUITED_OFFSET + 1; // 636
const PASSED_OFFSET = PLAYED_BY_OFFSET + 4; // 640
const IN_GAME_OFFSET = PASSED_OFFSET + 3; // 643
const WIN_ORDER_OFFSET = IN_GAME_OFFSET + 3; // 646
const UNSEEN_OFFSET = WIN_ORDER_OFFSET + 3; // 649
const ADVANTAGE_OFFSET = UNSEEN_OFFSET + DECK_SIZE; // 701
const COMBO_HISTORY_OFFSET = ADVANTAGE_OFFSET + 3; // 704

describe("encodeState", () => {
  it("returns Float32Array of STATE_SIZE length", () => {
    const result = encodeState(emptySnapshot(), 0);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(STATE_SIZE);
  });

  it("encodes hand combo type map in first 364 positions", () => {
    // Card value 0 (3♠) appears in 1 single → slot [0*7 + 0] = 1
    // Card value 51 (2♥) appears in 1 single → slot [51*7 + 0] = 1
    const comboTypeMap = new Array(364).fill(0);
    comboTypeMap[0 * 7 + 0] = 1; // 3♠ in 1 single
    comboTypeMap[51 * 7 + 0] = 1; // 2♥ in 1 single
    comboTypeMap[0 * 7 + 1] = 2; // 3♠ in 2 pairs

    const snap = emptySnapshot({ handComboTypeMap: comboTypeMap });
    const result = encodeState(snap, 0);
    expect(result[0 * 7 + 0]).toBe(1); // 3♠ single count
    expect(result[0 * 7 + 1]).toBe(2); // 3♠ pair count
    expect(result[51 * 7 + 0]).toBe(1); // 2♥ single count
    expect(result[1 * 7 + 0]).toBe(0); // 3♣ not in hand
  });

  it("handles missing handComboTypeMap gracefully", () => {
    const snap = emptySnapshot();
    const result = encodeState(snap, 0);
    for (let i = 0; i < COMBO_MAP_SIZE; i++) {
      expect(result[i]).toBe(0);
    }
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
    expect(result[TOTAL_PLAYED_OFFSET + 0]).toBe(1); // 3♠
    expect(result[TOTAL_PLAYED_OFFSET + Rank.KING * 4 + Suit.HEARTS]).toBe(1); // K♥
    expect(result[TOTAL_PLAYED_OFFSET + 1]).toBe(0); // 3♣ not played
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

    const result = encodeState(snap, 0);
    // Opponent slot 0 (rel 1 = abs player 1): 4♣
    expect(result[OPP_PLAYED_OFFSET + Rank.FOUR * 4 + Suit.CLUBS]).toBe(1);
    // Opponent slot 2 (rel 3 = abs player 3): K♠
    expect(result[OPP_PLAYED_OFFSET + 2 * DECK_SIZE + Rank.KING * 4 + Suit.SPADES]).toBe(1);
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
    // rel 1 = abs 3, rel 2 = abs 0, rel 3 = abs 1
    expect(result[OPP_PLAYED_OFFSET + 1 * DECK_SIZE + Rank.ACE * 4 + Suit.DIAMONDS]).toBe(1);
  });

  it("encodes opponent hand sizes normalized by 13", () => {
    const snap = emptySnapshot({
      hands: [
        Array.from({ length: 13 }, (_, i) => cd(i, 0)),
        Array.from({ length: 7 }, (_, i) => cd(i, 1)),
        [cd(0, 2)],
        [],
      ],
    });

    const result = encodeState(snap, 0);
    expect(result[HAND_SIZE_OFFSET]).toBeCloseTo(7 / 13);
    expect(result[HAND_SIZE_OFFSET + 1]).toBeCloseTo(1 / 13);
    expect(result[HAND_SIZE_OFFSET + 2]).toBeCloseTo(0);
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
    expect(result[LAST_PLAY_OFFSET + Rank.KING * 4 + Suit.SPADES]).toBe(1);
    expect(result[LAST_PLAY_OFFSET + Rank.KING * 4 + Suit.CLUBS]).toBe(1);
    expect(result[COMBO_TYPE_OFFSET + 1]).toBe(1); // PAIR = index 1
    expect(result[COMBO_TYPE_OFFSET + 0]).toBe(0); // SINGLE not set
  });

  it("encodes power state (null lastPlay) as combo index 7", () => {
    const snap = emptySnapshot();
    const result = encodeState(snap, 0);
    expect(result[COMBO_TYPE_OFFSET + 7]).toBe(1); // POWER index
    for (let i = 0; i < 7; i++) {
      expect(result[COMBO_TYPE_OFFSET + i]).toBe(0);
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
    expect(result[SUITED_OFFSET]).toBe(1);
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

    const result = encodeState(snap, 0);
    expect(result[PLAYED_BY_OFFSET + 3]).toBe(1);
    expect(result[PLAYED_BY_OFFSET + 0]).toBe(0);

    const result2 = encodeState(snap, 2);
    expect(result2[PLAYED_BY_OFFSET + 1]).toBe(1);
    expect(result2[PLAYED_BY_OFFSET + 3]).toBe(0);
  });

  it("encodes passed players (opponents only)", () => {
    const snap = emptySnapshot({
      passedPlayers: [false, true, false, true],
    });

    const result = encodeState(snap, 0);
    expect(result[PASSED_OFFSET]).toBe(1);
    expect(result[PASSED_OFFSET + 1]).toBe(0);
    expect(result[PASSED_OFFSET + 2]).toBe(1);
  });

  it("encodes players in game (opponents only)", () => {
    const snap = emptySnapshot({
      playersInGame: [true, false, true, true],
    });

    const result = encodeState(snap, 0);
    expect(result[IN_GAME_OFFSET]).toBe(0);
    expect(result[IN_GAME_OFFSET + 1]).toBe(1);
    expect(result[IN_GAME_OFFSET + 2]).toBe(1);
  });

  it("encodes win order filled (positions 1-3)", () => {
    const snap = emptySnapshot({
      winOrder: [2, 0],
    });

    const result = encodeState(snap, 0);
    expect(result[WIN_ORDER_OFFSET]).toBe(1);
    expect(result[WIN_ORDER_OFFSET + 1]).toBe(1);
    expect(result[WIN_ORDER_OFFSET + 2]).toBe(0);
  });

  it("encodes unseen cards (not in hand, not played)", () => {
    const snap = emptySnapshot({
      hands: [
        [cd(Rank.THREE, Suit.SPADES), cd(Rank.FIVE, Suit.HEARTS)],
        [cd(Rank.KING, Suit.CLUBS)],
        [],
        [],
      ],
      cardsPlayedByPlayer: [
        [cd(Rank.FOUR, Suit.CLUBS)],
        [cd(Rank.SEVEN, Suit.DIAMONDS)],
        [],
        [],
      ],
    });

    const result = encodeState(snap, 0);
    expect(result[UNSEEN_OFFSET + 0]).toBe(0); // 3♠ in hand
    expect(result[UNSEEN_OFFSET + 11]).toBe(0); // 5♥ in hand
    expect(result[UNSEEN_OFFSET + 5]).toBe(0); // 4♣ played
    expect(result[UNSEEN_OFFSET + 18]).toBe(0); // 7♦ played
    expect(result[UNSEEN_OFFSET + 41]).toBe(1); // K♣ unseen
    expect(result[UNSEEN_OFFSET + 30]).toBe(1); // unaccounted card
  });

  it("encodes unseen cards as all 1s when no cards in hand or played", () => {
    const snap = emptySnapshot();
    const result = encodeState(snap, 0);
    for (let i = 0; i < DECK_SIZE; i++) {
      expect(result[UNSEEN_OFFSET + i]).toBe(1);
    }
  });

  it("encodes relative hand advantage", () => {
    const snap = emptySnapshot({
      hands: [
        Array.from({ length: 10 }, (_, i) => cd(i, 0)),
        Array.from({ length: 4 }, (_, i) => cd(i, 1)),
        Array.from({ length: 13 }, (_, i) => cd(i, 2)),
        [],
      ],
    });

    const result = encodeState(snap, 0);
    expect(result[ADVANTAGE_OFFSET]).toBeCloseTo((10 - 4) / 13);
    expect(result[ADVANTAGE_OFFSET + 1]).toBeCloseTo((10 - 13) / 13);
    expect(result[ADVANTAGE_OFFSET + 2]).toBeCloseTo((10 - 0) / 13);
  });

  it("rotates relative hand advantage for different perspectives", () => {
    const snap = emptySnapshot({
      hands: [
        Array.from({ length: 5 }, (_, i) => cd(i, 0)),
        Array.from({ length: 8 }, (_, i) => cd(i, 1)),
        Array.from({ length: 2 }, (_, i) => cd(i, 2)),
        Array.from({ length: 11 }, (_, i) => cd(i, 3)),
      ],
    });

    const result = encodeState(snap, 2);
    expect(result[ADVANTAGE_OFFSET]).toBeCloseTo((2 - 11) / 13);
    expect(result[ADVANTAGE_OFFSET + 1]).toBeCloseTo((2 - 5) / 13);
    expect(result[ADVANTAGE_OFFSET + 2]).toBeCloseTo((2 - 8) / 13);
  });

  it("encodes combo history per opponent", () => {
    const snap = emptySnapshot({
      combosPlayedByPlayer: [
        {},
        { SINGLE: 3, PAIR: 1 },
        { RUN: 2 },
        { BOMB: 1, TRIPLE: 4 },
      ],
    });

    const result = encodeState(snap, 0);
    expect(result[COMBO_HISTORY_OFFSET + 0]).toBeCloseTo(3 / 5); // SINGLE
    expect(result[COMBO_HISTORY_OFFSET + 1]).toBeCloseTo(1 / 5); // PAIR
    expect(result[COMBO_HISTORY_OFFSET + 2]).toBe(0); // TRIPLE
    expect(result[COMBO_HISTORY_OFFSET + 4]).toBe(0); // RUN
    expect(result[COMBO_HISTORY_OFFSET + 7 + 4]).toBeCloseTo(2 / 5); // opp 2 RUN
    expect(result[COMBO_HISTORY_OFFSET + 7 + 0]).toBe(0);
    expect(result[COMBO_HISTORY_OFFSET + 14 + 5]).toBeCloseTo(1 / 5); // opp 3 BOMB
    expect(result[COMBO_HISTORY_OFFSET + 14 + 2]).toBeCloseTo(4 / 5); // opp 3 TRIPLE
  });

  it("rotates combo history for different perspectives", () => {
    const snap = emptySnapshot({
      combosPlayedByPlayer: [
        { SINGLE: 5 },
        {},
        {},
        {},
      ],
    });

    const result = encodeState(snap, 2);
    expect(result[COMBO_HISTORY_OFFSET + 7 + 0]).toBeCloseTo(5 / 5);
    expect(result[COMBO_HISTORY_OFFSET + 0]).toBe(0);
    expect(result[COMBO_HISTORY_OFFSET + 14 + 0]).toBe(0);
  });

  it("handles missing cardsPlayedByPlayer gracefully", () => {
    const snap = emptySnapshot();
    delete snap.cardsPlayedByPlayer;

    const result = encodeState(snap, 0);
    for (let i = TOTAL_PLAYED_OFFSET; i < OPP_PLAYED_OFFSET + DECK_SIZE * 3; i++) {
      expect(result[i]).toBe(0);
    }
  });

  it("fills exactly STATE_SIZE floats", () => {
    const snap = emptySnapshot({ winOrder: [0, 1, 2] });
    const result = encodeState(snap, 0);
    expect(result[WIN_ORDER_OFFSET + 2]).toBe(1); // 3rd win order slot filled
    expect(result.length).toBe(STATE_SIZE);
  });
});
