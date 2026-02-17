extends Node
## WebSocket client for multiplayer connection
##
## Singleton that manages WebSocket connection to the backend server.
## Handles connection state, message routing, and reconnection logic.

# Connection states
enum ConnectionState {
	DISCONNECTED,
	CONNECTING,
	CONNECTED,
	RECONNECTING,
	ERROR
}

# Signals
signal connected()
signal disconnected()
signal connection_error(error: String)
signal message_received(type: String, payload: Dictionary)

# Server response types
signal tourney_updated(payload: Dictionary)
signal game_started(payload: Dictionary)
signal game_updated(payload: Dictionary)
signal game_over(payload: Dictionary)
signal pong_received(payload: Dictionary)
signal error_received(code: String, message: String)

# Connection configuration
var websocket_url: String = ""
var player_id: String = ""
var player_name: String = "Player"

# WebSocket instance
var socket: WebSocketPeer = WebSocketPeer.new()
var state: ConnectionState = ConnectionState.DISCONNECTED

# Reconnection settings
var reconnect_enabled: bool = true
var reconnect_delay: float = 1.0
var max_reconnect_delay: float = 30.0
var reconnect_attempts: int = 0
var reconnect_timer: Timer = null

# Heartbeat
var ping_interval: float = 30.0
var ping_timer: Timer = null
var last_ping_time: float = 0.0


func _ready() -> void:
	# Create timers
	reconnect_timer = Timer.new()
	reconnect_timer.one_shot = true
	reconnect_timer.timeout.connect(_on_reconnect_timer_timeout)
	add_child(reconnect_timer)

	ping_timer = Timer.new()
	ping_timer.wait_time = ping_interval
	ping_timer.timeout.connect(_send_ping)
	add_child(ping_timer)


func _process(_delta: float) -> void:
	socket.poll()

	var socket_state = socket.get_ready_state()

	match socket_state:
		WebSocketPeer.STATE_OPEN:
			if state != ConnectionState.CONNECTED:
				_on_connection_established()

			# Process incoming messages
			while socket.get_available_packet_count() > 0:
				var packet = socket.get_packet()
				var text = packet.get_string_from_utf8()
				_handle_message(text)

		WebSocketPeer.STATE_CLOSING:
			pass

		WebSocketPeer.STATE_CLOSED:
			if state == ConnectionState.CONNECTED or state == ConnectionState.CONNECTING:
				_on_connection_closed()


## Connect to WebSocket server
func connect_to_server(url: String, p_id: String, p_name: String = "Player") -> void:
	if state == ConnectionState.CONNECTED or state == ConnectionState.CONNECTING:
		push_warning("Already connected or connecting")
		return

	websocket_url = url
	player_id = p_id
	player_name = p_name

	state = ConnectionState.CONNECTING

	# Build connection URL with query parameters
	var full_url = "%s?playerId=%s&playerName=%s" % [url, player_id, player_name]

	print("Connecting to: ", full_url)

	var error = socket.connect_to_url(full_url)
	if error != OK:
		state = ConnectionState.ERROR
		connection_error.emit("Failed to connect: " + error_string(error))
		_schedule_reconnect()


## Disconnect from server
func disconnect_from_server() -> void:
	reconnect_enabled = false
	reconnect_timer.stop()
	ping_timer.stop()

	if socket.get_ready_state() != WebSocketPeer.STATE_CLOSED:
		socket.close()

	state = ConnectionState.DISCONNECTED
	disconnected.emit()


## Send a message to the server
func send_message(action: String, payload: Dictionary = {}) -> void:
	if state != ConnectionState.CONNECTED:
		push_error("Cannot send message: not connected")
		return

	var message = {
		"action": action,
		"payload": payload
	}

	var json_string = JSON.stringify(message)
	socket.send_text(json_string)
	print("Sent: ", json_string)


## Claim a tournament seat
func claim_seat(seat_position: int = -1) -> void:
	var payload = {}
	if seat_position >= 0:
		payload["seatPosition"] = seat_position
	send_message("tourney/claim_seat", payload)


## Leave tournament
func leave_tournament() -> void:
	send_message("tourney/leave")


