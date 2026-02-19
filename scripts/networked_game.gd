extends Control
## Networked multiplayer game
##
## Handles online game with WebSocket synchronization

const PlayerHandScene := preload("res://scenes/player_hand.tscn")
const PlayAreaScene := preload("res://scenes/play_area.tscn")
const OpponentHandScript := preload("res://scripts/opponent_hand.gd")
const CardScript := preload("res://scripts/card.gd")
const InGameMenuScript := preload("res://scripts/in_game_menu.gd")
@onready var play_button: Button = $PlayButton
@onready var pass_button: Button = $PassButton
@onready var menu_button: Button = $MenuButton
@onready var status_label: Label = $StatusLabel

var player_hand_ui
var play_area_ui
var in_game_menu
var opponent_hands: Array = []

# Network game state
var your_position: int = -1
var current_player_position: int = -1
var player_names: Array[String] = []
var your_hand_cards: Array = []  # Array of card dictionaries


func _ready() -> void:
	# Get game data from WebSocketClient meta
	var game_data = WebSocketClient.get_meta("game_data", {})

	if game_data.is_empty():
		push_error("No game data found! Returning to lobby.")
		get_tree().change_scene_to_file("res://scenes/online_lobby.tscn")
		return

	# Extract game start data
	your_position = game_data.get("your_position", -1)
	your_hand_cards = game_data.get("your_hand", [])
	current_player_position = game_data.get("current_player", -1)
	player_names.assign(game_data.get("players", []))

	print("Starting networked game:")
	print("  Your position: ", your_position)
	print("  Your hand: ", your_hand_cards.size(), " cards")
	print("  Current player: ", current_player_position)
	print("  Players: ", player_names)

	# Connect WebSocket signals
	WebSocketClient.game_updated.connect(_on_game_updated)
	WebSocketClient.game_over.connect(_on_game_over)
	WebSocketClient.error_received.connect(_on_server_error)
	WebSocketClient.disconnected.connect(_on_disconnected)

	# Setup UI
	_setup_buttons()
	_setup_game_ui()

	# Create in-game menu
	in_game_menu = InGameMenuScript.new()
	add_child(in_game_menu)
	in_game_menu.exit_game_requested.connect(_on_exit_game_requested)

	# Update turn indicator
	_update_turn_display()


