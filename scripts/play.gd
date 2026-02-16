class_name Play
extends RefCounted

enum Combo {
	SINGLE, PAIR, TRIPLE, QUAD, RUN, BOMB, INVALID
}

var cards: Array[Card]
var combo: Combo
var suited: bool
var value: int  ## value of highest card — used for comparison


func _init(p_combo: Combo, p_cards: Array[Card], p_suited: bool = false) -> void:
	combo = p_combo
	# Sort descending so cards[0] is highest
	cards = p_cards.duplicate()
	cards.sort_custom(Card.compare_desc)
	suited = p_suited
	value = cards[0].value


func _to_string() -> String:
	var parts: Array[String] = []
	for card in cards:
		parts.append(str(card))
	return Combo.keys()[combo] + ": " + " ".join(parts)


# ── Combo detection ──────────────────────────────────────────────

static func is_single(cards: Array[Card]) -> bool:
	return cards.size() == 1


static func is_pair(cards: Array[Card]) -> bool:
	return cards.size() == 2 and cards[0].rank == cards[1].rank


static func is_triple(cards: Array[Card]) -> bool:
	return cards.size() == 3 \
		and cards[0].rank == cards[1].rank \
		and cards[0].rank == cards[2].rank


static func is_quad(cards: Array[Card]) -> bool:
	return cards.size() == 4 \
		and cards[0].rank == cards[1].rank \
		and cards[0].rank == cards[2].rank \
		and cards[0].rank == cards[3].rank


static func is_run(cards: Array[Card]) -> bool:
	if cards.size() < 3:
		return false
	# 2s cannot appear in runs
	for card in cards:
		if card.rank == Card.Rank.TWO:
			return false
	var sorted := cards.duplicate()
	sorted.sort_custom(Card.compare)
	for i in sorted.size() - 1:
		if sorted[i].rank + 1 != sorted[i + 1].rank:
			return false
	return true


static func is_bomb(cards: Array[Card]) -> bool:
	## A bomb is 3+ consecutive pairs (6+ cards)
	if cards.size() < 6 or cards.size() % 2 != 0:
		return false
	var sorted := cards.duplicate()
	sorted.sort_custom(Card.compare)
	# Check pairs
	for i in range(0, sorted.size(), 2):
		if not is_pair([sorted[i], sorted[i + 1]]):
			return false
	# Check consecutive ranks (use every other card)
	var rank_cards: Array[Card] = []
	for i in range(1, sorted.size(), 2):
		rank_cards.append(sorted[i])
	return is_run(rank_cards)


static func is_suited(cards: Array[Card]) -> bool:
	if cards.is_empty():
		return false
	var first_suit := cards[0].suit
	for card in cards:
		if card.suit != first_suit:
			return false
	return true


# ── Combo determination ──────────────────────────────────────────

static func determine_combo(cards: Array[Card]) -> Combo:
	if is_single(cards):
		return Combo.SINGLE
	if is_pair(cards):
		return Combo.PAIR
	if is_triple(cards):
		return Combo.TRIPLE
	if is_quad(cards):
		return Combo.QUAD
	if is_run(cards):
		return Combo.RUN
	if is_bomb(cards):
		return Combo.BOMB
	return Combo.INVALID


static func matches_combo(play: Play, attempt_cards: Array[Card]) -> bool:
	match play.combo:
		Combo.SINGLE:
			return is_single(attempt_cards)
		Combo.PAIR:
			return is_pair(attempt_cards)
		Combo.TRIPLE:
			return is_triple(attempt_cards)
		Combo.QUAD:
			return is_quad(attempt_cards)
		Combo.RUN:
			return attempt_cards.size() == play.cards.size() and is_run(attempt_cards)
		Combo.BOMB:
			return attempt_cards.size() == play.cards.size() and is_bomb(attempt_cards)
	return false
