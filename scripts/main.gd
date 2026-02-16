extends Control

const CardSpriteScene := preload("res://scenes/card_sprite.tscn")


func _ready() -> void:
	_test_card_sprites()


func _test_card_sprites() -> void:
	"""Create a few test cards to verify the card sprite works"""
	var test_cards := [
		Card.new(Card.Rank.ACE, Card.Suit.HEARTS),
		Card.new(Card.Rank.KING, Card.Suit.SPADES),
		Card.new(Card.Rank.TWO, Card.Suit.DIAMONDS),
		Card.new(Card.Rank.THREE, Card.Suit.CLUBS),
	]

	var x_offset := 100.0
	for i in test_cards.size():
		var card_sprite = CardSpriteScene.instantiate()
		add_child(card_sprite)
		card_sprite.setup(test_cards[i])
		card_sprite.position = Vector2(x_offset + i * 100, 500)
