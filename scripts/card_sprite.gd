class_name CardSprite
extends Control

## Visual representation of a Card with touch/click interaction

@onready var rank_label: Label = $RankLabel
@onready var suit_label: Label = $SuitLabel
@onready var background: Panel = $Background

var card: Card
var is_selected: bool = false

## Card dimensions (can be scaled down for large hands)
const BASE_WIDTH := 80.0
const BASE_HEIGHT := 120.0

## Colors for suits
const RED_COLOR := Color(0.8, 0.1, 0.1)  # Hearts and Diamonds
const BLACK_COLOR := Color(0.1, 0.1, 0.1)  # Spades and Clubs
const SELECTED_OFFSET := Vector2(0, -10)  # Raise when selected


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP

	# Setup visual elements
	_setup_background()
	_setup_labels()


func _get_minimum_size() -> Vector2:
	return Vector2(BASE_WIDTH, BASE_HEIGHT)


func _setup_background() -> void:
	"""Create rounded rectangle background for the card"""
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = Color.WHITE
	style_box.corner_radius_top_left = 8
	style_box.corner_radius_top_right = 8
	style_box.corner_radius_bottom_left = 8
	style_box.corner_radius_bottom_right = 8
	style_box.border_width_left = 2
	style_box.border_width_right = 2
	style_box.border_width_top = 2
	style_box.border_width_bottom = 2
	style_box.border_color = Color(0.3, 0.3, 0.3)

	background.add_theme_stylebox_override("panel", style_box)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE  # Let clicks through to parent


func _setup_labels() -> void:
	# Position rank label at top
	rank_label.anchor_left = 0.1
	rank_label.anchor_top = 0.05
	rank_label.anchor_right = 0.9
	rank_label.anchor_bottom = 0.4
	rank_label.add_theme_font_size_override("font_size", 36)
	rank_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Position suit label at bottom
	suit_label.anchor_left = 0.1
	suit_label.anchor_top = 0.6
	suit_label.anchor_right = 0.9
	suit_label.anchor_bottom = 0.95
	suit_label.add_theme_font_size_override("font_size", 48)
	suit_label.mouse_filter = Control.MOUSE_FILTER_IGNORE


func setup(p_card: Card) -> void:
	"""Initialize the card sprite with card data"""
	card = p_card

	# Set text
	rank_label.text = Card.RANK_LABELS[card.rank]
	suit_label.text = Card.SUIT_SYMBOLS[card.suit]

	# Set color based on suit
	var color := BLACK_COLOR
	if card.suit == Card.Suit.HEARTS or card.suit == Card.Suit.DIAMONDS:
		color = RED_COLOR

	rank_label.add_theme_color_override("font_color", color)
	suit_label.add_theme_color_override("font_color", color)


func set_selected(selected: bool) -> void:
	"""Toggle selected state with visual feedback"""
	is_selected = selected

	if is_selected:
		position += SELECTED_OFFSET
		# Add highlight to background
		background.modulate = Color(1.2, 1.2, 1.0)  # Slight yellow tint
	else:
		position -= SELECTED_OFFSET
		background.modulate = Color.WHITE


func _gui_input(event: InputEvent) -> void:
	"""Handle touch/click interaction"""
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		toggle_selected()
		accept_event()


func toggle_selected() -> void:
	"""Toggle selection state"""
	set_selected(not is_selected)


func scale_for_hand_size(scale_factor: float) -> void:
	"""Scale down the card for large hands"""
	scale = Vector2.ONE * scale_factor
