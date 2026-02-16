class_name CardSprite
extends Control

## Visual representation of a Card using sprite images

var card: Card
var is_selected: bool = false

var texture_rect: TextureRect

# Track touch position for drag detection
var touch_start_position: Vector2
var is_dragging: bool = false
const DRAG_THRESHOLD := 10.0  # Pixels of movement before considering it a drag

## Card dimensions as percentage of viewport height (mobile-friendly)
## On a 844px tall phone (iPhone 14), 18% = ~152px height
const BASE_HEIGHT_PERCENT := 0.18  # 18% of viewport height
const ASPECT_RATIO := 0.667  # width/height ratio (2:3)

## Selection animation - lift card up (no scaling)


## Card sprite path
const CARDS_PATH := "res://assets/sprites/cards/"


func _ready() -> void:
	# Use PASS so ScrollContainer can receive events, but we'll handle taps via _input
	mouse_filter = Control.MOUSE_FILTER_PASS
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
		# Lift card up by 20% of card height
		var card_height := size.y
		var lift_amount := card_height * 0.20
		position.y = -lift_amount
		z_index = 10  # Render on top of other cards
	else:
		# Return to normal position
		position.y = 0
		z_index = 0


func _input(event: InputEvent) -> void:
	"""Handle touch and mouse interaction - distinguish taps from drags, only if over this card"""
	# Only handle if the event is over this card
	if not _is_event_over_card(event):
		return

	# Handle mouse button events
	var mouse_button := event as InputEventMouseButton
	if mouse_button and mouse_button.button_index == MOUSE_BUTTON_LEFT:
		if mouse_button.pressed:
			# Mouse down - record position and reset drag state
			touch_start_position = mouse_button.position
			is_dragging = false
		else:
			# Mouse up - check if it was a click (not a drag)
			if touch_start_position != Vector2.ZERO and not is_dragging:
				var drag_distance: float = mouse_button.position.distance_to(touch_start_position)
				if drag_distance <= DRAG_THRESHOLD:
					# It was a click - toggle selection
					toggle_selected()
					get_viewport().set_input_as_handled()
			# Reset tracking
			touch_start_position = Vector2.ZERO
			is_dragging = false
		return

	# Handle mouse drag events - mark as dragging
	var mouse_motion := event as InputEventMouseMotion
	if mouse_motion and mouse_motion.button_mask & MOUSE_BUTTON_MASK_LEFT:
		# Check if mouse has moved beyond threshold
		if touch_start_position != Vector2.ZERO:
			var drag_distance: float = mouse_motion.position.distance_to(touch_start_position)
			if drag_distance > DRAG_THRESHOLD:
				is_dragging = true
		# Don't handle drag events - let ScrollContainer handle scrolling
		return

	# Handle touch events
	var screen_touch := event as InputEventScreenTouch
	if screen_touch:
		if screen_touch.pressed:
			# Touch started - record position and reset drag state
			touch_start_position = screen_touch.position
			is_dragging = false
		else:
			# Touch ended - check if it was a tap (not a drag)
			if touch_start_position != Vector2.ZERO and not is_dragging:
				var drag_distance: float = screen_touch.position.distance_to(touch_start_position)
				if drag_distance <= DRAG_THRESHOLD:
					# It was a tap - toggle selection
					toggle_selected()
					get_viewport().set_input_as_handled()
			# Reset touch tracking
			touch_start_position = Vector2.ZERO
			is_dragging = false
		return

	# Handle touch drag events - mark as dragging
	var screen_drag := event as InputEventScreenDrag
	if screen_drag:
		# Check if touch has moved beyond threshold
		if touch_start_position != Vector2.ZERO:
			var drag_distance: float = screen_drag.position.distance_to(touch_start_position)
			if drag_distance > DRAG_THRESHOLD:
				is_dragging = true
		# Don't handle drag events - let ScrollContainer handle scrolling
		return


func _is_event_over_card(event: InputEvent) -> bool:
	"""Check if the event position is over this card"""
	var event_position: Vector2
	if event is InputEventMouse:
		event_position = (event as InputEventMouse).position
	elif event is InputEventScreenTouch:
		event_position = (event as InputEventScreenTouch).position
	elif event is InputEventScreenDrag:
		event_position = (event as InputEventScreenDrag).position
	else:
		return false

	# Check if screen position is within card's global rect
	var card_global_rect := Rect2(get_global_position(), size)
	return card_global_rect.has_point(event_position)


func toggle_selected() -> void:
	"""Toggle selection state"""
	set_selected(not is_selected)


func scale_for_hand_size(scale_factor: float) -> void:
	"""Scale down the card for large hands"""
	scale = Vector2.ONE * scale_factor


func set_greyed(greyed: bool) -> void:
	"""Apply greyscale effect when player has passed"""
	if greyed:
		modulate = Color(0.5, 0.5, 0.5, 1.0)  # Grey out
	else:
		modulate = Color(1.0, 1.0, 1.0, 1.0)  # Normal color
