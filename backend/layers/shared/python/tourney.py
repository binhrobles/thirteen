"""
Tournament state management and business logic
"""
from typing import Dict, List, Optional, Tuple, Any
from game import Game


class TourneyStatus:
    """Tournament status constants"""
    WAITING = "waiting"
    STARTING = "starting"
    IN_PROGRESS = "in_progress"
    BETWEEN_GAMES = "between_games"
    COMPLETED = "completed"


class Seat:
    """Represents a tournament seat"""
    position: int
    player_id: Optional[str]
    player_name: Optional[str]
    connection_id: Optional[str]
    score: int
    games_won: int
    last_game_points: int
    ready: bool

    def __init__(self, position: int, player_id: Optional[str] = None, player_name: Optional[str] = None,
                 connection_id: Optional[str] = None, score: int = 0, games_won: int = 0,
                 last_game_points: int = 0, ready: bool = False) -> None:
        self.position = position
        self.player_id = player_id
        self.player_name = player_name
        self.connection_id = connection_id
        self.score = score
        self.games_won = games_won
        self.last_game_points = last_game_points
        self.ready = ready

    def to_dict(self) -> Dict[str, Any]:
        """Convert to DynamoDB-compatible dict"""
        return {
            'position': self.position,
            'playerId': self.player_id,
            'playerName': self.player_name,
            'connectionId': self.connection_id,
            'score': self.score,
            'gamesWon': self.games_won,
            'lastGamePoints': self.last_game_points,
            'ready': self.ready
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Seat':
        """Create from DynamoDB dict"""
        return cls(
            position=data['position'],
            player_id=data.get('playerId'),
            player_name=data.get('playerName'),
            connection_id=data.get('connectionId'),
            score=int(data.get('score', 0)),
            games_won=int(data.get('gamesWon', 0)),
            last_game_points=int(data.get('lastGamePoints', 0)),
            ready=data.get('ready', False)
        )

    def is_occupied(self) -> bool:
        """Check if seat is occupied"""
        return self.player_id is not None

    def is_empty(self) -> bool:
        """Check if seat is empty"""
        return self.player_id is None


class Tourney:
    """Tournament state and business logic"""
    GLOBAL_ID: str = "global"
    TARGET_SCORE: int = 21
    SEATS_COUNT: int = 4

    tourney_id: str
    status: str
    target_score: int
    seats: List[Seat]
    current_game: Optional[Dict[str, Any]]
    game_history: List[Dict[str, Any]]

    def __init__(self, tourney_id: str = GLOBAL_ID) -> None:
        self.tourney_id = tourney_id
        self.status = TourneyStatus.WAITING
        self.target_score = self.TARGET_SCORE
        self.seats = [Seat(i) for i in range(self.SEATS_COUNT)]
        self.current_game = None
        self.game_history = []

    @classmethod
    def from_dynamo(cls, item: Dict[str, Any]) -> 'Tourney':
        """Create tournament from DynamoDB item"""
        tourney = cls(item['tourneyId'])
        tourney.status = item.get('status', TourneyStatus.WAITING)
        tourney.target_score = int(item.get('targetScore', cls.TARGET_SCORE))

        # Parse seats
        seats_data: List[Any] = item.get('seats', [])
        tourney.seats = [Seat.from_dict(s) for s in seats_data]

        # Ensure we always have 4 seats
        while len(tourney.seats) < cls.SEATS_COUNT:
            tourney.seats.append(Seat(len(tourney.seats)))

        tourney.current_game = item.get('currentGame')
        tourney.game_history = item.get('gameHistory', [])

        return tourney

    def to_dynamo(self) -> Dict[str, Any]:
        """Convert to DynamoDB item"""
        return {
            'tourneyId': self.tourney_id,
            'status': self.status,
            'targetScore': self.target_score,
            'seats': [s.to_dict() for s in self.seats],
            'currentGame': self.current_game,
            'gameHistory': self.game_history
        }

    def claim_seat(self, player_id: str, player_name: str, connection_id: str,
                   seat_position: Optional[int] = None) -> Tuple[bool, str, Optional[int]]:
        """
        Claim a seat in the tournament

        Returns: (success: bool, error_message: str, claimed_position: int)
        """
        # Check if tourney is in valid state for claiming
        if self.status not in [TourneyStatus.WAITING, TourneyStatus.STARTING]:
            return False, "TOURNEY_IN_PROGRESS", None

        # Check if player already has a seat
        existing_seat = self.get_seat_by_player(player_id)
        if existing_seat is not None:
            # Update connection ID for reconnection
            existing_seat.connection_id = connection_id
            return True, "", existing_seat.position

        # Find available seat
        if seat_position is not None:
            # Specific seat requested
            if seat_position < 0 or seat_position >= self.SEATS_COUNT:
                return False, "INVALID_SEAT", None

            if self.seats[seat_position].is_occupied():
                return False, "SEAT_TAKEN", None

            target_seat = self.seats[seat_position]
        else:
            # First available seat
            target_seat = self.get_first_empty_seat()
            if target_seat is None:
                return False, "TOURNEY_FULL", None

        # Claim the seat
        target_seat.player_id = player_id
        target_seat.player_name = player_name
        target_seat.connection_id = connection_id
        target_seat.score = 0
        target_seat.games_won = 0
        target_seat.last_game_points = 0
        target_seat.ready = False

        # Update status if all seats filled
        if self.get_occupied_count() == self.SEATS_COUNT:
            if self.status == TourneyStatus.WAITING:
                self.status = TourneyStatus.STARTING

        return True, "", target_seat.position

    def leave_tourney(self, player_id: str) -> Tuple[bool, str]:
        """
        Leave the tournament

        Returns: (success: bool, error_message: str)
        """
        seat = self.get_seat_by_player(player_id)
        if seat is None:
            return False, "NOT_IN_TOURNEY"

        # If tournament hasn't started, free the seat completely
        if self.status in [TourneyStatus.WAITING, TourneyStatus.STARTING]:
            seat.player_id = None
            seat.player_name = None
            seat.connection_id = None
            seat.score = 0
            seat.games_won = 0
            seat.last_game_points = 0
            seat.ready = False

            # Update status if no longer full
            if self.get_occupied_count() < self.SEATS_COUNT:
                self.status = TourneyStatus.WAITING

            return True, ""

        # If tournament in progress, mark as disconnected (TODO: bot replacement)
        # For now, just return error
        return False, "TOURNEY_IN_PROGRESS"

    def set_ready(self, player_id: str, ready: bool = True) -> Tuple[bool, str]:
        """
        Mark player as ready

        Returns: (success: bool, error_message: str)
        """
        seat = self.get_seat_by_player(player_id)
        if seat is None:
            return False, "NOT_IN_TOURNEY"

        # Can only ready up in starting or between_games states
        if self.status not in [TourneyStatus.STARTING, TourneyStatus.BETWEEN_GAMES]:
            return False, "INVALID_STATE"

        seat.ready = ready

        # Check if all players ready
        if self.are_all_ready():
            # Start game or next game
            if self.status == TourneyStatus.STARTING:
                self.status = TourneyStatus.IN_PROGRESS
                # TODO: Initialize first game
            elif self.status == TourneyStatus.BETWEEN_GAMES:
                self.status = TourneyStatus.IN_PROGRESS
                # TODO: Initialize next game

        return True, ""

    def get_seat_by_player(self, player_id: str) -> Optional[Seat]:
        """Get seat occupied by player"""
        for seat in self.seats:
            if seat.player_id == player_id:
                return seat
        return None

    def get_first_empty_seat(self) -> Optional[Seat]:
        """Get first available empty seat"""
        for seat in self.seats:
            if seat.is_empty():
                return seat
        return None

    def get_occupied_count(self) -> int:
        """Count occupied seats"""
        return sum(1 for s in self.seats if s.is_occupied())

    def get_ready_count(self) -> int:
        """Count ready players"""
        return sum(1 for s in self.seats if s.is_occupied() and s.ready)

    def are_all_ready(self) -> bool:
        """Check if all occupied seats are ready"""
        occupied = [s for s in self.seats if s.is_occupied()]
        if not occupied:
            return False
        return all(s.ready for s in occupied)

    def start_game(self) -> Game:
        """
        Start a new game
        Returns: Game instance
        """
        # Create game with player IDs in seat order
        player_ids: List[str] = [s.player_id for s in self.seats if s.player_id is not None]
        if len(player_ids) != self.SEATS_COUNT:
            raise ValueError(f"Cannot start game: expected {self.SEATS_COUNT} players, got {len(player_ids)}")

        game = Game(player_ids)

        # Deal cards
        _starting_player = game.deal()

        # Store as current game
        self.current_game = game.to_dict()
        self.current_game['gameNumber'] = len(self.game_history) + 1

        # Reset ready flags
        for seat in self.seats:
            seat.ready = False

        return game

    def complete_game(self, win_order: List[int]) -> Tuple[bool, bool]:
        """
        Complete the current game and award points

        Args:
            win_order: List of player positions in finishing order

        Returns: (success: bool, tournament_complete: bool)
        """
        if not self.current_game:
            return False, False

        # Award points: 4/2/1/0 for 1st/2nd/3rd/4th
        points_awarded = [4, 2, 1, 0]

        for i, position in enumerate(win_order):
            seat = self.seats[position]
            points = points_awarded[i]
            seat.score += points
            seat.last_game_points = points
            if i == 0:  # Winner
                seat.games_won += 1

        # Record in game history
        self.game_history.append({
            'gameNumber': len(self.game_history) + 1,
            'winOrder': win_order,
            'pointsAwarded': points_awarded,
            'timestamp': None  # Will be set by Lambda
        })

        # Clear current game
        self.current_game = None

        # Check if tournament is complete
        max_score = max(s.score for s in self.seats)
        tournament_complete = max_score >= self.target_score

        if tournament_complete:
            self.status = TourneyStatus.COMPLETED
        else:
            self.status = TourneyStatus.BETWEEN_GAMES

        return True, tournament_complete

    def get_leaderboard(self) -> List[Dict[str, Any]]:
        """Get leaderboard sorted by score"""
        leaderboard: List[Dict[str, Any]] = []
        for seat in self.seats:
            if seat.is_occupied():
                leaderboard.append({
                    'position': seat.position,
                    'playerName': seat.player_name,
                    'totalScore': seat.score,
                    'lastGamePoints': seat.last_game_points,
                    'gamesWon': seat.games_won
                })

        # Sort by score descending
        leaderboard.sort(key=lambda x: x['totalScore'], reverse=True)
        return leaderboard

    def to_client_state(self) -> Dict[str, Any]:
        """Convert to client-friendly state"""
        return {
            'status': self.status,
            'seats': [
                {
                    'position': s.position,
                    'playerName': s.player_name,
                    'score': s.score,
                    'gamesWon': s.games_won,
                    'ready': s.ready
                }
                for s in self.seats
            ],
            'targetScore': self.target_score,
            'currentGameNumber': len(self.game_history) + (1 if self.current_game else 0),
            'readyCount': self.get_ready_count()
        }
