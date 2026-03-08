"""
Game logger for training observability.

Records move-by-move game transcripts during evaluation with model
confidence scores, combo types, and flags for interesting games.
Outputs JSONL files (one game per line) keyed by eval checkpoint.
"""

import json
import os
from dataclasses import dataclass, field, asdict

import numpy as np

from features import _determine_combo, COMBO_INDEX

# Reverse lookup: combo index -> name
COMBO_NAMES = {v: k for k, v in COMBO_INDEX.items()}

RANK_NAMES = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]
SUIT_SYMBOLS = ["♠", "♣", "♦", "♥"]


def _card_summary(cards: list[dict]) -> str:
    """Short string summary of cards, e.g. 'K♠ K♦'."""
    return " ".join(f"{RANK_NAMES[c['rank']]}{SUIT_SYMBOLS[c['suit']]}" for c in cards)


@dataclass
class MoveRecord:
    move_num: int
    player: int
    is_model: bool
    hand_size: int
    valid_action_count: int
    chose_pass: bool
    can_pass: bool
    cards: list[dict] | None  # cards played (None if pass)
    combo_type: str | None  # SINGLE, PAIR, RUN, etc.
    combo_size: int  # number of cards (0 if pass)
    top_probs: list[dict]  # [{action_index, prob, summary}] top choices
    model_confidence: float  # probability of chosen action
    cards_to_beat: dict | None  # lastPlay snapshot
    # Context for viewer
    hand: list[dict]  # model's full hand at this point
    opponent_hand_sizes: list[int]  # hand sizes for all 4 players
    passed_players: list[bool]  # who has passed this round
    players_in_game: list[bool]  # who is still in the game
    last_play_by: int | None  # who made the last play (from snapshot)


@dataclass
class GameRecord:
    eval_num: int
    game_num: int
    model_seat: int
    model_finish_position: int  # 1-indexed (1=1st, 4=4th)
    total_moves: int
    model_moves: int
    win_order: list[int]
    moves: list[MoveRecord] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


class GameLogger:
    """Records games during eval and writes JSONL output."""

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        self._current_moves: list[MoveRecord] = []
        self._current_eval_num = 0
        self._current_game_num = 0
        self._current_model_seat = 0
        self._move_counter = 0

    def start_game(self, eval_num: int, game_num: int, model_seat: int):
        """Begin recording a new game."""
        self._current_moves = []
        self._current_eval_num = eval_num
        self._current_game_num = game_num
        self._current_model_seat = model_seat
        self._move_counter = 0

    def record_move(
        self,
        turn_state: dict,
        turn_player: int,
        turn_valid_actions: list[list[dict]],
        turn_can_pass: bool,
        action_index: int,
        num_actions: int,
        probs: np.ndarray | None = None,
        is_model: bool = True,
    ):
        """Record a single move.

        Args:
            turn_state: The state dict from TurnInfo
            turn_player: Current player index
            turn_valid_actions: List of valid card plays
            turn_can_pass: Whether passing is allowed
            action_index: Index of chosen action
            num_actions: Total number of valid actions (plays + pass)
            probs: Softmax probabilities over actions (model moves only)
            is_model: Whether this is a model-controlled seat
        """
        self._move_counter += 1

        is_pass = turn_can_pass and action_index == num_actions - 1
        hands = turn_state["hands"]
        hand_size = len(hands[turn_player])

        cards = None
        combo_type = None
        combo_size = 0

        if not is_pass and action_index < len(turn_valid_actions):
            cards = turn_valid_actions[action_index]
            combo_idx = _determine_combo(cards)
            combo_type = COMBO_NAMES.get(combo_idx, "INVALID")
            combo_size = len(cards)

        # Build top-k probs
        top_probs = []
        model_confidence = 0.0
        if probs is not None:
            sorted_indices = np.argsort(-probs)
            for idx in sorted_indices[:5]:
                p = float(probs[idx])
                if p < 0.01:
                    break
                if turn_can_pass and idx == num_actions - 1:
                    summary = "PASS"
                elif idx < len(turn_valid_actions):
                    summary = _card_summary(turn_valid_actions[idx])
                else:
                    summary = "?"
                top_probs.append({"action_index": int(idx), "prob": round(p, 4), "summary": summary})
            model_confidence = float(probs[action_index])

        # Cards to beat
        cards_to_beat = None
        if turn_state.get("lastPlay"):
            lp = turn_state["lastPlay"]
            cards_to_beat = {
                "combo": lp.get("combo"),
                "cards_summary": _card_summary(lp.get("cards", [])),
            }

        self._current_moves.append(MoveRecord(
            move_num=self._move_counter,
            player=turn_player,
            is_model=is_model,
            hand_size=hand_size,
            valid_action_count=num_actions,
            chose_pass=is_pass,
            can_pass=turn_can_pass,
            cards=cards,
            combo_type=combo_type,
            combo_size=combo_size,
            top_probs=top_probs,
            model_confidence=round(model_confidence, 4),
            cards_to_beat=cards_to_beat,
            hand=list(hands[turn_player]),
            opponent_hand_sizes=[len(hands[i]) for i in range(4)],
            passed_players=list(turn_state.get("passedPlayers", [])),
            players_in_game=list(turn_state.get("playersInGame", [])),
            last_play_by=turn_state.get("lastPlayBy"),
        ))

    def end_game(self, win_order: list[int]) -> GameRecord:
        """Finalize game, compute flags, return GameRecord."""
        model_seat = self._current_model_seat
        model_pos = win_order.index(model_seat) + 1  # 1-indexed

        model_moves = sum(1 for m in self._current_moves if m.is_model)
        total_moves = len(self._current_moves)

        flags = []
        if model_pos > 1:
            flags.append("model_loss")
        if model_pos == 2:
            flags.append("close_finish")
        if total_moves < 20:
            flags.append("short_game")
        if total_moves > 80:
            flags.append("long_game")

        return GameRecord(
            eval_num=self._current_eval_num,
            game_num=self._current_game_num,
            model_seat=model_seat,
            model_finish_position=model_pos,
            total_moves=total_moves,
            model_moves=model_moves,
            win_order=list(win_order),
            moves=list(self._current_moves),
            flags=flags,
        )

    def write_eval_batch(self, eval_num: int, records: list[GameRecord]):
        """Write all games from one eval checkpoint to JSONL file."""
        path = os.path.join(
            self.output_dir,
            f"eval-games-{eval_num}.jsonl",
        )
        with open(path, "w") as f:
            for rec in records:
                f.write(json.dumps(asdict(rec)) + "\n")
