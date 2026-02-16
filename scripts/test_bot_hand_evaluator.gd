extends Node

## Manual test script for BotHandEvaluator
## Run this scene in Godot to verify bot hand evaluation logic


func _ready() -> void:
	print("\n=== Running BotHandEvaluator Tests ===\n")

	test_singles()
	test_pairs()
	test_triples()
	test_quads()
	test_runs()
	test_bombs()
	test_opening_move()
	test_beating_plays()
	test_chop_rules()

	print("\n=== All Tests Complete ===\n")


# ── Test Helpers ──────────────────────────────────────────────

func make_card(rank: Card.Rank, suit: Card.Suit) -> Card:
	return Card.new(rank, suit)


func make_hand(card_specs: Array) -> Array[Card]:
	"""Create a hand from array of [rank, suit] pairs"""
	var hand: Array[Card] = []
	for spec in card_specs:
		hand.append(make_card(spec[0], spec[1]))
	return hand


func assert_count(result: BotHandEvaluator.EvaluationResult, combo_type: String, expected: int) -> void:
	var actual := 0
	match combo_type:
		"singles":
			actual = result.singles.size()
		"pairs":
			actual = result.pairs.size()
		"triples":
			actual = result.triples.size()
		"quads":
			actual = result.quads.size()
		"runs":
			actual = result.runs.size()
		"bombs":
			actual = result.bombs.size()

	if actual != expected:
		print("  ✗ Expected %d %s, got %d" % [expected, combo_type, actual])
	else:
		print("  ✓ Found %d %s" % [actual, combo_type])


# ── Singles Tests ──────────────────────────────────────────────

func test_singles() -> void:
	print("Testing singles enumeration...")

	# Opening move: all cards are valid singles
	var hand := make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.FIVE, Card.Suit.HEARTS],
		[Card.Rank.SEVEN, Card.Suit.CLUBS]
	])

	var result := BotHandEvaluator.evaluate(hand, null)
	assert_count(result, "singles", 3)

	# Must beat a single 5♥
	var last_play := Play.new(Play.Combo.SINGLE, make_hand([
		[Card.Rank.FIVE, Card.Suit.HEARTS]
	]))

	result = BotHandEvaluator.evaluate(hand, last_play)
	assert_count(result, "singles", 1)  # Only 7♣


# ── Pairs Tests ──────────────────────────────────────────────

func test_pairs() -> void:
	print("\nTesting pairs enumeration...")

	# Hand with one pair and singles
	var hand := make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.THREE, Card.Suit.HEARTS],
		[Card.Rank.FIVE, Card.Suit.CLUBS]
	])

	var result := BotHandEvaluator.evaluate(hand, null)
	assert_count(result, "pairs", 1)

	# Hand with multiple cards of same rank
	hand = make_hand([
		[Card.Rank.FIVE, Card.Suit.SPADES],
		[Card.Rank.FIVE, Card.Suit.CLUBS],
		[Card.Rank.FIVE, Card.Suit.HEARTS]
	])

	result = BotHandEvaluator.evaluate(hand, null)
	assert_count(result, "pairs", 3)  # 3 choose 2 = 3 pairs


# ── Triples Tests ──────────────────────────────────────────────

func test_triples() -> void:
	print("\nTesting triples enumeration...")

	# Hand with exactly 3 of a kind
	var hand := make_hand([
		[Card.Rank.SEVEN, Card.Suit.SPADES],
		[Card.Rank.SEVEN, Card.Suit.CLUBS],
		[Card.Rank.SEVEN, Card.Suit.HEARTS]
	])

	var result := BotHandEvaluator.evaluate(hand, null)
	assert_count(result, "triples", 1)

	# Hand with 4 of a kind can make multiple triples
	hand = make_hand([
		[Card.Rank.JACK, Card.Suit.SPADES],
		[Card.Rank.JACK, Card.Suit.CLUBS],
		[Card.Rank.JACK, Card.Suit.DIAMONDS],
		[Card.Rank.JACK, Card.Suit.HEARTS]
	])

	result = BotHandEvaluator.evaluate(hand, null)
	assert_count(result, "triples", 4)  # 4 choose 3 = 4 triples


# ── Quads Tests ──────────────────────────────────────────────

func test_quads() -> void:
	print("\nTesting quads enumeration...")

	# Hand with exactly 4 of a kind
	var hand := make_hand([
		[Card.Rank.NINE, Card.Suit.SPADES],
		[Card.Rank.NINE, Card.Suit.CLUBS],
		[Card.Rank.NINE, Card.Suit.DIAMONDS],
		[Card.Rank.NINE, Card.Suit.HEARTS]
	])

	var result := BotHandEvaluator.evaluate(hand, null)
	assert_count(result, "quads", 1)


# ── Runs Tests ──────────────────────────────────────────────

