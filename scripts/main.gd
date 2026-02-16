extends Control

const PlayerHandScene := preload("res://scenes/player_hand.tscn")
const PlayAreaScene := preload("res://scenes/play_area.tscn")
const GameStateScript := preload("res://scripts/game_state.gd")

@onready var play_button: Button = $PlayButton
@onready var pass_button: Button = $PassButton

var game_state
var turn_manager
var player_hand_ui
var play_area_ui


func _ready() -> void:
	_initialize_game()


func _initialize_game() -> void:
	"""Initialize a new game"""
	print("=== Starting New Game ===")

	# Deal cards and create game state
	var hands := Deck.deal(4)
	game_state = GameStateScript.new(hands)

	# Create UI nodes
	player_hand_ui = PlayerHandScene.instantiate()
	add_child(player_hand_ui)
	player_hand_ui.set_cards(game_state.get_hand(0))

	play_area_ui = PlayAreaScene.instantiate()
	add_child(play_area_ui)

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
