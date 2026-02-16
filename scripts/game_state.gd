class_name GameState
extends RefCounted

## Manages the core game state machine for Tiến Lên

signal turn_changed(player_id: int)
signal round_reset(player_id: int)  # Emitted when a player gets power
signal player_won(player_id: int, position: int)
signal game_over(win_order: Array[int])

## Game state
var hands: Array  # Array of Array[Card]
var last_play: Play = null
var last_play_by: int = -1  # Who made the last play (-1 if none)
var current_player: int = 0
var players_in_round: Array[bool] = [true, true, true, true]  # Who hasn't passed this round
var players_in_game: Array[bool] = [true, true, true, true]  # Who hasn't won yet
var win_order: Array[int] = []  # Order of winners [1st, 2nd, 3rd]
var play_log: Array = []  # History of plays {player: int, play: Play or "pass"}

const NUM_PLAYERS := 4


func _init(dealt_hands: Array) -> void:
	hands = dealt_hands
	current_player = Deck.find_starting_player(hands)


func can_play(player_id: int, cards: Array[Card]) -> MoveValidator.MoveResult:
	"""Check if a play is valid for the current player"""
	if player_id != current_player:
		return MoveValidator.MoveResult.new(false, null, "Not your turn")

	if not players_in_game[player_id]:
		return MoveValidator.MoveResult.new(false, null, "You already won")

	# Validate the move using MoveValidator
	var result := MoveValidator.validate(last_play, cards)
	if not result.valid:
		return result

	# Check that player has these cards
	for card in cards:
		if not _has_card(player_id, card):
			return MoveValidator.MoveResult.new(false, null, "You don't have that card")

	return result


func play_cards(player_id: int, cards: Array[Card]) -> MoveValidator.MoveResult:
	"""Execute a play (assumes validation has passed)"""
	var result := can_play(player_id, cards)
	if not result.valid:
		return result

	# Remove cards from hand
	for card in cards:
		var idx: int = hands[player_id].find(card)
		if idx >= 0:
			hands[player_id].remove_at(idx)

	# Update game state
	last_play = result.play
	last_play_by = player_id  # Track who made this play
	play_log.append({"player": player_id, "play": result.play})

	# Check if player won (emptied hand)
	if hands[player_id].is_empty():
		_player_wins(player_id)
	else:
		_advance_turn()
		# Check if turn came back to the player who made the last play (won the round)
		if current_player == last_play_by:
			_reset_round()

	return result


func pass_turn(player_id: int) -> bool:
	"""Player passes this round. Returns false if can't pass."""
	if player_id != current_player:
		return false

	if not players_in_game[player_id]:
		return false

	# Can't pass if you have power (last_play is null)
	if last_play == null:
		return false

	# Mark player as passed for this round
	players_in_round[player_id] = false
	play_log.append({"player": player_id, "play": "pass"})

	# Check if everyone else has passed
	if _check_round_over():
		_reset_round()
	else:
		_advance_turn()
		# Check if turn came back to the player who made the last play (won the round)
		if current_player == last_play_by:
			_reset_round()

	return true


func _player_wins(player_id: int) -> void:
	"""Handle a player winning (emptying their hand)"""
	players_in_game[player_id] = false
	players_in_round[player_id] = false
	win_order.append(player_id)

	var position := win_order.size()
	player_won.emit(player_id, position)

	# Check if game is over (only 1 player left)
	var remaining := 0
	for i in NUM_PLAYERS:
		if players_in_game[i]:
			remaining += 1

	if remaining == 1:
		# Add the last player to win_order
		for i in NUM_PLAYERS:
			if players_in_game[i]:
				win_order.append(i)
				break
		game_over.emit(win_order)
	else:
		# Check if round is over
		if _check_round_over():
			_reset_round()
		else:
			_advance_turn()


func _check_round_over() -> bool:
	"""Check if all active players have passed"""
	for i in NUM_PLAYERS:
		if players_in_game[i] and players_in_round[i]:
			return false
	return true


func _reset_round() -> void:
	"""Reset the round - give power to current player"""
	last_play = null
	last_play_by = -1  # Reset who made the last play
	for i in NUM_PLAYERS:
		players_in_round[i] = players_in_game[i]
	# Add round reset marker to play log
	play_log.append("round_reset")
	round_reset.emit(current_player)
	# Note: Don't emit turn_changed here - it's not a turn change, just a round reset
	# TurnManager will restart the turn via the round_reset signal


func _advance_turn() -> void:
	"""Move to the next active player"""
	var start := current_player
	while true:
		current_player = (current_player + 1) % NUM_PLAYERS
		# Skip players who have passed or won
		if players_in_game[current_player] and players_in_round[current_player]:
			break
		# Safety check to prevent infinite loop
		if current_player == start:
			# This shouldn't happen, but if it does, reset the round
			_reset_round()
			return
	turn_changed.emit(current_player)


func _has_card(player_id: int, card: Card) -> bool:
	"""Check if player has a specific card"""
	for c in hands[player_id]:
		if c.value == card.value:
			return true
	return false


func get_current_hand() -> Array[Card]:
	"""Get the current player's hand"""
	return hands[current_player]


func get_hand(player_id: int) -> Array[Card]:
	"""Get a specific player's hand"""
	return hands[player_id]


func is_game_over() -> bool:
	"""Check if the game is over"""
	return win_order.size() >= NUM_PLAYERS - 1


func has_power() -> bool:
	"""Check if current player has power (can play anything)"""
	return last_play == null