func test_runs() -> void:
	print("\nTesting runs enumeration...")

	# Simple 3-card run
	var hand := make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.FOUR, Card.Suit.HEARTS],
		[Card.Rank.FIVE, Card.Suit.CLUBS]
	])

	var result := BotHandEvaluator.evaluate(hand, null)
	assert_count(result, "runs", 1)

	# Longer sequence should find multiple run lengths
	hand = make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.FOUR, Card.Suit.HEARTS],
		[Card.Rank.FIVE, Card.Suit.CLUBS],
		[Card.Rank.SIX, Card.Suit.DIAMONDS]
	])

	result = BotHandEvaluator.evaluate(hand, null)
	# Should find runs of length 3 and 4
	assert_count(result, "runs", 3)  # 3-4-5, 4-5-6, 3-4-5-6

	# 2s cannot be in runs
	hand = make_hand([
		[Card.Rank.ACE, Card.Suit.SPADES],
		[Card.Rank.TWO, Card.Suit.HEARTS],
		[Card.Rank.THREE, Card.Suit.CLUBS]
	])

	result = BotHandEvaluator.evaluate(hand, null)
	assert_count(result, "runs", 0)


# ── Bombs Tests ──────────────────────────────────────────────

func test_bombs() -> void:
	print("\nTesting bombs enumeration...")

	# Minimal bomb: 3 consecutive pairs (6 cards)
	var hand := make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.THREE, Card.Suit.HEARTS],
		[Card.Rank.FOUR, Card.Suit.CLUBS],
		[Card.Rank.FOUR, Card.Suit.DIAMONDS],
		[Card.Rank.FIVE, Card.Suit.SPADES],
		[Card.Rank.FIVE, Card.Suit.HEARTS]
	])

	# Can't open with bombs
	var result := BotHandEvaluator.evaluate(hand, null)
	assert_count(result, "bombs", 0)

	# But can play bomb to beat a run
	var last_play := Play.new(Play.Combo.RUN, make_hand([
		[Card.Rank.SIX, Card.Suit.SPADES],
		[Card.Rank.SEVEN, Card.Suit.HEARTS],
		[Card.Rank.EIGHT, Card.Suit.CLUBS]
	]))
	result = BotHandEvaluator.evaluate(hand, last_play)
	assert_count(result, "bombs", 0)  # Bomb doesn't beat a 3-card run


# ── Opening Move Tests ──────────────────────────────────────────────

func test_opening_move() -> void:
	print("\nTesting opening move (power state)...")

	var hand := make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.FOUR, Card.Suit.HEARTS],
		[Card.Rank.FIVE, Card.Suit.CLUBS],
		[Card.Rank.FIVE, Card.Suit.DIAMONDS]
	])

	# With power (last_play = null), can't open with bomb
	var result := BotHandEvaluator.evaluate(hand, null)

	# Should find singles, pairs, runs, but no bombs when opening
	print("  ✓ Opening move allows non-bomb combos")


# ── Beating Plays Tests ──────────────────────────────────────────────

func test_beating_plays() -> void:
	print("\nTesting beating existing plays...")

	var hand := make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.FIVE, Card.Suit.HEARTS],
		[Card.Rank.SEVEN, Card.Suit.CLUBS],
		[Card.Rank.NINE, Card.Suit.DIAMONDS]
	])

	# Must beat 5♥
	var last_play := Play.new(Play.Combo.SINGLE, make_hand([
		[Card.Rank.FIVE, Card.Suit.HEARTS]
	]))

	var result := BotHandEvaluator.evaluate(hand, last_play)
	assert_count(result, "singles", 2)  # 7♣ and 9♦

	# Must beat pair of 3s
	last_play = Play.new(Play.Combo.PAIR, make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.THREE, Card.Suit.HEARTS]
	]))

	hand = make_hand([
		[Card.Rank.FIVE, Card.Suit.SPADES],
		[Card.Rank.FIVE, Card.Suit.HEARTS],
		[Card.Rank.SEVEN, Card.Suit.CLUBS],
		[Card.Rank.SEVEN, Card.Suit.DIAMONDS]
	])

	result = BotHandEvaluator.evaluate(hand, last_play)
	assert_count(result, "pairs", 2)  # Both pairs beat 3s


# ── Chop Rules Tests ──────────────────────────────────────────────

func test_chop_rules() -> void:
	print("\nTesting chop rules (quads beat single 2, bombs beat 2s)...")

	# Quad can chop a single 2
	var hand := make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.THREE, Card.Suit.CLUBS],
		[Card.Rank.THREE, Card.Suit.DIAMONDS],
		[Card.Rank.THREE, Card.Suit.HEARTS]
	])

	var last_play := Play.new(Play.Combo.SINGLE, make_hand([
		[Card.Rank.TWO, Card.Suit.HEARTS]
	]))

	var result := BotHandEvaluator.evaluate(hand, last_play)
	assert_count(result, "quads", 1)

	# 3-pair bomb (6 cards) chops single 2
	hand = make_hand([
		[Card.Rank.THREE, Card.Suit.SPADES],
		[Card.Rank.THREE, Card.Suit.HEARTS],
		[Card.Rank.FOUR, Card.Suit.CLUBS],
		[Card.Rank.FOUR, Card.Suit.DIAMONDS],
		[Card.Rank.FIVE, Card.Suit.SPADES],
		[Card.Rank.FIVE, Card.Suit.HEARTS]
	])

	result = BotHandEvaluator.evaluate(hand, last_play)
	assert_count(result, "bombs", 1)

	print("  ✓ Chop rules validated")
