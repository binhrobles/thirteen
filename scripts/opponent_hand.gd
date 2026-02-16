class_name OpponentHand
extends Control

## Displays opponent's card count as overlapped card backs

@onready var card_container: Control

const CARD_BACK_OVERLAP := 15  # Pixels of overlap between cards
const CARD_BACK_PATH := "res://assets/sprites/cards/card_back.png"

var card_count: int = 0
var card_backs: Array = []
var player_id: int = -1

## Card dimensions as percentage of viewport height (smaller than player cards)
const CARD_HEIGHT_PERCENT := 0.12  # 10% of viewport height
const ASPECT_RATIO := 0.667  # width/height ratio (2:3)

enum Position {
	TOP,    # Player 2
	RIGHT,  # Player 1
	LEFT    # Player 3
}

var position_mode: Position = Position.RIGHT


func _ready() -> void:
	_setup_container()


func _setup_container() -> void:
	"""Create container for card backs"""
	card_container = Control.new()
	add_child(card_container)

	# Container fills the entire control
	card_container.anchor_right = 1.0
	card_container.anchor_bottom = 1.0
	card_container.mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_position_mode(mode: Position) -> void:
	"""Configure positioning for this opponent hand"""
	position_mode = mode
	_apply_position()


func _apply_position() -> void:
	"""Apply anchoring based on position mode"""
	match position_mode:
		Position.TOP:
			# Centered horizontally at top, half off-screen for more play area
			anchor_left = 0.3
			anchor_right = 0.7
			anchor_top = -0.065
			anchor_bottom = 0.065

		Position.RIGHT:
			# Right edge, rotated, half off-screen for more play area
      # Card height is visual width
			anchor_left = 0.875
			anchor_right = 1.105
			anchor_top = 0.25
			anchor_bottom = 0.45

		Position.LEFT:
			# Left edge, rotated, half off-screen for more play area
      # Card height is visual width
			anchor_left = -0.125
			anchor_right = 0.105
			anchor_top = 0.25
			anchor_bottom = 0.45

	offset_left = 0
	offset_right = 0
	offset_top = 0
	offset_bottom = 0


func set_player(p_player_id: int) -> void:
	"""Set which player this display represents"""
	player_id = p_player_id


func update_card_count(count: int) -> void:
	"""Update the number of card backs displayed"""
	if count == card_count:
		return

	card_count = count
	_refresh_card_backs()


func _refresh_card_backs() -> void:
	"""Recreate all card back sprites"""
	# Clear existing
	for card_back in card_backs:
		card_back.queue_free()
	card_backs.clear()

	if card_count == 0:
		return

	# Calculate card dimensions
	var viewport_size: Vector2
	if is_inside_tree():
		viewport_size = get_viewport_rect().size
	else:
		viewport_size = Vector2(390, 844)

	var card_height := viewport_size.y * CARD_HEIGHT_PERCENT
	var card_width := card_height * ASPECT_RATIO

	# Determine layout direction based on position
	var is_horizontal := position_mode == Position.TOP
	var overlap := CARD_BACK_OVERLAP

	# Calculate total size needed
	var total_width: float
	var total_height: float

	if is_horizontal:
		# Cards laid out horizontally
		total_width = card_width + (card_count - 1) * overlap
		total_height = card_height
	else:
		# Cards laid out vertically
		total_width = card_width
		total_height = card_height + (card_count - 1) * overlap

	# Calculate starting position for centering
	var start_x: float = 0
	var start_y: float = 0

	if is_horizontal:
		# Center horizontally
		start_x = (size.x - total_width) / 2.0

	# Create card backs
	for i in card_count:
		var card_back := _create_card_back(card_width, card_height)
		card_container.add_child(card_back)

		# Position based on layout
		if is_horizontal:
			# Horizontal layout (top) - no rotation, centered
			card_back.position = Vector2(start_x + i * overlap, start_y)
		else:
			# Vertical layout (left/right) - rotate 90 degrees
			card_back.rotation_degrees = 90

			# When rotating 90° CW around top-left (0,0):
			# The card's BOTTOM edge becomes its LEFT edge (extends leftward from position)
			# Original: TL(0,0) -> TR(w,0) -> BR(w,h) -> BL(0,h)
			# After:    TL(0,0) -> TR(0,-w) -> BR(h,-w) -> BL(h,0)
			# Visual: extends from x=[pos.x-h] to x=[pos.x], y=[pos.y-w] to y=[pos.y]

			var y_pos: float = i * overlap

			if position_mode == Position.RIGHT:
				# Want: right edge at size.x, so: position.x = size.x
				var x_pos: float = size.x
				card_back.position = Vector2(x_pos, y_pos)
			else:  # Position.LEFT
				# Want: left edge at 0, so: position.x - card_height = 0, position.x = card_height
				var x_pos: float = card_height
				card_back.position = Vector2(x_pos, y_pos)

		card_backs.append(card_back)


func set_greyed(greyed: bool) -> void:
	"""Grey out all card backs when player has passed"""
	for card_back in card_backs:
		if greyed:
			card_back.modulate = Color(0.5, 0.5, 0.5, 1.0)  # Grey out
		else:
			card_back.modulate = Color(1.0, 1.0, 1.0, 1.0)  # Normal color


func _create_card_back(width: float, height: float) -> Control:
	"""Create a single card back visual"""
	var container := Control.new()
	container.custom_minimum_size = Vector2(width, height)
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Create texture rect for card back sprite
	var texture_rect := TextureRect.new()
	texture_rect.anchor_right = 1.0
	texture_rect.anchor_bottom = 1.0
	texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT
	texture_rect.expand_mode = TextureRect.EXPAND_FIT_HEIGHT
	texture_rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Load card back texture
	var texture := load(CARD_BACK_PATH) as Texture2D
	if texture:
		texture_rect.texture = texture
	else:
		push_error("Failed to load card back texture: " + CARD_BACK_PATH)

	container.add_child(texture_rect)
	return container
