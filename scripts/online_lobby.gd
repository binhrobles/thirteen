extends Control
## Online multiplayer lobby
##
## Handles tournament seat selection, ready-up, and transition to game

@onready var connection_panel: Panel = $ConnectionPanel
@onready var lobby_panel: Panel = $LobbyPanel
@onready var loading_panel: Panel = $LoadingPanel
@onready var loading_label: Label = $LoadingPanel/CenterContainer/VBoxContainer/LoadingLabel
@onready var player_name_input: LineEdit = $ConnectionPanel/MarginContainer/VBoxContainer/PlayerNameInput
@onready var connect_button: Button = $ConnectionPanel/MarginContainer/VBoxContainer/ConnectButton
@onready var status_label: Label = $ConnectionPanel/MarginContainer/VBoxContainer/StatusLabel

# Lobby UI
@onready var lobby_status_label: Label = $LobbyPanel/MarginContainer/VBoxContainer/LobbyStatusLabel
@onready var seats_container: VBoxContainer = $LobbyPanel/MarginContainer/VBoxContainer/SeatsContainer
@onready var ready_button: Button = $LobbyPanel/MarginContainer/VBoxContainer/ReadyButton
@onready var leave_button: Button = $LobbyPanel/MarginContainer/VBoxContainer/LeaveButton
@onready var back_button: Button = $ConnectionPanel/MarginContainer/VBoxContainer/BackButton

# Seat buttons (dynamically created)
var seat_buttons: Array[Button] = []
var bot_buttons: Array[Button] = []  # Add/Kick bot buttons
var claimed_seat_position: int = -1
var player_id: String = ""
var is_ready: bool = false


const PROD_SERVER_URL = "wss://6u47cryn67.execute-api.us-east-1.amazonaws.com/prod"


func _ready() -> void:
	# Generate player ID
	player_id = _generate_uuid()

	# Set default player name
	player_name_input.text = "Player_%d" % randi_range(1000, 9999)
	player_name_input.select_all()  # Select all so user can just start typing

	# Connect button signals
	connect_button.pressed.connect(_on_connect_pressed)
	ready_button.pressed.connect(_on_ready_pressed)
	leave_button.pressed.connect(_on_leave_pressed)
	back_button.pressed.connect(_on_back_pressed)

	# Connect WebSocket signals
	WebSocketClient.connected.connect(_on_ws_connected)
	WebSocketClient.disconnected.connect(_on_ws_disconnected)
	WebSocketClient.connection_error.connect(_on_ws_error)
	WebSocketClient.tourney_updated.connect(_on_tourney_updated)
	WebSocketClient.game_started.connect(_on_game_started)
	WebSocketClient.error_received.connect(_on_server_error)

	# Create seat buttons
	_create_seat_buttons()

	# Show connection panel, hide lobby and loading
	connection_panel.show()
	lobby_panel.hide()
	loading_panel.hide()


func _process(_delta: float) -> void:
	status_label.text = "Status: %s" % WebSocketClient.get_state_string()


func _create_seat_buttons() -> void:
	for i in range(4):
		# Create horizontal container for seat row
		var row = HBoxContainer.new()
		row.set("theme_override_constants/separation", 30)
		seats_container.add_child(row)

		# Main seat button (claim or show player info)
		var seat_button = Button.new()
		seat_button.custom_minimum_size = Vector2(0, 140)
		seat_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		seat_button.text = "Seat %d: Empty" % i
		seat_button.set("theme_override_font_sizes/font_size", 52)
		seat_button.pressed.connect(_on_seat_button_pressed.bind(i))
		row.add_child(seat_button)
		seat_buttons.append(seat_button)

		# Bot management button (Add Bot / Kick Bot)
		var bot_button = Button.new()
		bot_button.custom_minimum_size = Vector2(350, 140)
		bot_button.text = "+ Add Bot"
		bot_button.set("theme_override_font_sizes/font_size", 48)
		bot_button.pressed.connect(_on_bot_button_pressed.bind(i))
		row.add_child(bot_button)
		bot_buttons.append(bot_button)


func _on_connect_pressed() -> void:
	var p_name = player_name_input.text.strip_edges()

	if p_name.is_empty():
		status_label.text = "Please enter your name"
		player_name_input.grab_focus()
		return

	# Connect to production server
	status_label.text = "Connecting..."
	connect_button.disabled = true
	WebSocketClient.connect_to_server(PROD_SERVER_URL, player_id, p_name)


func _on_back_pressed() -> void:
	# Disconnect and return to main menu
	if WebSocketClient.is_server_connected():
		WebSocketClient.disconnect_from_server()
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")


func _on_seat_button_pressed(seat_index: int) -> void:
	if not WebSocketClient.is_server_connected():
		return

	# Claim the selected seat
	WebSocketClient.claim_seat(seat_index)


func _on_bot_button_pressed(seat_index: int) -> void:
	if not WebSocketClient.is_server_connected():
		return

	var bot_button = bot_buttons[seat_index]
	var seat_button = seat_buttons[seat_index]

	# Check button text to determine action
	if bot_button.text == "+ Add Bot":
		# Optimistically update UI before network call
		seat_button.text = "Seat %d: ✓ Bot_%d" % [seat_index, seat_index + 1]
		seat_button.disabled = true
		bot_button.text = "✕ Kick Bot"
		bot_button.disabled = false

		# Send request (server broadcast will be source of truth)
		WebSocketClient.add_bot(seat_index)

	elif bot_button.text == "✕ Kick Bot":
		# Optimistically update UI before network call
		seat_button.text = "Seat %d: Empty (Click to claim)" % seat_index
		seat_button.disabled = false
		bot_button.text = "+ Add Bot"
		bot_button.disabled = false

		# Send request (server broadcast will be source of truth)
		WebSocketClient.kick_bot(seat_index)


