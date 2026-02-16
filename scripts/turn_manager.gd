class_name TurnManager
extends Node

## Orchestrates turn flow between human and bots with UI updates

signal turn_started(player_id: int, is_human: bool)
signal move_completed(player_id: int)
signal game_finished()

var player_hand_ui
var play_area_ui
var play_button: Button
var pass_button: Button

var game_state
var bot_turn_delay := 1.5  # Seconds before bot plays

const HUMAN_PLAYER := 0


func initialize(p_game_state) -> void:
	"""Initialize the turn manager with game state"""
	game_state = p_game_state

	# Connect game state signals
	game_state.turn_changed.connect(_on_turn_changed)
	game_state.round_reset.connect(_on_round_reset)
	game_state.player_won.connect(_on_player_won)
	game_state.game_over.connect(_on_game_over)

	# Connect button signals
	if play_button:
		play_button.pressed.connect(_on_play_button_pressed)
	if pass_button:
		pass_button.pressed.connect(_on_pass_button_pressed)

	# Start first turn
	_start_turn()


func _start_turn() -> void:
	"""Start the current player's turn"""
	var current: int = game_state.current_player
	var is_human: bool = current == HUMAN_PLAYER

	turn_started.emit(current, is_human)
	_update_ui()

	if is_human:
		_enable_human_turn()
	else:
		_start_bot_turn()


func _enable_human_turn() -> void:
	"""Enable UI for human player's turn"""
	if play_button:
		play_button.disabled = false
		play_button.text = "Play" if game_state.has_power() else "Play Selected"

	if pass_button:
		pass_button.disabled = not game_state.last_play  # Can't pass with power
		pass_button.text = "Pass"

	# Update play area
	if play_area_ui:
		if game_state.has_power():
			play_area_ui.show_power_state("You", true)
		elif game_state.last_play:
			# Keep showing the last play
			pass


func _start_bot_turn() -> void:
	"""Start a bot player's turn with delay"""
	var player_id: int = game_state.current_player

	# Disable human controls
	if play_button:
		play_button.disabled = true
	if pass_button:
		pass_button.disabled = true

	# Update play area
	if play_area_ui:
		var player_name := "Player %d" % (player_id + 1)
		if game_state.has_power():
			play_area_ui.show_power_state(player_name, false)
		else:
			play_area_ui.show_waiting(player_name)

	# Delay before bot plays
	await get_tree().create_timer(bot_turn_delay).timeout
	_execute_bot_turn(player_id)


func _execute_bot_turn(player_id: int) -> void:
	"""Execute bot's turn using hand evaluator"""
	var hand: Array = game_state.get_hand(player_id)

	# Evaluate all valid plays from bot's hand
	var evaluation := BotHandEvaluator.evaluate(hand, game_state.last_play)

	# Check if bot has any valid plays
	if not evaluation.has_any_plays():
		# No valid plays - must pass
		if game_state.last_play:
			game_state.pass_turn(player_id)
			_show_bot_pass(player_id)
		else:
			# This shouldn't happen - with power, should always have a valid play
			print("ERROR: Bot has power but no valid plays!")
		return

	# Simple greedy strategy: play the lowest valid combo
	# Priority: singles > pairs > triples > quads > runs > bombs
	var cards_to_play: Array

	if not evaluation.singles.is_empty():
		cards_to_play = evaluation.singles[0]  # Play lowest single
	elif not evaluation.pairs.is_empty():
		cards_to_play = evaluation.pairs[0]
	elif not evaluation.triples.is_empty():
		cards_to_play = evaluation.triples[0]
	elif not evaluation.quads.is_empty():
		cards_to_play = evaluation.quads[0]
	elif not evaluation.runs.is_empty():
		cards_to_play = evaluation.runs[0]
	elif not evaluation.bombs.is_empty():
		cards_to_play = evaluation.bombs[0]

	# Execute the play
	if not cards_to_play.is_empty():
		game_state.play_cards(player_id, cards_to_play)
		_show_bot_play(player_id, cards_to_play)
	else:
		# Shouldn't reach here
		print("ERROR: Bot evaluation found plays but none selected!")


func _show_bot_play(player_id: int, cards: Array[Card]) -> void:
	"""Show bot's played cards in play area"""
	if play_area_ui:
		var player_name := "Player %d" % (player_id + 1)
		play_area_ui.show_played_hand(cards, player_name)

	move_completed.emit(player_id)


func _show_bot_pass(player_id: int) -> void:
	"""Show that bot passed"""
	print("Player %d passed" % (player_id + 1))
	move_completed.emit(player_id)


func _on_play_button_pressed() -> void:
	"""Handle human player's play button press"""
	if not player_hand_ui:
		return

	var selected: Array = player_hand_ui.get_selected_cards()
	if selected.is_empty():
		print("No cards selected")
		return

	var result = game_state.can_play(HUMAN_PLAYER, selected)
	if not result.valid:
		print("Invalid play: ", result.error)
		return

	# Execute the play
	game_state.play_cards(HUMAN_PLAYER, selected)

	# Update UI - refresh hand from game state to ensure sync
	player_hand_ui.set_cards(game_state.get_hand(HUMAN_PLAYER))

	if play_area_ui:
		play_area_ui.show_played_hand(selected, "You")

	move_completed.emit(HUMAN_PLAYER)


func _on_pass_button_pressed() -> void:
	"""Handle human player's pass button press"""
	if game_state.pass_turn(HUMAN_PLAYER):
		print("You passed")
		if player_hand_ui:
			player_hand_ui.clear_selection()
		move_completed.emit(HUMAN_PLAYER)
	else:
		print("Can't pass right now")


func _on_turn_changed(player_id: int) -> void:
	"""Handle turn change from game state"""
	print("Turn changed to Player %d" % (player_id + 1))
	_start_turn()


func _on_round_reset(player_id: int) -> void:
	"""Handle round reset (power granted)"""
	print("Round reset! Player %d has power" % [player_id + 1])
	# Turn will be started via turn_changed signal


func _on_player_won(player_id: int, position: int) -> void:
	"""Handle player finishing"""
	print("Player %d finished in position %d" % [player_id + 1, position])

	# Update player hand if it's the human
	if player_id == HUMAN_PLAYER and player_hand_ui:
		player_hand_ui.clear_selection()


func _on_game_over(win_order: Array[int]) -> void:
	"""Handle game over"""
	print("Game over! Win order: ", win_order)

	# Disable controls
	if play_button:
		play_button.disabled = true
	if pass_button:
		pass_button.disabled = true

	game_finished.emit()


func _update_ui() -> void:
	"""Update UI for current game state"""
	# Don't update player hand here - it's only updated when cards are actually played/removed
	# Recreating cards would lose selection state
	pass
