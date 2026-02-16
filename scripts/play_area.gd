class_name PlayArea
extends Control

## Displays the last played hand in the center of the screen

signal history_requested()  # Emitted when user taps to see play history

@onready var player_label: Label
@onready var status_label: Label
@onready var card_container: Control  # Changed from HBoxContainer for manual positioning

const CardSpriteScene := preload("res://scenes/card_sprite.tscn")

var current_cards: Array[Card] = []
var card_sprites: Array = []

const CARD_SPACING := 10  # Space between cards in played hand (when not overlapping)
const MIN_CARD_SPACING := -60  # Minimum spacing (overlap) when cards need to fit

## Boundaries to avoid (opponent hand areas)
const LEFT_OPPONENT_WIDTH := 0.23  # Left opponent occupies 0.0 to 0.23
const RIGHT_OPPONENT_START := 0.77  # Right opponent starts at 0.77


func _ready() -> void:
	_setup_ui()


func _setup_ui() -> void:
	"""Create the play area UI in center of screen"""
	# Center the play area - fixed proportion of screen, player name at top, status above buttons
	anchor_left = 0.5
	anchor_right = 0.5
	anchor_top = 0.25  # Start higher to show player name
	anchor_bottom = 0.66  # End just above buttons (which start at 0.68)
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	grow_vertical = Control.GROW_DIRECTION_BOTH
	offset_left = -180  # Half width (360px wide)
	offset_right = 180
	offset_top = 0
	offset_bottom = 0
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 10  # Render above background but below player hand
	z_as_relative = false  # Use absolute z-index

	# Player label (who played this hand) - responsive font size
	# Use viewport if available, otherwise default mobile size
	var viewport_height: float
	if is_inside_tree():
		viewport_height = get_viewport_rect().size.y
	else:
		viewport_height = 844.0  # Default mobile portrait height

	var player_font_size := int(viewport_height * 0.03)  # 3% of viewport height
	var status_font_size := int(viewport_height * 0.025)  # 2.5% of viewport height

	player_label = Label.new()
	player_label.anchor_left = 0.0
	player_label.anchor_right = 1.0
	player_label.anchor_top = 0.0
	player_label.offset_left = 0
	player_label.offset_right = 0
	player_label.offset_top = 10
	player_label.offset_bottom = 50
	player_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	player_label.add_theme_font_size_override("font_size", player_font_size)
	player_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	add_child(player_label)

	# Card container (centered) - use full width for cards, manual positioning
	card_container = Control.new()
	card_container.anchor_left = 0.0
	card_container.anchor_top = 0.15
	card_container.anchor_right = 1.0
	card_container.anchor_bottom = 0.75
	card_container.grow_horizontal = Control.GROW_DIRECTION_BOTH
	card_container.grow_vertical = Control.GROW_DIRECTION_BOTH
	card_container.offset_left = 10
	card_container.offset_right = -10
	card_container.offset_top = 0
	card_container.offset_bottom = 0
	card_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(card_container)

	# Status label (for "Your turn", "Waiting", etc.)
	status_label = Label.new()
	status_label.anchor_left = 0.0
	status_label.anchor_right = 1.0
	status_label.anchor_top = 1.0
	status_label.anchor_bottom = 1.0
	status_label.offset_left = 0
	status_label.offset_right = 0
	status_label.offset_top = -40
	status_label.offset_bottom = -10
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.add_theme_font_size_override("font_size", status_font_size)
	status_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	add_child(status_label)

	hide()  # Hidden by default until there's something to show


func show_played_hand(cards: Array[Card], player_name: String) -> void:
	"""Display a played hand in the center"""
	current_cards = cards
	_clear_cards()
	_create_card_sprites()
	player_label.text = player_name
	status_label.text = ""
	show()


func show_power_state(player_name: String, is_player: bool) -> void:
	"""Show that someone has power (can play anything)"""
	_clear_cards()
	player_label.text = ""
	if is_player:
		status_label.text = "Your turn to open!"
	else:
		status_label.text = "%s is opening..." % player_name
	show()


func show_waiting(player_name: String) -> void:
	"""Show waiting for another player"""
	_clear_cards()
	player_label.text = ""
	status_label.text = "It's on %s..." % player_name
	show()


func show_error(message: String) -> void:
	"""Show an error message briefly"""
	player_label.text = ""
	status_label.text = message
	status_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))  # Red
	show()

	# Reset color after a delay
	await get_tree().create_timer(2.0).timeout
	status_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))  # Original color


func show_game_message(message: String, duration: float = 1.5) -> void:
	"""Show a game status message (e.g., dealing, starting player)"""
	_clear_cards()
	player_label.text = ""
	status_label.text = message
	status_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.5))  # Yellow/gold
	show()

	# Wait for the specified duration
	await get_tree().create_timer(duration).timeout


func clear() -> void:
	"""Clear the play area"""
	_clear_cards()
	player_label.text = ""
	status_label.text = ""
	hide()


func _clear_cards() -> void:
	"""Remove all card sprites"""
	for sprite in card_sprites:
		sprite.queue_free()
	card_sprites.clear()


func _create_card_sprites() -> void:
	"""Create sprites for the current cards with dynamic overlap"""
	if current_cards.is_empty():
		return

	# Scale cards down slightly for the play area
	var scale_factor := 0.8

	# Get viewport size for calculations
	var viewport_size: Vector2
	if is_inside_tree():
		viewport_size = get_viewport_rect().size
	else:
		viewport_size = Vector2(390, 844)

	# Calculate available width (avoid opponent hand areas)
	var available_width := viewport_size.x * (RIGHT_OPPONENT_START - LEFT_OPPONENT_WIDTH)

	# Create card sprites first to get their sizes
	for card in current_cards:
		var card_sprite = CardSpriteScene.instantiate()
		card_container.add_child(card_sprite)
		card_sprite.setup(card)
		card_sprite.scale_for_hand_size(scale_factor)
		card_sprite.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card_sprites.append(card_sprite)

	# Calculate card width (get from first card's minimum size)
	var card_width: float = card_sprites[0].get_combined_minimum_size().x * scale_factor

	# Calculate total width needed with normal spacing
	var total_width_needed: float = card_width * current_cards.size() + CARD_SPACING * (current_cards.size() - 1)

	# Calculate spacing (overlap if needed)
	var card_spacing: float = CARD_SPACING
	if total_width_needed > available_width:
		# Need to overlap - calculate how much
		# total_width = card_width + (card_width + spacing) * (n - 1)
		# spacing = (total_width - card_width * n) / (n - 1)
		card_spacing = (available_width - card_width * current_cards.size()) / (current_cards.size() - 1)
		card_spacing = max(card_spacing, MIN_CARD_SPACING)

	# Calculate total actual width with calculated spacing
	var total_width: float = card_width + (card_width + card_spacing) * (current_cards.size() - 1)

	# Calculate starting x position (center the cards)
	var start_x: float = (card_container.size.x - total_width) / 2.0

	# Position cards
	for i in card_sprites.size():
		var card_sprite = card_sprites[i]
		var x_pos: float = start_x + i * (card_width + card_spacing)
		card_sprite.position = Vector2(x_pos, 0)
		# Set z_index so cards stack left-to-right
		card_sprite.z_index = i


func _gui_input(event: InputEvent) -> void:
	"""Handle tap to show play history"""
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		history_requested.emit()
		accept_event()
