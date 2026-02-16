class_name BotPlayer
extends RefCounted

## Simple greedy bot player that chooses the lowest-value valid play


static func choose_play(hand: Array[Card], last_play: Play) -> Array:
	"""
	Choose the lowest-value play from all valid options.

	Strategy:
	- If opening (has power): play the lowest single
	- Otherwise: play the lowest-value combo that beats the current play
	- If no valid plays: return empty array (will pass)

	Args:
		hand: The bot's current cards
		last_play: The last play on the table (null if bot has power)

	Returns:
		Array of cards to play, or empty array to pass
	"""
	# Evaluate all valid plays
	var evaluation := BotHandEvaluator.evaluate(hand, last_play)

	# If opening (has power), play the lowest single
	if last_play == null:
		if not evaluation.singles.is_empty():
			return evaluation.singles[0]  # Singles are already sorted by value
		# Fallback to any valid play if no singles (shouldn't happen with 13 cards)

	# Get all valid plays across all combo types
	var all_plays: Array[Array] = evaluation.get_all_plays()

	if all_plays.is_empty():
		return []  # No valid plays, will pass

	# Sort by value (compare highest card in each play)
	all_plays.sort_custom(_compare_plays)

	# Return the lowest-value play
	return all_plays[0]


static func _compare_plays(play_a: Array, play_b: Array) -> bool:
	"""Compare two plays by their highest card value. Returns true if a < b."""
	return _get_play_value(play_a) < _get_play_value(play_b)


static func _get_play_value(cards: Array) -> int:
	"""Get the value of a play (highest card's value)"""
	var max_value := 0
	for card in cards:
		if card.value > max_value:
			max_value = card.value
	return max_value
