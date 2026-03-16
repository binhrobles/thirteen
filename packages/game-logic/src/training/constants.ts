// ⚠️  SYNC WARNING: STATE_SIZE and feature layout here must exactly match
// packages/training/python/features.py. A mismatch breaks ONNX inference
// without any compile-time error. When changing either file, update the other.

export const DECK_SIZE = 52;
export const NUM_PLAYERS = 4;
export const NUM_OPPONENTS = 3;

// Combo types for state encoding: 7 from Combo enum + POWER (null lastPlay)
export const NUM_COMBO_TYPES = 8;
// Combo types for action encoding: 7 from Combo enum (no POWER for actions)
export const NUM_ACTION_COMBO_TYPES = 7;

// Tournament features block size
export const TOURNEY_FEATURES_SIZE = 15;

// State vector: 364 + 52 + 156 + 3 + 52 + 8 + 1 + 4 + 3 + 3 + 3 + 52 + 3 + 21 + 15 = 740
// handComboTypeMap (364): per-card combo type breakdown (52 cards × 7 combo types)
// cardsPlayedTotal, cardsPlayedByOpponent, opponentHandSizes, lastPlay, etc.
// passedPlayers, playersInGame, winOrderFilled use 3 slots (opponents only)
// unseenCards (52): cards not in hand and not yet played
// relativeHandAdvantage (3): (myHandSize - opponentHandSize) / 13
// comboHistory (21): per-opponent combo type counts (3 opponents × 7 combo types)
// tourneyFeatures (15): tournament context (scores, gaps, leader, clinch proximity)
export const STATE_SIZE = 740;

// Action vector: 52 + 7 + 1 + 1 + 1 + 1 = 63
export const ACTION_SIZE = 63;
