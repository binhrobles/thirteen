class_name PlayerHand
extends Control

## Displays player's hand of cards at bottom of screen with horizontal scrolling

@onready var scroll_container: ScrollContainer
@onready var card_container: HBoxContainer

const CardSpriteScene := preload("res://scenes/card_sprite.tscn")

var cards: Array[Card] = []
var card_sprites: Array = []

## Card overlap amount (cards will overlap by this many pixels)
const CARD_SPACING := 20


func _ready() -> void:
	_setup_ui()


func _setup_ui() -> void:
	"""Create the scroll container and card container"""
	# Position at bottom of screen - moved down to give space for lifted cards (18% of screen)
	anchor_top = 0.82
	anchor_bottom = 1.0
	anchor_left = 0.0
	anchor_right = 1.0
	offset_top = 0
	offset_bottom = 0
	grow_vertical = Control.GROW_DIRECTION_BEGIN
	z_index = 100  # Render above everything
	z_as_relative = false  # Use absolute z-index

	# Add semi-transparent background
	var background := ColorRect.new()
	background.color = Color(0.1, 0.1, 0.1, 0.7)  # Dark semi-transparent
	background.anchor_right = 1.0
	background.anchor_bottom = 1.0
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE  # Don't block clicks
	add_child(background)

	# Create scroll container with padding
	scroll_container = ScrollContainer.new()
	scroll_container.anchor_right = 1.0
	scroll_container.anchor_bottom = 1.0
	scroll_container.offset_left = 10
	scroll_container.offset_right = -10
	scroll_container.offset_top = 10
	scroll_container.offset_bottom = -10
	scroll_container.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll_container.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll_container)

	# Create card container with overlap
	card_container = HBoxContainer.new()
	card_container.add_theme_constant_override("separation", CARD_SPACING)
	scroll_container.add_child(card_container)


func set_cards(p_cards: Array[Card]) -> void:
	"""Set the cards to display in the hand"""
	cards = p_cards
	_clear_cards()
	_create_card_sprites()


func _clear_cards() -> void:
	"""Remove all card sprites"""
	for sprite in card_sprites:
		sprite.queue_free()
	card_sprites.clear()


func _create_card_sprites() -> void:
	"""Create sprite for each card"""
	for card in cards:
		var card_sprite = CardSpriteScene.instantiate()
		card_container.add_child(card_sprite)
		card_sprite.setup(card)
		card_sprites.append(card_sprite)


func get_selected_cards() -> Array[Card]:
	"""Return array of currently selected cards"""
	var selected: Array[Card] = []
	for sprite in card_sprites:
		if sprite.is_selected:
			selected.append(sprite.card)
	return selected


func clear_selection() -> void:
	"""Deselect all cards"""
	for sprite in card_sprites:
		if sprite.is_selected:
			sprite.set_selected(false)
