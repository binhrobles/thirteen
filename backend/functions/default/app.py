"""
WebSocket $default handler
Routes incoming messages to appropriate action handlers
"""
import json
import os
import boto3
from decimal import Decimal

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
        return send_error(connection_id, 'INTERNAL_ERROR', 'Internal server error')


def handle_ping(connection_id, payload):
    """Handle heartbeat ping"""
    timestamp = payload.get('timestamp', 0)

    # Update last ping time
    connections_table.update_item(
        Key={'connectionId': connection_id},
        UpdateExpression='SET lastPing = :now',
        ExpressionAttributeValues={':now': int(payload.get('timestamp', 0))}
    )

    # Send pong response
    return send_to_connection(connection_id, {
        'type': 'pong',
        'payload': {'timestamp': timestamp}
    })


def handle_claim_seat(connection_id, player_id, player_name, payload):
    """Handle tourney/claim_seat action"""
    # TODO: Implement seat claiming logic
    # - Get tourney from DynamoDB
    # - Check if seat is available
    # - Assign player to seat
    # - Broadcast update to all players
    return send_to_connection(connection_id, {
        'type': 'error',
        'payload': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Seat claiming not yet implemented'
        }
    })


def handle_leave_tourney(connection_id, player_id, payload):
    """Handle tourney/leave action"""
    # TODO: Implement leave tourney logic
    return send_to_connection(connection_id, {
        'type': 'error',
        'payload': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Leave tourney not yet implemented'
        }
    })


def handle_ready(connection_id, player_id, payload):
    """Handle tourney/ready action"""
    # TODO: Implement ready-up logic
    return send_to_connection(connection_id, {
        'type': 'error',
        'payload': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Ready-up not yet implemented'
        }
    })


def handle_play_cards(connection_id, player_id, payload):
    """Handle game/play action"""
    # TODO: Implement play cards logic
    return send_to_connection(connection_id, {
        'type': 'error',
        'payload': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Play cards not yet implemented'
        }
    })


def handle_pass(connection_id, player_id, payload):
    """Handle game/pass action"""
    # TODO: Implement pass logic
    return send_to_connection(connection_id, {
        'type': 'error',
        'payload': {
            'code': 'NOT_IMPLEMENTED',
            'message': 'Pass not yet implemented'
        }
    })


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
