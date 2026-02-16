class_name CardSprite
extends Control

## Visual representation of a Card using sprite images

var card: Card
var is_selected: bool = false

@onready var texture_rect: TextureRect
@onready var selection_panel: Panel

## Card dimensions as percentage of viewport height (mobile-friendly)
## On a 844px tall phone (iPhone 14), 18% = ~152px height
const BASE_HEIGHT_PERCENT := 0.18  # 18% of viewport height
const ASPECT_RATIO := 0.667  # width/height ratio (2:3)

## Selection highlight colors
const SELECTED_BORDER_COLOR := Color(0.2, 0.5, 1.0)  # Bright glowing blue
const SELECTED_BORDER_WIDTH := 6  # Thicker border for visibility
const SELECTED_BG_TINT := Color(0.85, 0.9, 1.0, 0.3)  # Light blue tint

## Card sprite path
const CARDS_PATH := "res://assets/sprites/cards/"


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_setup_ui()


func _get_minimum_size() -> Vector2:
	# Use viewport size if available, otherwise use a sensible mobile default
	var viewport_size: Vector2
	if is_inside_tree():
		viewport_size = get_viewport_rect().size
	else:
		viewport_size = Vector2(390, 844)  # Default mobile portrait size

	var height := viewport_size.y * BASE_HEIGHT_PERCENT
	var width := height * ASPECT_RATIO
	return Vector2(width, height)


func _setup_ui() -> void:
	"""Create the card sprite UI"""
	# Create texture rect for card image
	texture_rect = TextureRect.new()
	texture_rect.anchor_right = 1.0
	texture_rect.anchor_bottom = 1.0
	texture_rect.stretch_mode = TextureRect.STRETCH_SCALE  # Scale to fill
	texture_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE  # Ignore texture size
	texture_rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST  # Crisp pixels
	texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(texture_rect)

	# Create selection panel (overlay for selection highlight)
	selection_panel = Panel.new()
	selection_panel.anchor_right = 1.0
	selection_panel.anchor_bottom = 1.0
	selection_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var style_box := StyleBoxFlat.new()
	style_box.bg_color = Color.TRANSPARENT
	style_box.border_color = Color.TRANSPARENT
	style_box.border_width_left = 0
	style_box.border_width_right = 0
	style_box.border_width_top = 0
	style_box.border_width_bottom = 0
	style_box.corner_radius_top_left = 8
	style_box.corner_radius_top_right = 8
	style_box.corner_radius_bottom_left = 8
	style_box.corner_radius_bottom_right = 8

	selection_panel.add_theme_stylebox_override("panel", style_box)
	add_child(selection_panel)


func setup(p_card: Card) -> void:
	"""Initialize the card sprite with card data"""
	card = p_card

	# Load the appropriate card texture
	var texture_path := _get_card_texture_path(card)
	var texture := load(texture_path) as Texture2D

	if texture:
		texture_rect.texture = texture
	else:
		push_error("Failed to load card texture: " + texture_path)


func _get_card_texture_path(p_card: Card) -> String:
	"""Map card data to sprite filename"""
	var suit_name := _get_suit_name(p_card.suit)
	var rank_name := _get_rank_name(p_card.rank)

	return CARDS_PATH + "card_%s_%s.png" % [suit_name, rank_name]


func _get_suit_name(suit: Card.Suit) -> String:
	"""Convert suit enum to sprite filename component"""
	match suit:
		Card.Suit.SPADES:
			return "spades"
		Card.Suit.CLUBS:
			return "clubs"
		Card.Suit.DIAMONDS:
			return "diamonds"
		Card.Suit.HEARTS:
			return "hearts"
		_:
			return "clubs"  # fallback


func _get_rank_name(rank: int) -> String:
	"""Convert rank to sprite filename component"""
	match rank:
		0:  # 3
			return "03"
		1:  # 4
			return "04"
		2:  # 5
			return "05"
		3:  # 6
			return "06"
		4:  # 7
			return "07"
		5:  # 8
			return "08"
		6:  # 9
			return "09"
		7:  # 10
			return "10"
		8:  # J
			return "J"
		9:  # Q
			return "Q"
		10: # K
			return "K"
		11: # A
			return "A"
		12: # 2
			return "02"
		_:
			return "A"  # fallback


func set_selected(selected: bool) -> void:
	"""Toggle selected state with visual feedback"""
	is_selected = selected

	var style_box: StyleBoxFlat = selection_panel.get_theme_stylebox("panel")

	if is_selected:
		# Add glowing blue border and tint
		style_box.border_color = SELECTED_BORDER_COLOR
		style_box.border_width_left = SELECTED_BORDER_WIDTH
		style_box.border_width_right = SELECTED_BORDER_WIDTH
		style_box.border_width_top = SELECTED_BORDER_WIDTH
		style_box.border_width_bottom = SELECTED_BORDER_WIDTH
		style_box.bg_color = SELECTED_BG_TINT
	else:
		# Reset to transparent
		style_box.border_color = Color.TRANSPARENT
		style_box.border_width_left = 0
		style_box.border_width_right = 0
		style_box.border_width_top = 0
		style_box.border_width_bottom = 0
		style_box.bg_color = Color.TRANSPARENT


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
