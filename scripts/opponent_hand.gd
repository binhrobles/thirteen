class_name OpponentHand
extends Control

## Displays opponent's card count as overlapped card backs

@onready var card_container: Control

const CARD_BACK_OVERLAP := 15  # Pixels of overlap between cards
const CARD_BACK_COLOR := Color(0.2, 0.3, 0.5)  # Blue-ish card back
const CARD_BORDER_COLOR := Color(0.4, 0.5, 0.7)

var card_count: int = 0
var card_backs: Array = []
var player_id: int = -1

## Card dimensions as percentage of viewport height (smaller than player cards)
const CARD_HEIGHT_PERCENT := 0.10  # 10% of viewport height
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
			# Centered horizontally at top, flush with top edge
			anchor_left = 0.3
			anchor_right = 0.7
			anchor_top = 0.0
			anchor_bottom = 0.13

		Position.RIGHT:
			# Right edge, vertically centered
			# Need wider area to fit rotated cards (card height becomes visual width)
			anchor_left = 0.75
			anchor_right = 0.98
			anchor_top = 0.3
			anchor_bottom = 0.5

		Position.LEFT:
			# Left edge, vertically centered, flush with left edge
			# Need wider area to fit rotated cards (card height becomes visual width)
			anchor_left = 0.0
			anchor_right = 0.23
			anchor_top = 0.3
			anchor_bottom = 0.5

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

	# Create card backs
	for i in card_count:
		var card_back := _create_card_back(card_width, card_height)
		card_container.add_child(card_back)

		# Position based on layout
		if is_horizontal:
			# Horizontal layout (top) - no rotation
			card_back.position = Vector2(i * overlap, 0)
		else:
			# Vertical layout (left/right) - rotate 90 degrees
			card_back.rotation_degrees = 90

			# Control nodes rotate around top-left (0,0) by default
			# After 90° clockwise rotation: width becomes height visually
			var y_pos: float = i * overlap

			if position_mode == Position.RIGHT:
				# Align to right edge of container
				# After rotation, card extends card_height to the right from position
				var x_pos: float = size.x - card_height
				card_back.position = Vector2(x_pos, y_pos)
			else:  # Position.LEFT
				# Align to left edge of container (flush with left)
				# Position at (0, y) and card extends to the right
				card_back.position = Vector2(0, y_pos)

		card_backs.append(card_back)


func _create_card_back(width: float, height: float) -> Panel:
	"""Create a single card back visual"""
	var panel := Panel.new()
	panel.custom_minimum_size = Vector2(width, height)

	# Create card back style
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = CARD_BACK_COLOR
	style_box.corner_radius_top_left = 6
	style_box.corner_radius_top_right = 6
	style_box.corner_radius_bottom_left = 6
	style_box.corner_radius_bottom_right = 6
	style_box.border_width_left = 2
	style_box.border_width_right = 2
	style_box.border_width_top = 2
	style_box.border_width_bottom = 2
	style_box.border_color = CARD_BORDER_COLOR

	panel.add_theme_stylebox_override("panel", style_box)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE

	return panel
