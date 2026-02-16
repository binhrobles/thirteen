extends Control

const PlayerHandScene := preload("res://scenes/player_hand.tscn")
const PlayAreaScene := preload("res://scenes/play_area.tscn")
const GameStateScript := preload("res://scripts/game_state.gd")
const OpponentHandScript := preload("res://scripts/opponent_hand.gd")
const PlayHistoryDrawerScript := preload("res://scripts/play_history_drawer.gd")
const GameOverScreenScript := preload("res://scripts/game_over_screen.gd")

@onready var play_button: Button = $PlayButton
@onready var pass_button: Button = $PassButton
@onready var title_label: Label = $Title
@onready var subtitle_label: Label = $Subtitle

var game_state
var turn_manager
var player_hand_ui
var play_area_ui
var play_history_drawer
var game_over_screen
var opponent_hands: Array = []  # Array of OpponentHand for players 1, 2, 3


func _ready() -> void:
	_setup_buttons()
	_initialize_game()


func _setup_buttons() -> void:
	"""Configure buttons and labels for mobile with responsive sizing"""
	var viewport_size := get_viewport_rect().size
	var button_font_size := int(viewport_size.y * 0.03)  # 3% of viewport height

	# Configure title labels to be larger and more visible
	var title_font_size := int(viewport_size.y * 0.05)  # 5% of viewport height
	var subtitle_font_size := int(viewport_size.y * 0.035)  # 3.5% of viewport height
	title_label.add_theme_font_size_override("font_size", title_font_size)
	subtitle_label.add_theme_font_size_override("font_size", subtitle_font_size)

	# Hide title/subtitle when game starts (they'll be hidden by UI anyway)
	title_label.visible = false
	subtitle_label.visible = false

	# Position buttons between play area (ends at 65%) and player hand (starts at 75%)
	# Buttons go from 66% to 74% of screen height
	var button_top := 0.66
	var button_bottom := 0.74

	# Configure Pass button (left, red)
	pass_button.anchor_left = 0.05
	pass_button.anchor_right = 0.475
	pass_button.anchor_top = button_top
	pass_button.anchor_bottom = button_bottom
	pass_button.offset_left = 0
	pass_button.offset_right = 0
	pass_button.offset_top = 0
	pass_button.offset_bottom = 0
	pass_button.add_theme_font_size_override("font_size", button_font_size)
	# Red button style with opacity
	var pass_style := StyleBoxFlat.new()
	pass_style.bg_color = Color(0.8, 0.2, 0.2, 0.7)  # Red with 70% opacity
	pass_style.corner_radius_top_left = 8
	pass_style.corner_radius_top_right = 8
	pass_style.corner_radius_bottom_left = 8
	pass_style.corner_radius_bottom_right = 8
	pass_button.add_theme_stylebox_override("normal", pass_style)

	# Configure Play button (right, green)
	play_button.anchor_left = 0.525
	play_button.anchor_right = 0.95
	play_button.anchor_top = button_top
	play_button.anchor_bottom = button_bottom
	play_button.offset_left = 0
	play_button.offset_right = 0
	play_button.offset_top = 0
	play_button.offset_bottom = 0
	play_button.add_theme_font_size_override("font_size", button_font_size)
	# Green button style with opacity
	var play_style := StyleBoxFlat.new()
	play_style.bg_color = Color(0.2, 0.7, 0.3, 0.7)  # Green with 70% opacity
	play_style.corner_radius_top_left = 8
	play_style.corner_radius_top_right = 8
	play_style.corner_radius_bottom_left = 8
	play_style.corner_radius_bottom_right = 8
	play_button.add_theme_stylebox_override("normal", play_style)


