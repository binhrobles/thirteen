"""
WebSocket $disconnect handler
Removes connection and updates tournament state
"""
import json
import os
import boto3
from typing import Dict, Any, Optional

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

        # TODO: Update tourney state
        # - Mark player as disconnected
        # - Start 60s reconnection timer
        # - Notify other players

        # TODO: Broadcast disconnect message to other players in tourney
        # broadcast_to_tourney({
        #     'type': 'player/disconnected',
        #     'payload': {'playerId': player_id}
        # })

        return {'statusCode': 200}

    except Exception as e:
        print(f'Error handling disconnect: {str(e)}')
        return {'statusCode': 500}


def broadcast_to_tourney(message: Dict[str, Any]) -> None:
    """Broadcast message to all connected players in the tourney"""
    # TODO: Implement broadcast logic
    # - Get all connections from Connections table
    # - Filter to players in active tourney
    # - Send message to each connection
    pass
