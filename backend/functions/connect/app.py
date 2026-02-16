"""
WebSocket $connect handler
Validates connection and stores in DynamoDB
"""
import json
import os
import time
import boto3
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])


def handler(event, context):
    """
    Handle WebSocket connection request

    Query params expected:
    - playerId: UUID of the player
    - playerName: Display name (optional)
    """
    connection_id = event['requestContext']['connectionId']

    # Extract query parameters
    query_params = event.get('queryStringParameters') or {}
    player_id = query_params.get('playerId')
    player_name = query_params.get('playerName', 'Player')

    # Basic validation
    if not player_id:
        return {
            'statusCode': 403,
            'body': json.dumps({'error': 'playerId required'})
        }

    # Store connection in DynamoDB
    try:
        now = int(time.time())
        ttl = now + (2 * 60 * 60)  # 2 hours

        connections_table.put_item(
            Item={
                'connectionId': connection_id,
                'playerId': player_id,
                'playerName': player_name,
                'connectedAt': now,
                'lastPing': now,
                'ttl': ttl
            }
        )

        print(f'Connection established: {connection_id} for player {player_id}')

        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Connected'})
        }

    except Exception as e:
        print(f'Error storing connection: {str(e)}')
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Failed to establish connection'})
        }
