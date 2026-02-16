extends Control

const PlayerHandScene := preload("res://scenes/player_hand.tscn")
const PlayAreaScene := preload("res://scenes/play_area.tscn")


func _ready() -> void:
	_test_ui()


func _test_ui() -> void:
	"""Test both player hand and play area"""
	var hands := Deck.deal(4)

	# Setup player hand
	var player_hand_node = PlayerHandScene.instantiate()
	add_child(player_hand_node)
	player_hand_node.set_cards(hands[0])

	# Setup play area with a sample played hand
	var play_area_node = PlayAreaScene.instantiate()
	add_child(play_area_node)

	# Show a sample played triple
	var sample_play: Array[Card] = [
		Card.new(Card.Rank.KING, Card.Suit.HEARTS),
		Card.new(Card.Rank.KING, Card.Suit.DIAMONDS),
		Card.new(Card.Rank.KING, Card.Suit.SPADES),
	]
	play_area_node.show_played_hand(sample_play, "Player 2")
