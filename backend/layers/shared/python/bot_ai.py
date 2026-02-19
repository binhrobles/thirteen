"""
Server-side bot AI for Tiến Lên (Thirteen)
Ported from GDScript bot_hand_evaluator.gd + bot_player.gd
"""
from typing import List, Dict, Any
from itertools import combinations
from game import Game, Card, Combo


class BotHandEvaluator:
    """Enumerates all valid plays from a bot's hand"""

    @staticmethod
    def evaluate(hand: List[Card], game: Game, player_pos: int) -> Dict[str, List[List[Card]]]:
        """
        Enumerate all valid plays from the given hand.
        Uses game.can_play() for validation to avoid duplicating rules.

        Returns dict with keys: singles, pairs, triples, quads, runs, bombs
        Each value is a list of card lists.
        """
        by_rank: Dict[int, List[Card]] = {}
        for card in hand:
            by_rank.setdefault(card.rank, []).append(card)

        result = {
            'singles': BotHandEvaluator._find_singles(hand, game, player_pos),
            'pairs': BotHandEvaluator._find_pairs(by_rank, game, player_pos),
            'triples': BotHandEvaluator._find_triples(by_rank, game, player_pos),
            'quads': BotHandEvaluator._find_quads(by_rank, game, player_pos),
            'runs': BotHandEvaluator._find_runs(hand, game, player_pos),
            'bombs': BotHandEvaluator._find_bombs(hand, game, player_pos),
        }
        return result

    @staticmethod
    def _try_play(game: Game, player_pos: int, cards: List[Card]) -> bool:
        """Check if cards form a valid play using game.can_play()"""
        valid, _ = game.can_play(player_pos, cards)
        return valid

    @staticmethod
    def _find_singles(hand: List[Card], game: Game, player_pos: int) -> List[List[Card]]:
        valid = []
        for card in hand:
            if BotHandEvaluator._try_play(game, player_pos, [card]):
                valid.append([card])
        return valid

    @staticmethod
    def _find_pairs(by_rank: Dict[int, List[Card]], game: Game, player_pos: int) -> List[List[Card]]:
        valid = []
        for rank, cards_of_rank in by_rank.items():
            if len(cards_of_rank) < 2:
                continue
            for pair in combinations(cards_of_rank, 2):
                cards = list(pair)
                if BotHandEvaluator._try_play(game, player_pos, cards):
                    valid.append(cards)
        return valid

    @staticmethod
    def _find_triples(by_rank: Dict[int, List[Card]], game: Game, player_pos: int) -> List[List[Card]]:
        valid = []
        for rank, cards_of_rank in by_rank.items():
            if len(cards_of_rank) < 3:
                continue
            for triple in combinations(cards_of_rank, 3):
                cards = list(triple)
                if BotHandEvaluator._try_play(game, player_pos, cards):
                    valid.append(cards)
        return valid

    @staticmethod
    def _find_quads(by_rank: Dict[int, List[Card]], game: Game, player_pos: int) -> List[List[Card]]:
        valid = []
        for rank, cards_of_rank in by_rank.items():
            if len(cards_of_rank) != 4:
                continue
            cards = list(cards_of_rank)
            if BotHandEvaluator._try_play(game, player_pos, cards):
                valid.append(cards)
        return valid

    @staticmethod
    def _find_runs(hand: List[Card], game: Game, player_pos: int) -> List[List[Card]]:
        """Find all valid runs (3+ consecutive cards, no 2s)"""
        valid = []

        # Filter out 2s
        eligible = [c for c in hand if c.rank != 15]
        if len(eligible) < 3:
            return valid

        sorted_cards = sorted(eligible, key=lambda c: c.value)

        # Determine required length if last play is a run
        last_play = game.last_play
        min_length = 3
        max_length = len(sorted_cards)

        if last_play and last_play.combo == Combo.RUN:
            min_length = len(last_play.cards)
            max_length = len(last_play.cards)

        for length in range(min_length, max_length + 1):
            for start_idx in range(len(sorted_cards)):
                run_cards: List[Card] = []

                for i in range(start_idx, len(sorted_cards)):
                    card = sorted_cards[i]
                    if not run_cards:
                        run_cards.append(card)
                    elif card.rank == run_cards[-1].rank + 1:
                        run_cards.append(card)
                    elif card.rank == run_cards[-1].rank:
                        # Skip duplicate ranks (take first card of each rank)
                        continue
                    else:
                        break

                    if len(run_cards) == length:
                        if BotHandEvaluator._try_play(game, player_pos, list(run_cards)):
                            valid.append(list(run_cards))
                        break

        return valid

    @staticmethod
    def _find_bombs(hand: List[Card], game: Game, player_pos: int) -> List[List[Card]]:
        """Find all valid bombs (3+ consecutive pairs)"""
        valid = []

        by_rank: Dict[int, List[Card]] = {}
        for card in hand:
            by_rank.setdefault(card.rank, []).append(card)

        # Only ranks with at least a pair
        pair_ranks = sorted([r for r, cards in by_rank.items() if len(cards) >= 2])

        if len(pair_ranks) < 3:
            return valid

        last_play = game.last_play
        min_pairs = 3
        max_pairs = len(pair_ranks)

        if last_play and last_play.combo == Combo.BOMB:
            required_pairs = len(last_play.cards) // 2
            min_pairs = required_pairs
            max_pairs = required_pairs

        for num_pairs in range(min_pairs, max_pairs + 1):
            for start_idx in range(len(pair_ranks) - num_pairs + 1):
                # Check consecutive ranks
                consecutive = True
                for i in range(num_pairs - 1):
                    if pair_ranks[start_idx + i] + 1 != pair_ranks[start_idx + i + 1]:
                        consecutive = False
                        break

                if not consecutive:
                    continue

                # Build bomb from consecutive rank pairs
                bomb_cards: List[Card] = []
                for i in range(num_pairs):
                    rank = pair_ranks[start_idx + i]
                    cards_of_rank = by_rank[rank]
                    bomb_cards.append(cards_of_rank[0])
                    bomb_cards.append(cards_of_rank[1])

                if BotHandEvaluator._try_play(game, player_pos, bomb_cards):
                    valid.append(bomb_cards)

        return valid


