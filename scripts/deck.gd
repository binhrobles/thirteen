class_name Deck
extends RefCounted


static func generate() -> Array[Card]:
	var cards: Array[Card] = []
	for rank in Card.Rank.values():
		for suit in Card.Suit.values():
			cards.append(Card.new(rank, suit))
	return cards


static func shuffle(cards: Array[Card]) -> Array[Card]:
	var shuffled := cards.duplicate()
	shuffled.shuffle()
	return shuffled


static func deal(num_players: int = 4) -> Array:
	## Returns an array of hands (each hand is Array[Card], sorted ascending)
	var cards := shuffle(generate())
	var hands: Array = []
	var cards_per_player := cards.size() / num_players

	for i in num_players:
		var hand: Array[Card] = []
		for j in cards_per_player:
			hand.append(cards[i * cards_per_player + j])
		hand.sort_custom(Card.compare)
		hands.append(hand)

	return hands


static func find_starting_player(hands: Array) -> int:
	## The player with the 3 of spades starts
	for i in hands.size():
		for card: Card in hands[i]:
			if card.rank == Card.Rank.THREE and card.suit == Card.Suit.SPADES:
				return i
	# Fallback: lowest card
	var lowest_value := 999
	var lowest_player := 0
	for i in hands.size():
		if hands[i][0].value < lowest_value:
			lowest_value = hands[i][0].value
			lowest_player = i
	return lowest_player
