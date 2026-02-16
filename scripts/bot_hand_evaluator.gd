class_name BotHandEvaluator
extends RefCounted

## Enumerates all valid plays from a bot's hand given the current game state


## Result containing all valid plays grouped by combo type
class EvaluationResult:
	var singles: Array[Array] = []
	var pairs: Array[Array] = []
	var triples: Array[Array] = []
	var quads: Array[Array] = []
	var runs: Array[Array] = []
	var bombs: Array[Array] = []

	func get_all_plays() -> Array[Array]:
		"""Returns all valid plays flattened into a single array"""
		var all: Array[Array] = []
		all.append_array(singles)
		all.append_array(pairs)
		all.append_array(triples)
		all.append_array(quads)
		all.append_array(runs)
		all.append_array(bombs)
		return all

	func has_any_plays() -> bool:
		"""Check if there are any valid plays available"""
		return not get_all_plays().is_empty()


static func evaluate(hand: Array[Card], last_play: Play) -> EvaluationResult:
	"""
	Enumerate all valid plays from the given hand.

	Args:
		hand: The bot's current cards
		last_play: The last play on the table (null if bot has power)

	Returns:
		EvaluationResult containing all valid plays grouped by combo type
	"""
	var result := EvaluationResult.new()

	# Group cards by rank for efficient combo detection
	var by_rank := _group_by_rank(hand)

	# Enumerate all possible combos
	result.singles = _find_singles(hand, last_play)
	result.pairs = _find_pairs(by_rank, last_play)
	result.triples = _find_triples(by_rank, last_play)
	result.quads = _find_quads(by_rank, last_play)
	result.runs = _find_runs(hand, last_play)
	result.bombs = _find_bombs(hand, last_play)

	return result


# ── Card grouping ──────────────────────────────────────────────

static func _group_by_rank(hand: Array[Card]) -> Dictionary:
	"""Group cards by rank. Returns Dict[Rank, Array[Card]]"""
	var groups := {}
	for card in hand:
		if not groups.has(card.rank):
			groups[card.rank] = []
		groups[card.rank].append(card)
	return groups


# ── Singles ──────────────────────────────────────────────

static func _find_singles(hand: Array[Card], last_play: Play) -> Array[Array]:
	"""Find all valid single-card plays"""
	var valid: Array[Array] = []

	for card in hand:
		var cards: Array[Card] = [card]
		var move_result = MoveValidator.validate(last_play, cards)
		if move_result.valid:
			valid.append(cards)

	return valid


# ── Pairs ──────────────────────────────────────────────

static func _find_pairs(by_rank: Dictionary, last_play: Play) -> Array[Array]:
	"""Find all valid pair plays"""
	var valid: Array[Array] = []

	for rank in by_rank:
		var cards_of_rank: Array = by_rank[rank]
		if cards_of_rank.size() < 2:
			continue

		# Generate all pairs from this rank
		for i in cards_of_rank.size():
			for j in range(i + 1, cards_of_rank.size()):
				var cards: Array[Card] = [cards_of_rank[i], cards_of_rank[j]]
				var move_result = MoveValidator.validate(last_play, cards)
				if move_result.valid:
					valid.append(cards)

	return valid


# ── Triples ──────────────────────────────────────────────

static func _find_triples(by_rank: Dictionary, last_play: Play) -> Array[Array]:
	"""Find all valid triple plays"""
	var valid: Array[Array] = []

	for rank in by_rank:
		var cards_of_rank: Array = by_rank[rank]
		if cards_of_rank.size() < 3:
			continue

		# Generate all triples from this rank
		for i in cards_of_rank.size():
			for j in range(i + 1, cards_of_rank.size()):
				for k in range(j + 1, cards_of_rank.size()):
					var cards: Array[Card] = [
						cards_of_rank[i],
						cards_of_rank[j],
						cards_of_rank[k]
					]
					var move_result = MoveValidator.validate(last_play, cards)
					if move_result.valid:
						valid.append(cards)

	return valid


# ── Quads ──────────────────────────────────────────────