func _initialize_game() -> void:
	"""Initialize a new game"""
	print("=== Starting New Game ===")

	# Hide buttons during deal sequence
	play_button.hide()
	pass_button.hide()

	# Create play area first (for showing deal messages)
	play_area_ui = PlayAreaScene.instantiate()
	add_child(play_area_ui)

	# Show dealing message
	play_area_ui.show_game_message("Dealing cards...", 1.5)
	await play_area_ui.get_tree().create_timer(1.5).timeout

	# Deal cards and create game state
	var hands := Deck.deal(4)
	var starting_player := Deck.find_starting_player(hands)
	game_state = GameStateScript.new(hands)

	# Show starting player message
	var player_name := "You" if starting_player == 0 else "Player %d" % (starting_player + 1)
	play_area_ui.show_game_message("%s opens" % player_name, 1.5)
	await play_area_ui.get_tree().create_timer(1.5).timeout

	# Clear play area before game starts
	play_area_ui.clear()

	# Show buttons (turn manager will enable/disable as needed)
	play_button.show()
	pass_button.show()

	# Create player hand UI
	player_hand_ui = PlayerHandScene.instantiate()
	add_child(player_hand_ui)
	player_hand_ui.set_cards(game_state.get_hand(0))

	# Create opponent hand displays for players 1, 2, 3
	_create_opponent_hands()

	# Create play history drawer
	play_history_drawer = PlayHistoryDrawerScript.new()
	add_child(play_history_drawer)

	# Connect play area signal to show history drawer
	play_area_ui.history_requested.connect(_on_history_requested)

	# Create game over screen (add last so it renders on top)
	game_over_screen = GameOverScreenScript.new()
	add_child(game_over_screen)
	game_over_screen.new_game_requested.connect(_on_new_game_requested)

	# Create turn manager
	var TurnManagerScript = load("res://scripts/turn_manager.gd")
	turn_manager = TurnManagerScript.new()
	add_child(turn_manager)
	turn_manager.player_hand_ui = player_hand_ui
	turn_manager.play_area_ui = play_area_ui
	turn_manager.play_button = play_button
	turn_manager.pass_button = pass_button

	# Connect turn manager signals for debugging
	turn_manager.turn_started.connect(_on_turn_started)
	turn_manager.move_completed.connect(_on_move_completed)
	turn_manager.game_finished.connect(_on_game_finished)

	# Update opponent hands after each move
	turn_manager.move_completed.connect(_on_move_for_opponent_update)

	# Connect game state signals for updating opponent hands
	game_state.turn_changed.connect(_on_game_state_changed)

	# Start the game
	turn_manager.initialize(game_state)

	print("Game initialized! Starting player: Player %d" % (game_state.current_player + 1))


func _on_turn_started(player_id: int, is_human: bool) -> void:
	var player_type := "Human" if is_human else "Bot"
	print("Turn started: Player %d (%s)" % [player_id + 1, player_type])


func _on_move_completed(player_id: int) -> void:
	print("Move completed by Player %d" % (player_id + 1))


func _on_game_finished() -> void:
	print("=== Game Finished ===")
	print("Win order: ", game_state.win_order)
	if game_over_screen:
		game_over_screen.show_results(game_state.win_order)


func _create_opponent_hands() -> void:
	"""Create and position opponent hand displays for players 1, 2, 3"""
	# Player 1 - Right (next in counter-clockwise order)
	var opponent_1 := OpponentHandScript.new()
	add_child(opponent_1)
	opponent_1.set_player(1)
	opponent_1.set_position_mode(OpponentHandScript.Position.RIGHT)
	opponent_1.update_card_count(game_state.get_hand(1).size())
	opponent_hands.append(opponent_1)

	# Player 2 - Top (opposite)
	var opponent_2 := OpponentHandScript.new()
	add_child(opponent_2)
	opponent_2.set_player(2)
	opponent_2.set_position_mode(OpponentHandScript.Position.TOP)
	opponent_2.update_card_count(game_state.get_hand(2).size())
	opponent_hands.append(opponent_2)

	# Player 3 - Left
	var opponent_3 := OpponentHandScript.new()
	add_child(opponent_3)
	opponent_3.set_player(3)
	opponent_3.set_position_mode(OpponentHandScript.Position.LEFT)
	opponent_3.update_card_count(game_state.get_hand(3).size())
	opponent_hands.append(opponent_3)


func _on_game_state_changed(_player_id: int) -> void:
	"""Update opponent hand displays when game state changes"""
	_update_opponent_hands()


func _update_opponent_hands() -> void:
	"""Refresh all opponent hand card counts"""
	for i in range(opponent_hands.size()):
		var player_id := i + 1  # Players 1, 2, 3
		var hand_size: int = game_state.get_hand(player_id).size()
		opponent_hands[i].update_card_count(hand_size)


func _on_move_for_opponent_update(_player_id: int) -> void:
	"""Update opponent hands after any move"""
	_update_opponent_hands()


func _on_history_requested() -> void:
	"""Show play history drawer when play area is tapped"""
	play_history_drawer.show_history(game_state.play_log)


func _on_new_game_requested() -> void:
	"""Handle new game request from game over screen"""
	print("=== Starting New Game ===")

	# Clean up current game
	if player_hand_ui:
		player_hand_ui.queue_free()
		player_hand_ui = null

	if play_area_ui:
		play_area_ui.queue_free()
		play_area_ui = null

	if turn_manager:
		turn_manager.queue_free()
		turn_manager = null

	for opponent in opponent_hands:
		opponent.queue_free()
	opponent_hands.clear()

	# Keep play_history_drawer and game_over_screen for reuse

	# Wait one frame for cleanup, then initialize new game
	await get_tree().process_frame
	_initialize_game()
