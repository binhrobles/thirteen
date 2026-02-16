extends Control

const PlayerHandScene := preload("res://scenes/player_hand.tscn")
const PlayAreaScene := preload("res://scenes/play_area.tscn")
const GameStateScript := preload("res://scripts/game_state.gd")

var game_state


func _ready() -> void:
	_test_game_state()
	_test_ui()


func _test_game_state() -> void:
	"""Test the game state machine"""
	print("=== Testing GameState ===")
	var hands := Deck.deal(4)
	game_state = GameStateScript.new(hands)

	print("Starting player: ", game_state.current_player)
	print("Starting hand size: ", game_state.get_current_hand().size())

	# Connect signals for debugging
	game_state.turn_changed.connect(_on_turn_changed)
	game_state.round_reset.connect(_on_round_reset)
	game_state.player_won.connect(_on_player_won)

	print("Has power: ", game_state.has_power())


func _on_turn_changed(player_id: int) -> void:
	print("Turn changed to Player ", player_id)


func _on_round_reset(player_id: int) -> void:
	print("Round reset! Player ", player_id, " has power")


func _on_player_won(player_id: int, position: int) -> void:
	print("Player ", player_id, " finished in position ", position)


func _test_ui() -> void:
	"""Test both player hand and play area"""
	if not game_state:
		return

	# Setup player hand
	var player_hand_node = PlayerHandScene.instantiate()
	add_child(player_hand_node)
	player_hand_node.set_cards(game_state.get_hand(0))

	# Setup play area
	var play_area_node = PlayAreaScene.instantiate()
	add_child(play_area_node)

	# Show power state for current player
	var player_name := "Player %d" % game_state.current_player
	play_area_node.show_power_state(player_name, game_state.current_player == 0)