func _on_ready_pressed() -> void:
	if not WebSocketClient.is_server_connected():
		return

	# Check if this is "Start Game" button
	if ready_button.text.begins_with("🎮"):
		WebSocketClient.start_game()
	else:
		WebSocketClient.ready_up()
		is_ready = true
		ready_button.disabled = true


func _on_leave_pressed() -> void:
	# Leave tournament, disconnect, and return to connection screen
	if WebSocketClient.is_server_connected():
		WebSocketClient.leave_tournament()
		WebSocketClient.disconnect_from_server()

	# Reset local state
	claimed_seat_position = -1
	is_ready = false
	ready_button.disabled = false
	ready_button.text = "✓ Ready to Play"

	# Return to connection panel
	lobby_panel.hide()
	connection_panel.show()
	connect_button.disabled = false


func _on_ws_connected() -> void:
	print("Connected to server - waiting for tourney info...")
	connection_panel.hide()
	lobby_panel.hide()
	loading_panel.show()
	loading_label.text = "Loading tournament..."


func _on_ws_disconnected() -> void:
	print("Disconnected from server")
	lobby_panel.hide()
	connection_panel.show()
	connect_button.disabled = false


func _on_ws_error(_error: String) -> void:
	status_label.text = "Connection failed. Try again."
	connect_button.disabled = false


func _on_tourney_updated(payload: Dictionary) -> void:
	var status = payload.get("status", "unknown")
	var ready_count = payload.get("readyCount", 0)
	var seats = payload.get("seats", [])

	# Hide loading screen and show lobby (if not already shown)
	if loading_panel.visible:
		loading_panel.hide()
		lobby_panel.show()

	# Update lobby status
	lobby_status_label.text = "Tournament Status: %s | Ready: %d/4" % [status, ready_count]

	# Track human players and ready state
	var human_count = 0
	var human_ready_count = 0
	var current_player_ready = false

	# Update seat buttons
	for i in range(min(4, seats.size())):
		var seat = seats[i]
		var seat_button = seat_buttons[i]
		var bot_button = bot_buttons[i]
		var player_name = seat.get("playerName")
		var player_id_in_seat = seat.get("playerId")
		var seat_ready = seat.get("ready", false)
		var is_bot = seat.get("isBot", false) or (player_name and player_name.begins_with("Bot_"))

		# Bots are always ready
		if is_bot:
			seat_ready = true

		if player_name:
			# Track human players
			if not is_bot:
				human_count += 1
				if seat_ready:
					human_ready_count += 1
				if player_id_in_seat == player_id:
					current_player_ready = seat_ready

			var ready_indicator = "✓" if seat_ready else "○"
			seat_button.text = "Seat %d: %s %s" % [i, ready_indicator, player_name]
			seat_button.disabled = true  # Can't claim occupied seats

			# Show kick button for bots, hide for human players
			if is_bot:
				bot_button.text = "✕ Kick Bot"
				bot_button.disabled = false
				bot_button.visible = true
			else:
				bot_button.visible = false
		else:
			seat_button.text = "Seat %d: Empty (Click to claim)" % i
			seat_button.disabled = false

			# Show add bot button for empty seats
			bot_button.text = "+ Add Bot"
			bot_button.disabled = false
			bot_button.visible = true

	# Update ready button based on human player ready state
	if human_count > 0 and human_ready_count == human_count:
		# All human players are ready - show "Start Game"
		ready_button.text = "🎮 Start Game"
		ready_button.disabled = false
	elif current_player_ready:
		# Current player is ready but waiting for others
		ready_button.text = "✓ Ready to Play"
		ready_button.disabled = true
	else:
		# Current player not ready yet
		ready_button.text = "✓ Ready to Play"
		ready_button.disabled = false


func _on_game_started(payload: Dictionary) -> void:
	print("Game starting! Transitioning to game scene...")

	# Store game data for the networked game scene
	var game_data = {
		"your_position": payload.get("yourPosition", -1),
		"your_hand": payload.get("yourHand", []),
		"current_player": payload.get("currentPlayer", -1),
		"players": payload.get("players", [])
	}

	# Store in a singleton or pass to next scene
	# For now, we'll use the WebSocketClient to store it temporarily
	WebSocketClient.set_meta("game_data", game_data)

	# Load the networked game scene
	get_tree().change_scene_to_file("res://scenes/networked_game.tscn")


func _on_server_error(code: String, message: String) -> void:
	lobby_status_label.text = "Error [%s]: %s" % [code, message]

	# Re-enable buttons if we got an error
	if code in ["SEAT_TAKEN", "TOURNEY_FULL"]:
		for button in seat_buttons:
			if not button.disabled:
				button.disabled = false


func _generate_uuid() -> String:
	var uuid = ""
	for i in range(32):
		if i == 8 or i == 12 or i == 16 or i == 20:
			uuid += "-"
		uuid += "%x" % randi_range(0, 15)
	return uuid
