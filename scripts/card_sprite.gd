class_name CardSprite
extends Control

## Visual representation of a Card using sprite images

var card: Card
var is_selected: bool = false

var texture_rect: TextureRect

## Card dimensions as percentage of viewport height (mobile-friendly)
## On a 844px tall phone (iPhone 14), 18% = ~152px height
const BASE_HEIGHT_PERCENT := 0.18  # 18% of viewport height
const ASPECT_RATIO := 0.667  # width/height ratio (2:3)

## Selection animation - lift card up
const SELECTED_LIFT_AMOUNT := -40  # Pixels to lift up when selected
const SELECTED_SCALE := 1.1  # Scale multiplier when selected


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
	texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT  # Maintain aspect ratio
	texture_rect.expand_mode = TextureRect.EXPAND_FIT_HEIGHT  # Scale to fit height
	texture_rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST  # Crisp pixels
	texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(texture_rect)


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

	if selected:
		# Lift card up and scale slightly larger
		position.y = SELECTED_LIFT_AMOUNT
		scale = Vector2.ONE * SELECTED_SCALE
		z_index = 10  # Render on top of other cards
	else:
		# Return to normal position and scale
		position.y = 0
		scale = Vector2.ONE
		z_index = 0


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
