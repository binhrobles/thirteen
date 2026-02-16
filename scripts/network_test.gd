extends Control
## Network test scene for WebSocket connection
##
## Simple UI to test WebSocket connection, tournament joining, and message flow

@onready var server_url_input: LineEdit = $VBoxContainer/ServerURLInput
@onready var player_id_input: LineEdit = $VBoxContainer/PlayerIDInput
@onready var player_name_input: LineEdit = $VBoxContainer/PlayerNameInput
@onready var connect_button: Button = $VBoxContainer/ConnectButton
@onready var disconnect_button: Button = $VBoxContainer/DisconnectButton
@onready var status_label: Label = $VBoxContainer/StatusLabel
@onready var claim_seat_button: Button = $VBoxContainer/TournamentControls/ClaimSeatButton
@onready var ready_button: Button = $VBoxContainer/TournamentControls/ReadyButton
@onready var leave_button: Button = $VBoxContainer/TournamentControls/LeaveButton
@onready var seat_position_input: SpinBox = $VBoxContainer/TournamentControls/SeatPositionInput
@onready var message_log: TextEdit = $VBoxContainer/MessageLog


func _ready() -> void:
	# Set default values (production server)
	server_url_input.text = "wss://6u47cryn67.execute-api.us-east-1.amazonaws.com/prod"
	player_id_input.text = _generate_uuid()
	player_name_input.text = "Player_%d" % randi_range(1000, 9999)

	# Connect signals
	connect_button.pressed.connect(_on_connect_pressed)
	disconnect_button.pressed.connect(_on_disconnect_pressed)
	claim_seat_button.pressed.connect(_on_claim_seat_pressed)
	ready_button.pressed.connect(_on_ready_pressed)
	leave_button.pressed.connect(_on_leave_pressed)

	# Connect WebSocket signals
	WebSocketClient.connected.connect(_on_ws_connected)
	WebSocketClient.disconnected.connect(_on_ws_disconnected)
	WebSocketClient.connection_error.connect(_on_ws_error)
	WebSocketClient.message_received.connect(_on_ws_message_received)

	# Specific message handlers
	WebSocketClient.tourney_updated.connect(_on_tourney_updated)
	WebSocketClient.game_started.connect(_on_game_started)
	WebSocketClient.game_updated.connect(_on_game_updated)
	WebSocketClient.game_over.connect(_on_game_over)
	WebSocketClient.error_received.connect(_on_server_error)

	_update_ui_state()


func _process(_delta: float) -> void:
	status_label.text = "Status: %s" % WebSocketClient.get_state_string()


func _on_connect_pressed() -> void:
	var url = server_url_input.text
	var p_id = player_id_input.text
	var p_name = player_name_input.text

	if url.is_empty() or p_id.is_empty():
		_log_message("ERROR: URL and Player ID are required")
		return

	_log_message("Connecting to %s as %s..." % [url, p_name])
	WebSocketClient.connect_to_server(url, p_id, p_name)


func _on_disconnect_pressed() -> void:
	_log_message("Disconnecting...")
	WebSocketClient.disconnect_from_server()


func _on_claim_seat_pressed() -> void:
	var seat_pos = int(seat_position_input.value)
	if seat_pos < 0:
		_log_message("Claiming first available seat...")
		WebSocketClient.claim_seat()
	else:
		_log_message("Claiming seat %d..." % seat_pos)
		WebSocketClient.claim_seat(seat_pos)


func _on_ready_pressed() -> void:
	_log_message("Marking ready...")
	WebSocketClient.ready_up()


func _on_leave_pressed() -> void:
	_log_message("Leaving tournament...")
	WebSocketClient.leave_tournament()


func _on_ws_connected() -> void:
	_log_message("[color=green]✓ Connected to server![/color]")
	_update_ui_state()


func _on_ws_disconnected() -> void:
	_log_message("[color=yellow]Disconnected from server[/color]")
	_update_ui_state()


func _on_ws_error(error: String) -> void:
	_log_message("[color=red]Connection error: %s[/color]" % error)
	_update_ui_state()


func _on_ws_message_received(type: String, payload: Dictionary) -> void:
	_log_message("← %s: %s" % [type, JSON.stringify(payload)])


