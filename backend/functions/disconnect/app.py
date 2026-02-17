"""
WebSocket $disconnect handler
Removes connection and updates tournament state
"""
import json
import os
import sys
import time
import boto3
from typing import Dict, Any, Optional

# Add shared layer to path
sys.path.append('/opt/python')
from tourney import Tourney, TourneyStatus

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])
tourney_table = dynamodb.Table(os.environ['TOURNEY_TABLE'])

apigw_management: Optional[Any] = None  # Initialized per request


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, int]:
    """
    Handle WebSocket disconnection

    Responsibilities:
    - Remove connection from Connections table
    - Update tourney state (mark player as disconnected)
    - Notify other players
    - Start reconnection timeout
    """
    global apigw_management

    connection_id: str = event['requestContext']['connectionId']
    endpoint_url: str = f"https://{event['requestContext']['domainName']}/{event['requestContext']['stage']}"
    apigw_management = boto3.client('apigatewaymanagementapi', endpoint_url=endpoint_url)

    try:
        # Get connection details before deleting
        response = connections_table.get_item(Key={'connectionId': connection_id})
        connection: Optional[Dict[str, Any]] = response.get('Item')

        if not connection:
            print(f'Connection {connection_id} not found')
            return {'statusCode': 200}

        player_id: str = connection['playerId']

        # Remove connection from table
        connections_table.delete_item(Key={'connectionId': connection_id})
        print(f'Connection removed: {connection_id} for player {player_id}')

        # Handle tournament disconnect
        handle_tourney_disconnect(player_id)

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error handling disconnect: {str(e)}')
        return {'statusCode': 500}


def handle_tourney_disconnect(player_id: str) -> None:
    """
    Handle player disconnect from tournament

    For tournaments in WAITING/STARTING mode:
    - Mark player seat with disconnect timestamp
    - Player has 5 seconds to reconnect before being kicked

    For IN_PROGRESS tournaments:
    - Mark as disconnected but keep in game (future: bot takeover)
    """
    try:
        # Get tournament
        response = tourney_table.get_item(Key={'tourneyId': Tourney.GLOBAL_ID})
        if 'Item' not in response:
            return  # No tournament exists

        tourney = Tourney.from_dynamo(response['Item'])

        # Find player's seat
        seat = tourney.get_seat_by_player(player_id)
        if not seat:
            return  # Player not in tournament

        # Only handle disconnect for WAITING/STARTING tournaments
        # In-progress games will handle disconnects differently (future: bot replacement)
        if tourney.status in [TourneyStatus.WAITING, TourneyStatus.STARTING]:
            # Mark seat with disconnect timestamp (5 second grace period)
            disconnect_time = int(time.time())
            seat_dict = tourney.seats[seat.position].to_dict()
            seat_dict['disconnectedAt'] = disconnect_time

            # Update just this seat in DynamoDB
            tourney_table.update_item(
                Key={'tourneyId': Tourney.GLOBAL_ID},
                UpdateExpression='SET seats[' + str(seat.position) + '].disconnectedAt = :disconnect_time',
                ExpressionAttributeValues={':disconnect_time': disconnect_time}
            )

            print(f'Player {player_id} disconnected from tournament (grace period: 5s)')

    except Exception as e:
        print(f'Error handling tournament disconnect: {str(e)}')
        import traceback
        traceback.print_exc()


def broadcast_to_tourney(message: Dict[str, Any]) -> None:
    """Broadcast message to all connected players in the tourney"""
    # TODO: Implement broadcast logic when needed
    pass
