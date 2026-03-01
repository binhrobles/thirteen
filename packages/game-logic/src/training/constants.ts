export const DECK_SIZE = 52;
export const NUM_PLAYERS = 4;
export const NUM_OPPONENTS = 3;

// Combo types for state encoding: 7 from Combo enum + POWER (null lastPlay)
export const NUM_COMBO_TYPES = 8;
// Combo types for action encoding: 7 from Combo enum (no POWER for actions)
export const NUM_ACTION_COMBO_TYPES = 7;

// State vector: 52 + 52 + 156 + 3 + 52 + 8 + 1 + 4 + 3 + 3 + 3 = 337
// passedPlayers, playersInGame, winOrderFilled use 3 slots (opponents only)
export const STATE_SIZE = 337;

// Action vector: 52 + 7 + 1 + 1 + 1 + 1 = 63
export const ACTION_SIZE = 63;