func _setup_buttons() -> void:
	var viewport_size := get_viewport_rect().size
	var button_font_size := int(viewport_size.y * 0.03)

	# Position buttons
	var button_top := 0.68
	var button_bottom := 0.76

	# Pass button (left, red)
	pass_button.anchor_left = 0.05
	pass_button.anchor_right = 0.475
	pass_button.anchor_top = button_top
	pass_button.anchor_bottom = button_bottom
	pass_button.add_theme_font_size_override("font_size", button_font_size)

	var pass_style := StyleBoxFlat.new()
	pass_style.bg_color = Color(0.8, 0.2, 0.2, 0.7)
	pass_style.corner_radius_top_left = 8
	pass_style.corner_radius_top_right = 8
	pass_style.corner_radius_bottom_left = 8
	pass_style.corner_radius_bottom_right = 8
	pass_button.add_theme_stylebox_override("normal", pass_style)
	# Grey disabled style
	var pass_disabled_style := StyleBoxFlat.new()
	pass_disabled_style.bg_color = Color(0.3, 0.3, 0.3, 0.5)
	pass_disabled_style.corner_radius_top_left = 8
	pass_disabled_style.corner_radius_top_right = 8
	pass_disabled_style.corner_radius_bottom_left = 8
	pass_disabled_style.corner_radius_bottom_right = 8
	pass_button.add_theme_stylebox_override("disabled", pass_disabled_style)
	pass_button.pressed.connect(_on_pass_pressed)

	# Play button (right, green)
	play_button.anchor_left = 0.525
	play_button.anchor_right = 0.95
	play_button.anchor_top = button_top
	play_button.anchor_bottom = button_bottom
	play_button.add_theme_font_size_override("font_size", button_font_size)

	var play_style := StyleBoxFlat.new()
	play_style.bg_color = Color(0.2, 0.7, 0.3, 0.7)
	play_style.corner_radius_top_left = 8
	play_style.corner_radius_top_right = 8
	play_style.corner_radius_bottom_left = 8
	play_style.corner_radius_bottom_right = 8
	play_button.add_theme_stylebox_override("normal", play_style)
	# Grey disabled style
	var play_disabled_style := StyleBoxFlat.new()
	play_disabled_style.bg_color = Color(0.3, 0.3, 0.3, 0.5)
	play_disabled_style.corner_radius_top_left = 8
	play_disabled_style.corner_radius_top_right = 8
	play_disabled_style.corner_radius_bottom_left = 8
	play_disabled_style.corner_radius_bottom_right = 8
	play_button.add_theme_stylebox_override("disabled", play_disabled_style)
	play_button.pressed.connect(_on_play_pressed)

	# Status label
	status_label.anchor_left = 0.05
	status_label.anchor_right = 0.95
	status_label.anchor_top = 0.62
	status_label.anchor_bottom = 0.66
	status_label.add_theme_font_size_override("font_size", int(viewport_size.y * 0.025))
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER

	# Configure Menu button (top right, cog icon)
	menu_button.anchor_left = 1.0
	menu_button.anchor_right = 1.0
	menu_button.anchor_top = 0.0
	menu_button.anchor_bottom = 0.0
	menu_button.offset_left = -int(viewport_size.x * 0.12)  # 12% from right
	menu_button.offset_top = int(viewport_size.y * 0.024)  # 2.4% from top
	menu_button.offset_right = -int(viewport_size.x * 0.024)  # 2.4% from right
	menu_button.offset_bottom = int(viewport_size.y * 0.095)  # Height ~7% of viewport
	menu_button.add_theme_font_size_override("font_size", int(viewport_size.y * 0.05))  # 5% of viewport height
	# White cog symbol with no background panel
	menu_button.add_theme_color_override("font_color", Color(1, 1, 1, 1))  # White
	var transparent_style := StyleBoxEmpty.new()
	menu_button.add_theme_stylebox_override("normal", transparent_style)
	menu_button.add_theme_stylebox_override("hover", transparent_style)
	menu_button.add_theme_stylebox_override("pressed", transparent_style)
	menu_button.add_theme_stylebox_override("focus", transparent_style)
	menu_button.pressed.connect(_on_menu_button_pressed)


func _setup_game_ui() -> void:
	# Create play area
	play_area_ui = PlayAreaScene.instantiate()
	add_child(play_area_ui)

	# Create opponent hands (positions relative to you)
	for i in range(3):
		var opponent = OpponentHandScript.new()
		add_child(opponent)

		# Calculate absolute position of this opponent (0-3)
		var abs_position = (your_position + i + 1) % 4

		# Map relative position to screen position enum
		var pos_mode: OpponentHandScript.Position
		if i == 0:
			pos_mode = OpponentHandScript.Position.RIGHT  # Next player (clockwise)
		elif i == 1:
			pos_mode = OpponentHandScript.Position.TOP    # Across from you
		else:  # i == 2
			pos_mode = OpponentHandScript.Position.LEFT   # Previous player

		opponent.set_player(abs_position)
		opponent.set_position_mode(pos_mode)
		opponent.update_card_count(13)

		opponent_hands.append(opponent)

	# Create player hand
	player_hand_ui = PlayerHandScene.instantiate()
	add_child(player_hand_ui)

	# Convert card dictionaries to Card objects
	var initial_cards: Array[Card] = []
	for card_data in your_hand_cards:
		var card = CardScript.new(
			card_data.get("rank", 3),
			card_data.get("suit", 0)
		)
		initial_cards.append(card)

	# Set initial hand
	player_hand_ui.set_cards(initial_cards)


func _update_turn_display() -> void:
	if current_player_position == your_position:
		status_label.text = "YOUR TURN - Play or Pass"
		play_button.disabled = false
		pass_button.disabled = false
	else:
		var current_player_name = player_names[current_player_position] if current_player_position < player_names.size() else "Player %d" % (current_player_position + 1)
		status_label.text = "Waiting for %s..." % current_player_name
		play_button.disabled = true
		pass_button.disabled = true