## Mark player as ready
func ready_up() -> void:
	send_message("tourney/ready")


## Add bot to a seat
func add_bot(seat_position: int) -> void:
	send_message("tourney/add_bot", {"seatPosition": seat_position})


## Kick bot from a seat
func kick_bot(seat_position: int) -> void:
	send_message("tourney/kick_bot", {"seatPosition": seat_position})


## Start the game (when all human players are ready)
func start_game() -> void:
	send_message("tourney/start")


## Play cards
func play_cards(cards: Array) -> void:
	# Convert Card objects to dictionaries
	var card_dicts = []
	for card in cards:
		if card is Dictionary:
			card_dicts.append(card)
		else:
			# Assume it's a Card object with rank, suit, value properties
			card_dicts.append({
				"rank": card.rank,
				"suit": card.suit,
				"value": card.value
			})

	send_message("game/play", {"cards": card_dicts})


## Pass turn
func pass_turn() -> void:
	send_message("game/pass")


## Internal: Handle connection established
func _on_connection_established() -> void:
	state = ConnectionState.CONNECTED
	reconnect_attempts = 0
	reconnect_delay = 1.0

	print("WebSocket connected!")
	connected.emit()

	# Start heartbeat
	ping_timer.start()

	# Request initial tournament info
	send_message("tourney/info")


## Internal: Handle connection closed
func _on_connection_closed() -> void:
	var was_connected = (state == ConnectionState.CONNECTED)

	ping_timer.stop()
	state = ConnectionState.DISCONNECTED

	print("WebSocket connection closed")
	disconnected.emit()

	if was_connected and reconnect_enabled:
		_schedule_reconnect()


## Internal: Schedule reconnection attempt
func _schedule_reconnect() -> void:
	if not reconnect_enabled:
		return

	state = ConnectionState.RECONNECTING
	reconnect_attempts += 1

	# Exponential backoff
	var delay = min(reconnect_delay * pow(2, reconnect_attempts - 1), max_reconnect_delay)

	print("Reconnecting in %.1f seconds (attempt %d)..." % [delay, reconnect_attempts])
	reconnect_timer.start(delay)


## Internal: Reconnection timer callback
func _on_reconnect_timer_timeout() -> void:
	if reconnect_enabled and state == ConnectionState.RECONNECTING:
		connect_to_server(websocket_url, player_id, player_name)


## Internal: Send heartbeat ping
func _send_ping() -> void:
	last_ping_time = Time.get_unix_time_from_system()
	send_message("ping", {"timestamp": last_ping_time})


## Internal: Handle incoming message
func _handle_message(text: String) -> void:
	var json = JSON.new()
	var error = json.parse(text)

	if error != OK:
		push_error("Failed to parse JSON: " + text)
		return

	var data = json.data
	if not data is Dictionary:
		push_error("Message is not a dictionary: " + text)
		return

	var msg_type = data.get("type", "")
	var payload = data.get("payload", {})

	print("Received: ", msg_type, " -> ", payload)

	# Emit generic message received signal
	message_received.emit(msg_type, payload)

	# Emit specific signals based on type
	match msg_type:
		"pong":
			pong_received.emit(payload)

		"tourney/updated":
			tourney_updated.emit(payload)

		"game/started":
			game_started.emit(payload)

		"game/updated":
			game_updated.emit(payload)

		"game/over":
			game_over.emit(payload)

		"error":
			var code = payload.get("code", "UNKNOWN")
			var message = payload.get("message", "Unknown error")
			print_rich("[color=red]Server error: [%s] %s[/color]" % [code, message])
			error_received.emit(code, message)

		_:
			push_warning("Unknown message type: " + msg_type)


## Get current connection state as string
func get_state_string() -> String:
	match state:
		ConnectionState.DISCONNECTED:
			return "Disconnected"
		ConnectionState.CONNECTING:
			return "Connecting..."
		ConnectionState.CONNECTED:
			return "Connected"
		ConnectionState.RECONNECTING:
			return "Reconnecting..."
		ConnectionState.ERROR:
			return "Error"
		_:
			return "Unknown"


## Check if currently connected to server
func is_server_connected() -> bool:
	return state == ConnectionState.CONNECTED
