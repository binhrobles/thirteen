class_name MoveValidator
extends RefCounted

## Result of a move validation attempt
class MoveResult:
	var valid: bool
	var play: Play
	var error: String

	func _init(p_valid: bool, p_play: Play = null, p_error: String = "") -> void:
		valid = p_valid
		play = p_play
		error = p_error


static func try_opening_move(cards: Array[Card]) -> MoveResult:
	var combo := Play.determine_combo(cards)
	if combo == Play.Combo.INVALID:
		return MoveResult.new(false, null, "That's not a valid hand")
	if combo == Play.Combo.BOMB:
		return MoveResult.new(false, null, "Can't open with a bomb")
	var suited := Play.is_run(cards) and Play.is_suited(cards)
	return MoveResult.new(true, Play.new(combo, cards, suited))


static func try_chop(last_play: Play, cards: Array[Card]) -> MoveResult:
	## Chop rules: quad beats single 2, bombs beat 2s by length
	var combo := Play.determine_combo(cards)
	var num_twos := last_play.cards.size()

	# Quad chops a single 2
	if num_twos == 1 and combo == Play.Combo.QUAD:
		return MoveResult.new(true, Play.new(combo, cards))

	# Bomb chops 2s: need (num_twos + 2) pairs = (num_twos + 2) * 2 cards
	if combo == Play.Combo.BOMB and cards.size() == (num_twos + 2) * 2:
		return MoveResult.new(true, Play.new(combo, cards))

	return MoveResult.new(false, null, "You need to play a valid chop")


static func try_standard_move(last_play: Play, cards: Array[Card]) -> MoveResult:
	if not Play.matches_combo(last_play, cards):
		# Special case: chopping 2s
		if last_play.cards[0].rank == Card.Rank.TWO:
			return try_chop(last_play, cards)
		return MoveResult.new(false, null, "You need to play a " + Play.Combo.keys()[last_play.combo])

	# Suited run enforcement
	if last_play.combo == Play.Combo.RUN and last_play.suited and not Play.is_suited(cards):
		return MoveResult.new(false, null, "You need to play a suited run")

	var suited := last_play.suited if last_play.combo == Play.Combo.RUN else false
	var attempt := Play.new(last_play.combo, cards, suited)

	if last_play.value >= attempt.value:
		return MoveResult.new(false, null, "That doesn't beat the last play")

	return MoveResult.new(true, attempt)


static func validate(last_play: Play, cards: Array[Card]) -> MoveResult:
	## Main entry point: validates a move against the current game state.
	## last_play is null when the player has power (opening move).
	if last_play == null:
		return try_opening_move(cards)
	return try_standard_move(last_play, cards)