func _get_selected_cards_data() -> Array:
	"""Get currently selected cards from hand as data for server"""
	var cards_data = []
	if player_hand_ui:
		var selected = player_hand_ui.get_selected_cards()
		for card in selected:
			cards_data.append({
				"rank": card.rank,
				"suit": card.suit,
				"value": card.value
			})
	return cards_data


func _on_play_pressed() -> void:
	if current_player_position != your_position:
		return

	# Get currently selected cards
	var cards_to_play = _get_selected_cards_data()
	if cards_to_play.is_empty():
		status_label.text = "Select cards to play!"
		return

	print("Playing cards: ", cards_to_play)

	# Send play action to server
	WebSocketClient.play_cards(cards_to_play)

	# Disable buttons while waiting for server response
	play_button.disabled = true
	pass_button.disabled = true
	status_label.text = "Sending move..."


func _on_pass_pressed() -> void:
	if current_player_position != your_position:
		return

	print("Passing turn")

	# Send pass action to server
	WebSocketClient.pass_turn()

	# Disable buttons while waiting for server response
	play_button.disabled = true
	pass_button.disabled = true
	status_label.text = "Sending pass..."


func _on_game_updated(payload: Dictionary) -> void:
	print("Game state updated: ", payload)

	# Update current player
	current_player_position = payload.get("currentPlayer", current_player_position)

	# Update last play in play area
	var last_play = payload.get("lastPlay")
	if last_play and play_area_ui:
		var combo = last_play.get("combo", "")
		var cards_data = last_play.get("cards", [])
		# Convert to Card objects for display
		var cards = []
		for card_data in cards_data:
			var card = CardScript.new(
				card_data.get("rank", 3),
				card_data.get("suit", 0)
			)
			cards.append(card)
		play_area_ui.display_play(cards, combo)

	# Update your hand
	var your_hand_data = payload.get("yourHand", [])
	if not your_hand_data.is_empty() and player_hand_ui:
		# Convert card data to Card objects
		var updated_cards: Array[Card] = []
		for card_data in your_hand_data:
			var card = CardScript.new(
				card_data.get("rank", 3),
				card_data.get("suit", 0)
			)
			updated_cards.append(card)

		# Update hand with new cards
		player_hand_ui.set_cards(updated_cards)

	# Update opponent hand counts
	var hand_counts = payload.get("handCounts", [])
	for i in range(opponent_hands.size()):
		var opponent_pos = opponent_hands[i].player_id
		if opponent_pos < hand_counts.size():
			opponent_hands[i].update_card_count(hand_counts[opponent_pos])

	# Update turn display
	_update_turn_display()


func _on_game_over(payload: Dictionary) -> void:
	print("Game over! ", payload)

	var win_order = payload.get("winOrder", [])
	var points_awarded = payload.get("pointsAwarded", [])
	var tourney_complete = payload.get("tourneyComplete", false)

	# Show game over message
	var message = "Game Over!\n\nFinish Order:\n"
	for i in range(win_order.size()):
		var pos = win_order[i]
		var player_name = player_names[pos] if pos < player_names.size() else "Player %d" % (pos + 1)
		var points = points_awarded[i] if i < points_awarded.size() else 0
		message += "%d. %s (+%d pts)\n" % [i + 1, player_name, points]

	if tourney_complete:
		message += "\n🏆 Tournament Complete! 🏆"

	status_label.text = message

	# Disable buttons
	play_button.disabled = true
	pass_button.disabled = true

	# TODO: Show proper game over screen with option to return to lobby


func _on_server_error(code: String, message: String) -> void:
	print_rich("[color=red]Server error [%s]: %s[/color]" % [code, message])
	status_label.text = "Error: %s" % message

	# Re-enable buttons if it was a move validation error
	if code in ["NOT_YOUR_TURN", "INVALID_COMBO", "CANT_BEAT_LAST_PLAY", "CANT_PASS"]:
		_update_turn_display()


func _on_disconnected() -> void:
	print("Disconnected from server!")
	status_label.text = "Disconnected - Returning to lobby..."

	# Wait a moment then return to lobby
	await get_tree().create_timer(2.0).timeout
	get_tree().change_scene_to_file("res://scenes/online_lobby.tscn")


func _on_menu_button_pressed() -> void:
	in_game_menu.show_menu()


func _on_exit_game_requested() -> void:
	WebSocketClient.disconnect_from_server()
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")
