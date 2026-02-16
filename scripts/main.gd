extends Control

const PlayerHandScene := preload("res://scenes/player_hand.tscn")


func _ready() -> void:
	_test_player_hand()


func _test_player_hand() -> void:
	"""Create a player hand with dealt cards"""
	var hands := Deck.deal(4)
	var player_hand_node = PlayerHandScene.instantiate()
	add_child(player_hand_node)
	player_hand_node.set_cards(hands[0])  # Player 0's hand
