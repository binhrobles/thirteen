"""
Feature encoding for Tiến Lên RL training.

Mirrors the TypeScript encoders in packages/game-logic/src/training/.
Must produce identical output for the same input.
"""

import numpy as np

DECK_SIZE = 52
NUM_PLAYERS = 4
NUM_OPPONENTS = 3
NUM_COMBO_TYPES = 8  # 7 combos + POWER
NUM_ACTION_COMBO_TYPES = 7

STATE_SIZE = 392
ACTION_SIZE = 63

COMBO_INDEX = {
    "SINGLE": 0,
    "PAIR": 1,
    "TRIPLE": 2,
    "QUAD": 3,
    "RUN": 4,
    "BOMB": 5,
    "INVALID": 6,
}
POWER_INDEX = 7


def encode_state(snapshot: dict, player_index: int) -> np.ndarray:
    """Encode a GameStateSnapshot from the perspective of player_index."""
    out = np.zeros(STATE_SIZE, dtype=np.float32)
    offset = 0

    hands = snapshot["hands"]
    last_play = snapshot.get("lastPlay")
    last_play_by = snapshot.get("lastPlayBy", -1)
    passed = snapshot["passedPlayers"]
    in_game = snapshot["playersInGame"]
    win_order = snapshot["winOrder"]
    cards_played = snapshot.get("cardsPlayedByPlayer")

    # Own hand (52)
    for card in hands[player_index]:
        out[offset + card["value"]] = 1
    offset += DECK_SIZE

    # Cards played total (52)
    if cards_played:
        for p in range(NUM_PLAYERS):
            for card in cards_played[p]:
                out[offset + card["value"]] = 1
    offset += DECK_SIZE

    # Cards played by each opponent (52 × 3)
    for rel in range(1, NUM_OPPONENTS + 1):
        abs_p = (player_index + rel) % NUM_PLAYERS
        if cards_played:
            for card in cards_played[abs_p]:
                out[offset + card["value"]] = 1
        offset += DECK_SIZE

    # Opponent hand sizes (3)
    for rel in range(1, NUM_OPPONENTS + 1):
        abs_p = (player_index + rel) % NUM_PLAYERS
        out[offset] = len(hands[abs_p]) / 13.0
        offset += 1

    # Last play cards (52)
    if last_play:
        for card in last_play["cards"]:
            out[offset + card["value"]] = 1
    offset += DECK_SIZE

    # Last play combo type (8) one-hot
    if last_play:
        idx = COMBO_INDEX.get(last_play["combo"], 6)
    else:
        idx = POWER_INDEX
    out[offset + idx] = 1
    offset += NUM_COMBO_TYPES

    # Last play suited (1)
    out[offset] = 1 if (last_play and last_play.get("suited")) else 0
    offset += 1

    # Last played by, relative (4) one-hot
    if last_play:
        rel = (last_play_by - player_index + NUM_PLAYERS) % NUM_PLAYERS
        out[offset + rel] = 1
    offset += NUM_PLAYERS

    # Players passed (3) opponents only
    for rel in range(1, NUM_OPPONENTS + 1):
        abs_p = (player_index + rel) % NUM_PLAYERS
        out[offset] = 1 if passed[abs_p] else 0
        offset += 1

    # Players in game (3) opponents only
    for rel in range(1, NUM_OPPONENTS + 1):
        abs_p = (player_index + rel) % NUM_PLAYERS
        out[offset] = 1 if in_game[abs_p] else 0
        offset += 1

    # Win order filled (3) positions 1-3
    for pos in range(3):
        out[offset] = 1 if pos < len(win_order) else 0
        offset += 1

    # Unseen cards (52) — cards not in our hand and not yet played
    my_hand_values = {c["value"] for c in hands[player_index]}
    played_values: set[int] = set()
    if cards_played:
        for p in range(NUM_PLAYERS):
            for card in cards_played[p]:
                played_values.add(card["value"])
    for card_val in range(DECK_SIZE):
        out[offset + card_val] = 1 if (card_val not in my_hand_values and card_val not in played_values) else 0
    offset += DECK_SIZE

    # Relative hand advantage (3) — (myHandSize - opponentHandSize) / 13
    my_size = len(hands[player_index])
    for rel in range(1, NUM_OPPONENTS + 1):
        abs_p = (player_index + rel) % NUM_PLAYERS
        out[offset] = (my_size - len(hands[abs_p])) / 13.0
        offset += 1

    assert offset == STATE_SIZE
    return out


def _determine_combo(cards: list[dict]) -> int:
    """Determine combo type index from card data list."""
    n = len(cards)
    if n == 0:
        return 6  # INVALID

    ranks = [c["rank"] for c in cards]
    suits = [c["suit"] for c in cards]

    if n == 1:
        return 0  # SINGLE

    if n == 2 and ranks[0] == ranks[1]:
        return 1  # PAIR

    if n == 3 and len(set(ranks)) == 1:
        return 2  # TRIPLE

    if n == 4 and len(set(ranks)) == 1:
        return 3  # QUAD

    # Check run: 3+ consecutive ranks, no 2s (rank 12)
    if n >= 3 and 12 not in ranks:
        sorted_ranks = sorted(set(ranks))
        if len(sorted_ranks) == n:
            is_consecutive = all(
                sorted_ranks[i] + 1 == sorted_ranks[i + 1]
                for i in range(len(sorted_ranks) - 1)
            )
            if is_consecutive:
                return 4  # RUN

    # Check bomb: 3+ consecutive pairs (6+ cards, even count)
    if n >= 6 and n % 2 == 0:
        sorted_cards = sorted(cards, key=lambda c: c["value"])
        is_bomb = True
        pair_ranks = []
        for i in range(0, n, 2):
            if sorted_cards[i]["rank"] != sorted_cards[i + 1]["rank"]:
                is_bomb = False
                break
            pair_ranks.append(sorted_cards[i]["rank"])
        if is_bomb:
            pair_ranks.sort()
            is_consecutive = all(
                pair_ranks[i] + 1 == pair_ranks[i + 1]
                for i in range(len(pair_ranks) - 1)
            )
            if is_consecutive and 12 not in pair_ranks:
                return 5  # BOMB

    return 6  # INVALID


def encode_action(cards: list[dict]) -> np.ndarray:
    """Encode a play action as a fixed-size feature vector."""
    out = np.zeros(ACTION_SIZE, dtype=np.float32)
    offset = 0

    # Cards in play (52)
    max_value = 0
    for card in cards:
        out[offset + card["value"]] = 1
        max_value = max(max_value, card["value"])
    offset += DECK_SIZE

    # Combo type (7) one-hot
    combo = _determine_combo(cards)
    out[offset + combo] = 1
    offset += NUM_ACTION_COMBO_TYPES

    # Combo size (1) normalized
    out[offset] = len(cards) / 13.0
    offset += 1

    # Highest card value (1) normalized
    out[offset] = max_value / 51.0
    offset += 1

    # Is suited (1)
    suits = [c["suit"] for c in cards]
    out[offset] = 1 if len(set(suits)) == 1 else 0
    offset += 1

    # Is pass (1)
    out[offset] = 0
    offset += 1

    assert offset == ACTION_SIZE
    return out


def encode_pass_action() -> np.ndarray:
    """Encode the pass action."""
    out = np.zeros(ACTION_SIZE, dtype=np.float32)
    out[ACTION_SIZE - 1] = 1
    return out
