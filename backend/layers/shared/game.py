"""
Game state and logic for Tiến Lên (Thirteen)
Ported from GDScript game logic
"""
import random
from typing import List, Dict, Optional, Tuple
from enum import Enum


class Suit(Enum):
    """Card suits (0-3)"""
    SPADES = 0
    CLUBS = 1
    DIAMONDS = 2
    HEARTS = 3


class Card:
    """Represents a playing card"""
    def __init__(self, rank: int, suit: int):
        self.rank = rank  # 3-15 (3-10, J=11, Q=12, K=13, A=14, 2=15)
        self.suit = suit  # 0-3 (Spades, Clubs, Diamonds, Hearts)
        self.value = rank * 4 + suit  # Natural ordering

    def to_dict(self) -> Dict:
        return {'rank': self.rank, 'suit': self.suit, 'value': self.value}

    @classmethod
    def from_dict(cls, data: Dict) -> 'Card':
        return cls(data['rank'], data['suit'])

    def __repr__(self):
        rank_names = {11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2'}
        suit_names = ['♠', '♣', '♦', '♥']
        rank_str = rank_names.get(self.rank, str(self.rank))
        return f"{rank_str}{suit_names[self.suit]}"


class Combo(Enum):
    """Valid play combinations"""
    INVALID = 0
    SINGLE = 1
    PAIR = 2
    TRIPLE = 3
    QUAD = 4
    RUN = 5
    BOMB = 6  # Run of pairs (3+ consecutive pairs)


class Play:
    """Represents a played hand"""
    def __init__(self, combo: Combo, cards: List[Card], suited: bool = False):
        self.combo = combo
        self.cards = sorted(cards, key=lambda c: c.value)
        self.suited = suited
        self.high_card = self.cards[-1] if cards else None

    def to_dict(self) -> Dict:
        return {
            'combo': self.combo.name,
            'cards': [c.to_dict() for c in self.cards],
            'suited': self.suited
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'Play':
        combo = Combo[data['combo']]
        cards = [Card.from_dict(c) for c in data['cards']]
        return cls(combo, cards, data.get('suited', False))


class Game:
    """Game state for a single game of Tiến Lên"""

    def __init__(self, player_ids: List[str]):
        self.player_ids = player_ids  # 4 player IDs in seat order
        self.hands: List[List[Card]] = [[] for _ in range(4)]
        self.current_player = 0
        self.last_play: Optional[Play] = None
        self.passed_players = [False] * 4
        self.win_order: List[int] = []
        self.move_history: List[Dict] = []

    def deal(self) -> int:
        """
        Deal cards to all players
        Returns: starting player position (who has 3♠)
        """
        # Create deck
        deck = []
        for rank in range(3, 16):  # 3-15 (2 is highest)
            for suit in range(4):
                deck.append(Card(rank, suit))

        # Shuffle
        random.shuffle(deck)

        # Deal 13 cards to each player
        for i in range(4):
            self.hands[i] = sorted(deck[i*13:(i+1)*13], key=lambda c: c.value)

        # Find who has 3♠ (value = 0)
        for i, hand in enumerate(self.hands):
            if any(c.value == 0 for c in hand):
                self.current_player = i
                return i

        # Fallback (shouldn't happen)
        return 0

    def can_play(self, player_pos: int, cards: List[Card]) -> Tuple[bool, Optional[str]]:
        """
        Check if play is valid
        Returns: (valid: bool, error_message: Optional[str])
        """
        if player_pos != self.current_player:
            return False, "NOT_YOUR_TURN"

        if self.passed_players[player_pos]:
            return False, "ALREADY_PASSED"

        # Determine combo type
        play = self._determine_play(cards)
        if play.combo == Combo.INVALID:
            return False, "INVALID_COMBO"

        # If opening (no last play), check if valid opening
        if self.last_play is None:
            # Can't open with bombs
            if play.combo == Combo.BOMB:
                return False, "CANT_OPEN_WITH_BOMB"
            return True, None

        # Must match combo type (except chops)
        if not self._can_beat(play, self.last_play):
            return False, "CANT_BEAT_LAST_PLAY"

        return True, None

    def play_cards(self, player_pos: int, cards: List[Card]) -> bool:
        """
        Execute a play
        Returns: success
        """
        valid, error = self.can_play(player_pos, cards)
        if not valid:
            return False

        # Remove cards from hand
        for card in cards:
            self.hands[player_pos] = [c for c in self.hands[player_pos] if c.value != card.value]

        # Update last play
        self.last_play = self._determine_play(cards)

        # Reset passed flags
        self.passed_players = [False] * 4

        # Record move
        self.move_history.append({
            'playerId': player_pos,
            'action': 'play',
            'cards': [c.to_dict() for c in cards]
        })

        # Check if player won
        if len(self.hands[player_pos]) == 0:
            self.win_order.append(player_pos)

        # Advance turn
        self._advance_turn()

        return True

    def pass_turn(self, player_pos: int) -> bool:
        """
        Pass turn
        Returns: success
        """
        if player_pos != self.current_player:
            return False

        if self.last_play is None:
            return False  # Can't pass with power

        if self.passed_players[player_pos]:
            return False  # Already passed

        # Mark as passed
        self.passed_players[player_pos] = True

        # Record move
        self.move_history.append({
            'playerId': player_pos,
            'action': 'pass'
        })

        # Advance turn
        self._advance_turn()

        return True

    def _advance_turn(self):
        """Advance to next player"""
        # Skip players who finished
        for _ in range(4):
            self.current_player = (self.current_player + 1) % 4
            if self.current_player not in self.win_order:
                break

        # Check if round reset (all others passed)
        active_players = [i for i in range(4) if i not in self.win_order]
        others_passed = all(self.passed_players[i] for i in active_players if i != self.current_player)

        if others_passed:
            # Grant power (clear last play and passed flags)
            self.last_play = None
            self.passed_players = [False] * 4

    def is_game_over(self) -> bool:
        """Check if game is over (3 players finished)"""
        return len(self.win_order) >= 3

    def _determine_play(self, cards: List[Card]) -> Play:
        """Determine combo type of cards"""
        if not cards:
            return Play(Combo.INVALID, [])

        sorted_cards = sorted(cards, key=lambda c: c.value)
        n = len(sorted_cards)

        # Single
        if n == 1:
            return Play(Combo.SINGLE, sorted_cards)

        # Pair
        if n == 2 and sorted_cards[0].rank == sorted_cards[1].rank:
            return Play(Combo.PAIR, sorted_cards)

        # Triple
        if n == 3 and all(c.rank == sorted_cards[0].rank for c in sorted_cards):
            return Play(Combo.TRIPLE, sorted_cards)

        # Quad
        if n == 4 and all(c.rank == sorted_cards[0].rank for c in sorted_cards):
            return Play(Combo.QUAD, sorted_cards)

        # Run (3+ consecutive cards)
        if n >= 3 and self._is_run(sorted_cards):
            suited = self._is_suited(sorted_cards)
            return Play(Combo.RUN, sorted_cards, suited)

        # Bomb (3+ consecutive pairs)
        if n >= 6 and n % 2 == 0 and self._is_bomb(sorted_cards):
            suited = self._is_suited(sorted_cards)
            return Play(Combo.BOMB, sorted_cards, suited)

        return Play(Combo.INVALID, sorted_cards)

    def _is_run(self, cards: List[Card]) -> bool:
        """Check if cards form a run (consecutive ranks)"""
        if len(cards) < 3:
            return False

        # No 2s in runs
        if any(c.rank == 15 for c in cards):
            return False

        # Check consecutive
        for i in range(len(cards) - 1):
            if cards[i+1].rank != cards[i].rank + 1:
                return False

        return True

    def _is_bomb(self, cards: List[Card]) -> bool:
        """Check if cards form a bomb (consecutive pairs)"""
        if len(cards) < 6 or len(cards) % 2 != 0:
            return False

        # No 2s in bombs
        if any(c.rank == 15 for c in cards):
            return False

        # Check pairs
        for i in range(0, len(cards), 2):
            if cards[i].rank != cards[i+1].rank:
                return False

        # Check consecutive ranks
        for i in range(0, len(cards) - 2, 2):
            if cards[i+2].rank != cards[i].rank + 1:
                return False

        return True

    def _is_suited(self, cards: List[Card]) -> bool:
        """Check if all cards are same suit"""
        return len(set(c.suit for c in cards)) == 1

    def _can_beat(self, play: Play, last_play: Play) -> bool:
        """Check if play can beat last play"""
        # Chops: Quad beats single 2
        if play.combo == Combo.QUAD and last_play.combo == Combo.SINGLE and last_play.high_card.rank == 15:
            return True

        # Bombs beat 2s by length
        if play.combo == Combo.BOMB and last_play.combo in [Combo.SINGLE, Combo.PAIR, Combo.TRIPLE]:
            if last_play.high_card.rank == 15:
                # 3-pair bomb beats single 2, 4-pair beats pair of 2s, etc.
                bomb_pairs = len(play.cards) // 2
                if last_play.combo == Combo.SINGLE and bomb_pairs >= 3:
                    return True
                if last_play.combo == Combo.PAIR and bomb_pairs >= 4:
                    return True
                if last_play.combo == Combo.TRIPLE and bomb_pairs >= 5:
                    return True

        # Must match combo type
        if play.combo != last_play.combo:
            return False

        # Must match length (for runs/bombs)
        if play.combo in [Combo.RUN, Combo.BOMB] and len(play.cards) != len(last_play.cards):
            return False

        # Suited run must beat suited run
        if play.combo == Combo.RUN and last_play.suited and not play.suited:
            return False

        # Compare high cards
        return play.high_card.value > last_play.high_card.value

    def to_dict(self) -> Dict:
        """Convert to DynamoDB-compatible dict"""
        return {
            'playerIds': self.player_ids,
            'hands': [[c.to_dict() for c in hand] for hand in self.hands],
            'currentPlayer': self.current_player,
            'lastPlay': self.last_play.to_dict() if self.last_play else None,
            'passedPlayers': self.passed_players,
            'winOrder': self.win_order,
            'moveHistory': self.move_history
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'Game':
        """Create from DynamoDB dict"""
        game = cls(data['playerIds'])
        game.hands = [[Card.from_dict(c) for c in hand] for hand in data['hands']]
        game.current_player = data['currentPlayer']
        game.last_play = Play.from_dict(data['lastPlay']) if data.get('lastPlay') else None
        game.passed_players = data['passedPlayers']
        game.win_order = data['winOrder']
        game.move_history = data.get('moveHistory', [])
        return game