static func _find_quads(by_rank: Dictionary, last_play: Play) -> Array[Array]:
	"""Find all valid quad plays"""
	var valid: Array[Array] = []

	for rank in by_rank:
		var cards_of_rank: Array = by_rank[rank]
		if cards_of_rank.size() != 4:
			continue

		# All 4 cards of this rank
		var cards: Array[Card] = []
		cards.assign(cards_of_rank)
		var move_result = MoveValidator.validate(last_play, cards)
		if move_result.valid:
			valid.append(cards)

	return valid


# ── Runs ──────────────────────────────────────────────

static func _find_runs(hand: Array[Card], last_play: Play) -> Array[Array]:
	"""Find all valid run plays (3+ consecutive cards, no 2s)"""
	var valid: Array[Array] = []

	# Filter out 2s (cannot be in runs)
	var eligible: Array[Card] = []
	for card in hand:
		if card.rank != Card.Rank.TWO:
			eligible.append(card)

	if eligible.size() < 3:
		return valid

	# Sort by value
	var sorted := eligible.duplicate()
	sorted.sort_custom(Card.compare)

	# Try all possible run lengths and starting positions
	var min_length := 3
	var max_length := sorted.size()

	# If last_play is a run, we must match its length
	if last_play and last_play.combo == Play.Combo.RUN:
		min_length = last_play.cards.size()
		max_length = last_play.cards.size()

	for length in range(min_length, max_length + 1):
		for start_idx in range(sorted.size() - length + 1):
			var run_cards: Array[Card] = []

			# Try to build a run starting at start_idx
			for i in range(start_idx, sorted.size()):
				var card = sorted[i]

				if run_cards.is_empty():
					run_cards.append(card)
				elif card.rank == run_cards[-1].rank + 1:
					run_cards.append(card)
				elif card.rank == run_cards[-1].rank:
					# Skip duplicates for now (TODO: explore multi-card rank options)
					continue
				else:
					# Gap in sequence
					break

				# Check if we have a valid run of the target length
				if run_cards.size() == length:
					var move_result = MoveValidator.validate(last_play, run_cards)
					if move_result.valid:
						valid.append(run_cards.duplicate())
					break

	return valid


# ── Bombs ──────────────────────────────────────────────

static func _find_bombs(hand: Array[Card], last_play: Play) -> Array[Array]:
	"""Find all valid bomb plays (3+ consecutive pairs)"""
	var valid: Array[Array] = []

	# Group by rank
	var by_rank := _group_by_rank(hand)

	# Filter to only ranks with pairs
	var pair_ranks: Array = []
	for rank in by_rank:
		if by_rank[rank].size() >= 2:
			pair_ranks.append(rank)

	if pair_ranks.size() < 3:
		return valid

	# Sort ranks
	pair_ranks.sort()

	# Try all possible bomb lengths and starting positions
	var min_pairs := 3
	var max_pairs := pair_ranks.size()

	# If last_play is a bomb, we must match its length
	if last_play and last_play.combo == Play.Combo.BOMB:
		var required_pairs := last_play.cards.size() / 2
		min_pairs = required_pairs
		max_pairs = required_pairs

	for num_pairs in range(min_pairs, max_pairs + 1):
		for start_idx in range(pair_ranks.size() - num_pairs + 1):
			# Check if we have consecutive ranks
			var consecutive := true
			for i in range(num_pairs - 1):
				if pair_ranks[start_idx + i] + 1 != pair_ranks[start_idx + i + 1]:
					consecutive = false
					break

			if not consecutive:
				continue

			# Build the bomb by taking pairs from consecutive ranks
			var bomb_cards: Array[Card] = []
			for i in range(num_pairs):
				var rank = pair_ranks[start_idx + i]
				var cards_of_rank: Array = by_rank[rank]

				# Take the first two cards of this rank
				# TODO: explore all pair combinations within each rank
				if cards_of_rank.size() >= 2:
					bomb_cards.append(cards_of_rank[0])
					bomb_cards.append(cards_of_rank[1])

			# Validate the bomb
			if bomb_cards.size() == num_pairs * 2:
				var move_result = MoveValidator.validate(last_play, bomb_cards)
				if move_result.valid:
					valid.append(bomb_cards)

	return valid
