class_name Card
extends RefCounted

## Card ranking: THREE=0 (lowest) through TWO=12 (highest)
enum Rank {
	THREE, FOUR, FIVE, SIX, SEVEN, EIGHT, NINE, TEN,
	JACK, QUEEN, KING, ACE, TWO
}

## Suit ranking: SPADES=0 (lowest) through HEARTS=3 (highest)
enum Suit {
	SPADES, CLUBS, DIAMONDS, HEARTS
}

const RANK_LABELS := ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]
const SUIT_SYMBOLS := ["♠", "♣", "♦", "♥"]

var rank: Rank
var suit: Suit
var value: int  ## rank * 4 + suit — unique per card, natural sort order


func _init(p_rank: Rank, p_suit: Suit) -> void:
	rank = p_rank
	suit = p_suit
	value = p_rank * 4 + p_suit


func _to_string() -> String:
	return RANK_LABELS[rank] + SUIT_SYMBOLS[suit]


static func compare(a: Card, b: Card) -> bool:
	## For use with Array.sort_custom — returns true if a < b
	return a.value < b.value


static func compare_desc(a: Card, b: Card) -> bool:
	return a.value > b.value
