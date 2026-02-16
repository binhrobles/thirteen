extends Control
## Online multiplayer lobby
##
## Handles tournament seat selection, ready-up, and transition to game

@onready var connection_panel: Panel = $ConnectionPanel
@onready var lobby_panel: Panel = $LobbyPanel
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

	# Show connection panel, hide lobby
	connection_panel.show()
	lobby_panel.hide()


func _process(_delta: float) -> void:
	status_label.text = "Status: %s" % WebSocketClient.get_state_string()


func _create_seat_buttons() -> void:
	for i in range(4):
		var button = Button.new()
		button.custom_minimum_size = Vector2(0, 80)
		button.text = "Seat %d: Empty" % i
		button.pressed.connect(_on_seat_button_pressed.bind(i))
		seats_container.add_child(button)
		seat_buttons.append(button)


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


func _on_ready_pressed() -> void:
	if not WebSocketClient.is_server_connected():
		return

	WebSocketClient.ready_up()
	is_ready = true
	ready_button.disabled = true


func _on_leave_pressed() -> void:
	if not WebSocketClient.is_server_connected():
		return

	WebSocketClient.leave_tournament()
	claimed_seat_position = -1
	is_ready = false
	ready_button.disabled = false


func _on_ws_connected() -> void:
	print("Connected to server - showing lobby")
	connection_panel.hide()
	lobby_panel.show()
	lobby_status_label.text = "Waiting for players..."


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

	# Update lobby status
	lobby_status_label.text = "Tournament Status: %s | Ready: %d/4" % [status, ready_count]

	# Update seat buttons
	for i in range(min(4, seats.size())):
		var seat = seats[i]
		var seat_button = seat_buttons[i]
		var player_name = seat.get("playerName")
		var seat_ready = seat.get("ready", false)

		if player_name:
			var ready_indicator = "✓" if seat_ready else "○"
			seat_button.text = "Seat %d: %s %s" % [i, ready_indicator, player_name]
			seat_button.disabled = true  # Can't claim occupied seats
		else:
			seat_button.text = "Seat %d: Empty (Click to claim)" % i
			seat_button.disabled = false


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