class BotPlayer:
    """Greedy bot that plays the lowest-value valid combo"""

    @staticmethod
    def choose_play(hand: List[Card], game: Game, player_pos: int) -> List[Card]:
        """
        Choose the lowest-value play from all valid options.

        Strategy:
        - If opening (has power): play lowest single
        - Otherwise: play lowest-value combo that beats current play
        - Empty list = pass

        Returns list of Card objects to play, or empty list to pass.
        """
        evaluation = BotHandEvaluator.evaluate(hand, game, player_pos)

        # If opening (has power), play lowest single
        if game.last_play is None:
            if evaluation['singles']:
                return evaluation['singles'][0]

        # Gather all valid plays
        all_plays: List[List[Card]] = []
        for combo_type in ['singles', 'pairs', 'triples', 'quads', 'runs', 'bombs']:
            all_plays.extend(evaluation[combo_type])

        if not all_plays:
            return []  # Pass

        # Sort by highest card value (lowest first)
        all_plays.sort(key=lambda cards: max(c.value for c in cards))

        return all_plays[0]


def execute_bot_turns(tourney, game: Game) -> List[Dict[str, Any]]:
    """
    Execute bot turns in a loop until it's a human's turn or game over.

    Returns list of bot move dicts: {player_pos, action, cards}
    """
    bot_moves: List[Dict[str, Any]] = []
    safety_cap = 100

    for _ in range(safety_cap):
        if game.is_game_over():
            break

        pos = game.current_player
        seat = tourney.seats[pos]

        if not seat.is_bot:
            break  # Human's turn

        hand = game.hands[pos]
        cards_to_play = BotPlayer.choose_play(hand, game, pos)

        if cards_to_play:
            game.play_cards(pos, cards_to_play)
            bot_moves.append({
                'player_pos': pos,
                'action': 'play',
                'cards': [c.to_dict() for c in cards_to_play]
            })
        else:
            game.pass_turn(pos)
            bot_moves.append({
                'player_pos': pos,
                'action': 'pass',
                'cards': []
            })

    return bot_moves