func _on_tourney_updated(payload: Dictionary) -> void:
	var status = payload.get("status", "unknown")
	var ready_count = payload.get("readyCount", 0)
	var seats = payload.get("seats", [])

	_log_message("[color=cyan]Tournament Update:[/color]")
	_log_message("  Status: %s" % status)
	_log_message("  Ready: %d/4" % ready_count)
	_log_message("  Seats:")
	for seat in seats:
		var name = seat.get("playerName", "Empty")
		var is_ready = seat.get("ready", false)
		var score = seat.get("score", 0)
		var ready_str = "✓" if is_ready else "○"
		_log_message("    [%d] %s %s (Score: %d)" % [seat.get("position"), ready_str, name, score])


func _on_game_started(payload: Dictionary) -> void:
	var your_position = payload.get("yourPosition", -1)
	var your_hand = payload.get("yourHand", [])
	var current_player = payload.get("currentPlayer", -1)
	var players = payload.get("players", [])

	_log_message("[color=green]═══ GAME STARTED ═══[/color]")
	_log_message("  Your position: %d" % your_position)
	_log_message("  Your hand (%d cards): %s" % [your_hand.size(), _format_cards(your_hand)])
	_log_message("  Current player: %d (%s)" % [current_player, players[current_player] if current_player < players.size() else "?"])
	_log_message("  Players: %s" % ", ".join(players))


func _on_game_updated(payload: Dictionary) -> void:
	var current_player = payload.get("currentPlayer", -1)
	var last_play = payload.get("lastPlay")
	var passed_players = payload.get("passedPlayers", [])
	var hand_counts = payload.get("handCounts", [])

	_log_message("[color=cyan]Game Update:[/color]")
	_log_message("  Current player: %d" % current_player)

	if last_play:
		var combo = last_play.get("combo", "?")
		var cards = last_play.get("cards", [])
		_log_message("  Last play: %s - %s" % [combo, _format_cards(cards)])

	_log_message("  Hand counts: %s" % str(hand_counts))
	_log_message("  Passed: %s" % str(passed_players))


func _on_game_over(payload: Dictionary) -> void:
	var win_order = payload.get("winOrder", [])
	var points_awarded = payload.get("pointsAwarded", [])
	var leaderboard = payload.get("leaderboard", [])
	var tourney_complete = payload.get("tourneyComplete", false)

	_log_message("[color=yellow]═══ GAME OVER ═══[/color]")
	_log_message("  Finish order: %s" % str(win_order))
	_log_message("  Points: %s" % str(points_awarded))
	_log_message("  Leaderboard:")
	for entry in leaderboard:
		_log_message("    %s: %d pts (%d wins)" % [
			entry.get("playerName", "?"),
			entry.get("totalScore", 0),
			entry.get("gamesWon", 0)
		])

	if tourney_complete:
		var winner_pos = payload.get("winner", -1)
		_log_message("[color=gold]🏆 TOURNAMENT WINNER: Position %d 🏆[/color]" % winner_pos)


func _on_server_error(code: String, message: String) -> void:
	_log_message("[color=red]Server Error [%s]: %s[/color]" % [code, message])


func _update_ui_state() -> void:
	var is_connected = WebSocketClient.is_server_connected()

	connect_button.disabled = is_connected
	disconnect_button.disabled = not is_connected
	claim_seat_button.disabled = not is_connected
	ready_button.disabled = not is_connected
	leave_button.disabled = not is_connected
	seat_position_input.editable = not is_connected


func _log_message(msg: String) -> void:
	var time_str = Time.get_time_string_from_system()
	message_log.text += "[%s] %s\n" % [time_str, msg]
	# Auto-scroll to bottom
	await get_tree().process_frame
	message_log.scroll_vertical = message_log.get_v_scroll_bar().max_value


func _format_cards(cards: Array) -> String:
	if cards.is_empty():
		return "[]"

	var suit_symbols = ["♠", "♣", "♦", "♥"]
	var rank_names = {
		11: "J", 12: "Q", 13: "K", 14: "A", 15: "2"
	}

	var card_strings = []
	for card in cards:
		var rank = card.get("rank", 0)
		var suit = card.get("suit", 0)
		var rank_str = rank_names.get(rank, str(rank))
		var suit_str = suit_symbols[suit] if suit < suit_symbols.size() else "?"
		card_strings.append("%s%s" % [rank_str, suit_str])

	return "[" + ", ".join(card_strings) + "]"


func _generate_uuid() -> String:
	# Simple UUID v4 generator
	var uuid = ""
	for i in range(32):
		if i == 8 or i == 12 or i == 16 or i == 20:
			uuid += "-"
		uuid += "%x" % randi_range(0, 15)
	return uuid
