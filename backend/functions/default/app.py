"""
WebSocket $default handler
Routes incoming messages to appropriate action handlers
"""
import json
import os
import sys
import boto3
from decimal import Decimal

# Add shared layer to path
sys.path.append('/opt/python')
from tourney import Tourney, TourneyStatus

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])
tourney_table = dynamodb.Table(os.environ['TOURNEY_TABLE'])

apigw_management = None  # Initialized per request


def handler(event, context):
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
        elif action == 'tourney/claim_seat':
            return handle_claim_seat(connection_id, player_id, player_name, payload)
        elif action == 'tourney/leave':
            return handle_leave_tourney(connection_id, player_id, payload)
        elif action == 'tourney/ready':
            return handle_ready(connection_id, player_id, payload)
        elif action == 'game/play':
            return handle_play_cards(connection_id, player_id, payload)
        elif action == 'game/pass':
            return handle_pass(connection_id, player_id, payload)
        else:
            return send_error(connection_id, 'UNKNOWN_ACTION', f'Unknown action: {action}')

    except json.JSONDecodeError:
        return send_error(connection_id, 'INVALID_JSON', 'Invalid JSON in message body')
    except Exception as e:
        print(f'Error handling message: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Internal server error')


def handle_ping(connection_id, payload):
    """Handle heartbeat ping"""
    timestamp = payload.get('timestamp', 0)

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


def handle_claim_seat(connection_id, player_id, player_name, payload):
    """Handle tourney/claim_seat action"""
    try:
        # Get or create tournament
        tourney = get_or_create_tourney()

        # Extract seat position from payload
        seat_position = payload.get('seatPosition')

        # Attempt to claim seat
        success, error_code, claimed_position = tourney.claim_seat(
            player_id, player_name, connection_id, seat_position
        )

        if not success:
            return send_error(connection_id, error_code, f'Failed to claim seat: {error_code}')

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


def handle_leave_tourney(connection_id, player_id, payload):
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


def handle_ready(connection_id, player_id, payload):
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

        # If all players ready and game started, broadcast game start
        if tourney.status == TourneyStatus.IN_PROGRESS and all(not s.ready for s in tourney.seats if s.is_occupied()):
            # Game just started, reset ready flags
            for seat in tourney.seats:
                if seat.is_occupied():
                    seat.ready = False
            save_tourney(tourney)

            # TODO: Broadcast game/started message with initial hands
            # broadcast_game_started(tourney)

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error handling ready: {str(e)}')
        import traceback
        traceback.print_exc()
        return send_error(connection_id, 'INTERNAL_ERROR', 'Failed to ready up')


def handle_play_cards(connection_id, player_id, payload):
    """Handle game/play action"""
    # TODO: Implement play cards logic
    return send_error(connection_id, 'NOT_IMPLEMENTED', 'Play cards not yet implemented')


def handle_pass(connection_id, player_id, payload):
    """Handle game/pass action"""
    # TODO: Implement pass logic
    return send_error(connection_id, 'NOT_IMPLEMENTED', 'Pass not yet implemented')


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


def save_tourney(tourney: Tourney):
    """Save tourney to DynamoDB"""
    tourney_table.put_item(Item=tourney.to_dynamo())


def broadcast_tourney_update(tourney: Tourney):
    """Broadcast tourney state update to all connected players"""
    message = {
        'type': 'tourney/updated',
        'payload': tourney.to_client_state()
    }

    # Get all active connections
    for seat in tourney.seats:
        if seat.is_occupied() and seat.connection_id:
            send_to_connection(seat.connection_id, message)


def send_to_connection(connection_id, data):
    """Send message to a specific connection"""
    try:
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


def send_error(connection_id, code, message):
    """Send error message to connection"""
    return send_to_connection(connection_id, {
        'type': 'error',
        'payload': {
            'code': code,
            'message': message
        }
    })


def decimal_default(obj):
    """JSON serializer for Decimal objects"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f'Object of type {type(obj)} is not JSON serializable')
