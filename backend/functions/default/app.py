"""
WebSocket $default handler
Routes incoming messages to appropriate action handlers
"""
import json
import os
import sys
import boto3
from decimal import Decimal
from typing import List, Dict, Any, Optional

# Add shared layer to path
sys.path.append('/opt/python')
from tourney import Tourney, TourneyStatus
from game import Game, Card

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])
tourney_table = dynamodb.Table(os.environ['TOURNEY_TABLE'])

apigw_management: Optional[Any] = None  # Initialized per request


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Route WebSocket messages to appropriate action handlers

    Expected message format:
    {
        "action": "tourney/claim_seat" | "tourney/leave" | "game/play" | ...,
        "payload": { ... }
    }
    """
    global apigw_management

    connection_id = event['requestContext']['connectionId']
    endpoint_url = f"https://{event['requestContext']['domainName']}/{event['requestContext']['stage']}"
    apigw_management = boto3.client('apigatewaymanagementapi', endpoint_url=endpoint_url)

    try:
        # Parse incoming message
        body = json.loads(event.get('body', '{}'))
        action = body.get('action')
        payload = body.get('payload', {})

        print(f'Received action: {action} from {connection_id}')

        # Get player info from connection
        response = connections_table.get_item(Key={'connectionId': connection_id})
        connection = response.get('Item')

        if not connection:
            return send_error(connection_id, 'UNAUTHORIZED', 'Connection not found')

        player_id = connection['playerId']
        player_name = connection.get('playerName', 'Player')

        # Route to appropriate handler
        if action == 'ping':
            return handle_ping(connection_id, payload)
        elif action == 'tourney/info':
            return handle_tourney_info(connection_id, player_id, payload)
        elif action == 'tourney/claim_seat':
            return handle_claim_seat(connection_id, player_id, player_name, payload)
        elif action == 'tourney/leave':
            return handle_leave_tourney(connection_id, player_id, payload)
        elif action == 'tourney/ready':
            return handle_ready(connection_id, player_id, payload)
        elif action == 'tourney/add_bot':
            return handle_add_bot(connection_id, player_id, payload)
        elif action == 'tourney/kick_bot':
            return handle_kick_bot(connection_id, player_id, payload)
        elif action == 'game/play':
            return handle_play_cards(connection_id, player_id, payload)
        elif action == 'game/pass':
            return handle_pass(connection_id, player_id, payload)
        elif action == 'debug/quick_start':
            return handle_debug_quick_start(connection_id, player_id, player_name, payload)
        elif action == 'debug/reset':
            return handle_debug_reset(connection_id)
        else:
            return send_error(connection_id, 'UNKNOWN_ACTION', f'Unknown action: {action}')

    except json.JSONDecodeError:
        return send_error(connection_id, 'INVALID_JSON', 'Invalid JSON in message body')
    except Exception as e:
        print(f'Error handling message: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Internal server error')


def handle_ping(connection_id: str, payload: Dict[str, Any]) -> Dict[str, int]:
    """Handle heartbeat ping"""
    timestamp: int = payload.get('timestamp', 0)

    # Update last ping time
    connections_table.update_item(
        Key={'connectionId': connection_id},
        UpdateExpression='SET lastPing = :now',
        ExpressionAttributeValues={':now': int(timestamp)}
    )

    # Send pong response
    return send_to_connection(connection_id, {
        'type': 'pong',
        'payload': {'timestamp': timestamp}
    })


def handle_tourney_info(connection_id: str, _player_id: str, _payload: Dict[str, Any]) -> Dict[str, int]:
    """Handle tourney/info action - send current tournament state to requesting player"""
    try:
        # Get tournament
        tourney = get_or_create_tourney()

        # Clean up disconnected players (5 second grace period)
        if tourney.cleanup_disconnected_players(grace_period_seconds=5):
            save_tourney(tourney)

        # Send tournament state to the requesting player
        send_to_connection(connection_id, {
            'type': 'tourney/updated',
            'payload': tourney.to_client_state()
        })

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error getting tourney info: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to get tournament info')


def handle_claim_seat(connection_id: str, player_id: str, player_name: str, payload: Dict[str, Any]) -> Dict[str, int]:
    """Handle tourney/claim_seat action"""
    try:
        # Get or create tournament
        tourney = get_or_create_tourney()

        # Clean up disconnected players first
        tourney.cleanup_disconnected_players(grace_period_seconds=5)

        # Extract seat position from payload
        seat_position: Optional[int] = payload.get('seatPosition')

        # Attempt to claim seat
        success, error_code, _claimed_position = tourney.claim_seat(
            player_id, player_name, connection_id, seat_position
        )

        if not success:
            return send_error(connection_id, error_code, f'Failed to claim seat: {error_code}')

        # Clear disconnect timestamp if player is reconnecting
        seat = tourney.get_seat_by_player(player_id)
        if seat and hasattr(seat, 'disconnectedAt'):
            seat.disconnectedAt = None

        # Save updated tourney
        save_tourney(tourney)

        # Broadcast update to all players
        broadcast_tourney_update(tourney)

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error claiming seat: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to claim seat')


def handle_leave_tourney(connection_id: str, player_id: str, _payload: Dict[str, Any]) -> Dict[str, int]:
    """Handle tourney/leave action"""
    try:
        # Get tournament
        tourney = get_or_create_tourney()

        # Attempt to leave
        success, error_code = tourney.leave_tourney(player_id)

        if not success:
            return send_error(connection_id, error_code, f'Failed to leave: {error_code}')

        # Save updated tourney
        save_tourney(tourney)

        # Broadcast update to all players
        broadcast_tourney_update(tourney)

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error leaving tourney: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to leave tourney')


def handle_ready(connection_id: str, player_id: str, _payload: Dict[str, Any]) -> Dict[str, int]:
    """Handle tourney/ready action"""
    try:
        # Get tournament
        tourney = get_or_create_tourney()

        # Set ready status
        success, error_code = tourney.set_ready(player_id, True)

        if not success:
            return send_error(connection_id, error_code, f'Failed to ready up: {error_code}')

        # Save updated tourney
        save_tourney(tourney)

        # Broadcast update to all players
        broadcast_tourney_update(tourney)

        # If all players ready, start the game
        if tourney.status == TourneyStatus.IN_PROGRESS and tourney.current_game is None:
            # Start new game
            game = tourney.start_game()
            save_tourney(tourney)

            # Broadcast game start to all players
            broadcast_game_started(tourney, game)

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error handling ready: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to ready up')


def handle_add_bot(connection_id: str, _player_id: str, payload: Dict[str, Any]) -> Dict[str, int]:
    """Handle tourney/add_bot action"""
    try:
        # Get tournament
        tourney = get_or_create_tourney()

        # Extract seat position from payload
        seat_position: Optional[int] = payload.get('seatPosition')
        if seat_position is None:
            return send_error(connection_id, 'MISSING_SEAT_POSITION', 'seatPosition is required')

        # Get optional bot profile (for future bot types)
        bot_profile: Optional[str] = payload.get('botProfile')

        # Attempt to add bot
        success, error_code = tourney.add_bot(seat_position, bot_profile)

        if not success:
            return send_error(connection_id, error_code, f'Failed to add bot: {error_code}')

        # Save updated tourney
        save_tourney(tourney)

        # Broadcast update to all players
        broadcast_tourney_update(tourney)

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error adding bot: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to add bot')


def handle_kick_bot(connection_id: str, _player_id: str, payload: Dict[str, Any]) -> Dict[str, int]:
    """Handle tourney/kick_bot action"""
    try:
        # Get tournament
        tourney = get_or_create_tourney()

        # Extract seat position from payload
        seat_position: Optional[int] = payload.get('seatPosition')
        if seat_position is None:
            return send_error(connection_id, 'MISSING_SEAT_POSITION', 'seatPosition is required')

        # Attempt to kick bot
        success, error_code = tourney.kick_bot(seat_position)

        if not success:
            return send_error(connection_id, error_code, f'Failed to kick bot: {error_code}')

        # Save updated tourney
        save_tourney(tourney)

        # Broadcast update to all players
        broadcast_tourney_update(tourney)

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error kicking bot: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to kick bot')


def handle_play_cards(connection_id: str, player_id: str, payload: Dict[str, Any]) -> Dict[str, int]:
    """Handle game/play action"""
    try:
        # Get tournament
        tourney = get_or_create_tourney()

        if tourney.status != TourneyStatus.IN_PROGRESS or not tourney.current_game:
            return send_error(connection_id, 'NO_ACTIVE_GAME', 'No active game')

        # Get player position
        seat = tourney.get_seat_by_player(player_id)
        if not seat:
            return send_error(connection_id, 'NOT_IN_TOURNEY', 'Not in tournament')

        # Parse cards from payload
        cards_data: List[Dict[str, Any]] = payload.get('cards', [])
        cards = [Card.from_dict(c) for c in cards_data]

        # Load game state
        game = Game.from_dict(tourney.current_game)

        # Validate and execute play
        valid, error = game.can_play(seat.position, cards)
        if not valid:
            return send_error(connection_id, error, f'Invalid play: {error}')

        # Execute the play
        game.play_cards(seat.position, cards)

        # Update tourney with new game state
        tourney.current_game = game.to_dict()

        # Check if game is over
        if game.is_game_over():
            # Add last player to win order
            for i in range(4):
                if i not in game.win_order:
                    game.win_order.append(i)
                    break

            # Complete game and award points
            _success, tourney_complete = tourney.complete_game(game.win_order)

            save_tourney(tourney)

            # Broadcast game over with leaderboard
            broadcast_game_over(tourney, game.win_order, tourney_complete)
        else:
            save_tourney(tourney)

            # Broadcast game state update
            broadcast_game_update(tourney, game, seat.position)

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error handling play: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to play cards')


def handle_pass(connection_id: str, player_id: str, _payload: Dict[str, Any]) -> Dict[str, int]:
    """Handle game/pass action"""
    try:
        # Get tournament
        tourney = get_or_create_tourney()

        if tourney.status != TourneyStatus.IN_PROGRESS or not tourney.current_game:
            return send_error(connection_id, 'NO_ACTIVE_GAME', 'No active game')

        # Get player position
        seat = tourney.get_seat_by_player(player_id)
        if not seat:
            return send_error(connection_id, 'NOT_IN_TOURNEY', 'Not in tournament')

        # Load game state
        game = Game.from_dict(tourney.current_game)

        # Execute pass
        if not game.pass_turn(seat.position):
            return send_error(connection_id, 'CANT_PASS', 'Cannot pass')

        # Update tourney with new game state
        tourney.current_game = game.to_dict()
        save_tourney(tourney)

        # Broadcast game state update
        broadcast_game_update(tourney, game, seat.position)

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error handling pass: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to pass')


def handle_debug_reset(connection_id: str) -> Dict[str, int]:
    """
    Debug backdoor: wipe the tourney back to empty WAITING state.

    Usage from wscat:
        {"action": "debug/reset", "payload": {}}
    """
    try:
        tourney = Tourney()
        save_tourney(tourney)
        broadcast_tourney_update(tourney)
        print('[DEBUG] Tourney reset to empty WAITING state')
        return send_to_connection(connection_id, {
            'type': 'debug/reset',
            'payload': {'message': 'Tourney reset'}
        })
    except Exception as e:
        print(f'Error in debug/reset: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to reset')


def handle_debug_quick_start(connection_id: str, player_id: str, player_name: str, payload: Dict[str, Any]) -> Dict[str, int]:
    """
    Debug backdoor: reset tourney, seat the caller + 3 bots, start game immediately.

    Usage from wscat:
        {"action": "debug/quick_start", "payload": {}}

    Optional payload fields:
        seatPosition: int (0-3, default 0) - which seat you want
    """
    try:
        # Nuke existing tourney — fresh slate
        tourney = Tourney()
        save_tourney(tourney)

        # Claim a seat for the requesting player
        seat_position: int = payload.get('seatPosition', 0)
        success, error_code, _ = tourney.claim_seat(player_id, player_name, connection_id, seat_position)
        if not success:
            return send_error(connection_id, error_code, f'Failed to claim seat: {error_code}')

        # Fill remaining seats with bots
        for i in range(4):
            if tourney.seats[i].is_empty():
                tourney.add_bot(i)

        # Ready up the human player (bots are already ready)
        tourney.set_ready(player_id, True)

        # All 4 are ready — status is now IN_PROGRESS. Start the game.
        game = tourney.start_game()
        save_tourney(tourney)

        # Broadcast tourney state then game start
        broadcast_tourney_update(tourney)
        broadcast_game_started(tourney, game)

        print(f'[DEBUG] Quick start: {player_name} in seat {seat_position} with 3 bots')

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error in debug/quick_start: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to quick start')


def get_or_create_tourney() -> Tourney:
    """Get existing tourney or create new one"""
    try:
        response = tourney_table.get_item(Key={'tourneyId': Tourney.GLOBAL_ID})
        if 'Item' in response:
            return Tourney.from_dynamo(response['Item'])
        else:
            # Create new tourney
            tourney = Tourney()
            save_tourney(tourney)
            return tourney
    except Exception as e:
        print(f'Error getting tourney: {str(e)}')
        # Return new tourney as fallback
        return Tourney()


def save_tourney(tourney: Tourney) -> None:
    """Save tourney to DynamoDB"""
    tourney_table.put_item(Item=tourney.to_dynamo())


def broadcast_tourney_update(tourney: Tourney) -> None:
    """Broadcast tourney state update to all connected players"""
    message: Dict[str, Any] = {
        'type': 'tourney/updated',
        'payload': tourney.to_client_state()
    }

    # Collect all unique connection IDs (from seats and from connections table)
    connection_ids: set[str] = set()

    # Add connections from occupied seats
    for seat in tourney.seats:
        if seat.is_occupied() and seat.connection_id:
            connection_ids.add(seat.connection_id)

    # Also get all active connections from the connections table
    # This ensures spectators and players not yet seated also receive updates
    try:
        response = connections_table.scan()
        for item in response.get('Items', []):
            conn_id = item.get('connectionId')
            if conn_id:
                connection_ids.add(conn_id)
    except Exception as e:
        print(f'Error scanning connections table: {str(e)}')

    # Broadcast to all connections
    for connection_id in connection_ids:
        send_to_connection(connection_id, message)


def broadcast_game_started(tourney: Tourney, game: Game) -> None:
    """Broadcast game start to all players"""
    # Send each player their own hand
    for i, seat in enumerate(tourney.seats):
        if seat.is_occupied() and seat.connection_id:
            message: Dict[str, Any] = {
                'type': 'game/started',
                'payload': {
                    'yourPosition': i,
                    'yourHand': [c.to_dict() for c in game.hands[i]],
                    'currentPlayer': game.current_player,
                    'players': [s.player_name for s in tourney.seats]
                }
            }
            send_to_connection(seat.connection_id, message)


def broadcast_game_update(tourney: Tourney, game: Game, _player_who_moved: int) -> None:
    """Broadcast game state update after a move"""
    # Send update to all players
    for i, seat in enumerate(tourney.seats):
        if seat.is_occupied() and seat.connection_id:
            message: Dict[str, Any] = {
                'type': 'game/updated',
                'payload': {
                    'currentPlayer': game.current_player,
                    'lastPlay': game.last_play.to_dict() if game.last_play else None,
                    'passedPlayers': game.passed_players,
                    'handCounts': [len(h) for h in game.hands],
                    'yourHand': [c.to_dict() for c in game.hands[i]]  # Send updated hand
                }
            }
            send_to_connection(seat.connection_id, message)


def broadcast_game_over(tourney: Tourney, win_order: List[int], tourney_complete: bool) -> None:
    """Broadcast game over with leaderboard"""
    leaderboard: List[Dict[str, Any]] = tourney.get_leaderboard()

    # Determine points awarded
    points_awarded: List[int] = [4, 2, 1, 0]

    winner_position: Optional[int] = None
    if tourney_complete:
        # Find tournament winner (highest score)
        winner_position = max(range(4), key=lambda i: tourney.seats[i].score)

    message: Dict[str, Any] = {
        'type': 'game/over',
        'payload': {
            'winOrder': win_order,
            'pointsAwarded': points_awarded,
            'leaderboard': leaderboard,
            'tourneyComplete': tourney_complete,
            'winner': winner_position
        }
    }

    # Send to all players
    for seat in tourney.seats:
        if seat.is_occupied() and seat.connection_id:
            send_to_connection(seat.connection_id, message)


def send_to_connection(connection_id: str, data: Dict[str, Any]) -> Dict[str, int]:
    """Send message to a specific connection"""
    try:
        if apigw_management is None:
            raise RuntimeError("apigw_management not initialized")
        apigw_management.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(data, default=decimal_default)
        )
        return {'statusCode': 200}
    except apigw_management.exceptions.GoneException:
        print(f'Connection {connection_id} is gone')
        return {'statusCode': 410}
    except Exception as e:
        print(f'Error sending to connection {connection_id}: {str(e)}')
        return {'statusCode': 500}


def send_error(connection_id: str, code: str, message: str) -> Dict[str, int]:
    """Send error message to connection"""
    return send_to_connection(connection_id, {
        'type': 'error',
        'payload': {
            'code': code,
            'message': message
        }
    })


def decimal_default(obj: Any) -> Any:
    """JSON serializer for Decimal objects"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f'Object of type {type(obj)} is not JSON serializable')
