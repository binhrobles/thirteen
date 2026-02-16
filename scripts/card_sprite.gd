class_name CardSprite
extends Control

## Visual representation of a Card with touch/click interaction

@onready var rank_label: Label = $RankLabel
@onready var suit_label: Label = $SuitLabel
@onready var background: Panel = $Background

var card: Card
var is_selected: bool = false

## Card dimensions as percentage of viewport height (mobile-friendly)
## On a 844px tall phone (iPhone 14), 18% = ~152px height
const BASE_HEIGHT_PERCENT := 0.18  # 18% of viewport height
const ASPECT_RATIO := 0.667  # width/height ratio (2:3)

## Colors for suits
const RED_COLOR := Color(0.8, 0.1, 0.1)  # Hearts and Diamonds
const BLACK_COLOR := Color(0.1, 0.1, 0.1)  # Spades and Clubs
const SELECTED_BORDER_COLOR := Color(0.3, 0.6, 1.0)  # Glowing blue
const SELECTED_BORDER_WIDTH := 4


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP

	# Setup visual elements
	_setup_background()
	_setup_labels()


func _get_minimum_size() -> Vector2:
	# Use viewport size if available, otherwise use a sensible mobile default (844x390 like iPhone 14)
	var viewport_size: Vector2
	if is_inside_tree():
		viewport_size = get_viewport_rect().size
	else:
		viewport_size = Vector2(390, 844)  # Default mobile portrait size

	var height := viewport_size.y * BASE_HEIGHT_PERCENT
	var width := height * ASPECT_RATIO
	return Vector2(width, height)


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
	# Calculate font sizes based on card size (mobile-friendly)
	var card_height := _get_minimum_size().y
	var rank_font_size := int(card_height * 0.25)  # 25% of card height
	var suit_font_size := int(card_height * 0.32)  # 32% of card height

	# Position rank label at top
	rank_label.anchor_left = 0.1
	rank_label.anchor_top = 0.05
	rank_label.anchor_right = 0.9
	rank_label.anchor_bottom = 0.4
	rank_label.add_theme_font_size_override("font_size", rank_font_size)
	rank_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Position suit label at bottom
	suit_label.anchor_left = 0.1
	suit_label.anchor_top = 0.6
	suit_label.anchor_right = 0.9
	suit_label.anchor_bottom = 0.95
	suit_label.add_theme_font_size_override("font_size", suit_font_size)
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

	# Get the current StyleBoxFlat
	var style_box: StyleBoxFlat = background.get_theme_stylebox("panel")

	if is_selected:
		# Add glowing blue border
		style_box.border_color = SELECTED_BORDER_COLOR
		style_box.border_width_left = SELECTED_BORDER_WIDTH
		style_box.border_width_right = SELECTED_BORDER_WIDTH
		style_box.border_width_top = SELECTED_BORDER_WIDTH
		style_box.border_width_bottom = SELECTED_BORDER_WIDTH
	else:
		# Reset to default border
		style_box.border_color = Color(0.3, 0.3, 0.3)
		style_box.border_width_left = 2
		style_box.border_width_right = 2
		style_box.border_width_top = 2
		style_box.border_width_bottom = 2


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
