class_name PlayArea
extends Control

## Displays the last played hand in the center of the screen

signal history_requested()  # Emitted when user taps to see play history

@onready var player_label: Label
@onready var status_label: Label
@onready var card_container: HBoxContainer
@onready var background: Panel

const CardSpriteScene := preload("res://scenes/card_sprite.tscn")

var current_cards: Array[Card] = []
var card_sprites: Array = []

const CARD_SPACING := 10  # Space between cards in played hand


func _ready() -> void:
	_setup_ui()


func _setup_ui() -> void:
	"""Create the play area UI in center of screen"""
	# Center anchoring - use 80% width, 40% height for mobile
	anchor_left = 0.1
	anchor_right = 0.9
	anchor_top = 0.25
	anchor_bottom = 0.65
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	grow_vertical = Control.GROW_DIRECTION_BOTH
	offset_left = 0
	offset_right = 0
	offset_top = 0
	offset_bottom = 0
	mouse_filter = Control.MOUSE_FILTER_STOP

	# Background panel
	background = Panel.new()
	background.anchor_right = 1.0
	background.anchor_bottom = 1.0
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = Color(0.15, 0.15, 0.2, 0.85)
	style_box.corner_radius_top_left = 12
	style_box.corner_radius_top_right = 12
	style_box.corner_radius_bottom_left = 12
	style_box.corner_radius_bottom_right = 12
	style_box.border_width_left = 2
	style_box.border_width_right = 2
	style_box.border_width_top = 2
	style_box.border_width_bottom = 2
	style_box.border_color = Color(0.4, 0.4, 0.5)
	background.add_theme_stylebox_override("panel", style_box)
	add_child(background)

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

	# Card container (centered) - use full width for cards
	card_container = HBoxContainer.new()
	card_container.anchor_left = 0.0
	card_container.anchor_top = 0.2
	card_container.anchor_right = 1.0
	card_container.anchor_bottom = 0.8
	card_container.grow_horizontal = Control.GROW_DIRECTION_BOTH
	card_container.grow_vertical = Control.GROW_DIRECTION_BOTH
	card_container.offset_left = 10
	card_container.offset_right = -10
	card_container.offset_top = 0
	card_container.offset_bottom = 0
	card_container.alignment = BoxContainer.ALIGNMENT_CENTER
	card_container.add_theme_constant_override("separation", CARD_SPACING)
	add_child(card_container)

	# Status label (for "Your turn", "Waiting", etc.)
	status_label = Label.new()
	status_label.anchor_left = 0.0
	status_label.anchor_right = 1.0
	status_label.anchor_top = 1.0
	status_label.anchor_bottom = 1.0
	status_label.offset_left = 0
	status_label.offset_right = 0
	status_label.offset_top = -50
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
		status_label.text = "Your turn - play anything!"
	else:
		status_label.text = "Waiting for %s..." % player_name
	show()


func show_waiting(player_name: String) -> void:
	"""Show waiting for another player"""
	_clear_cards()
	player_label.text = ""
	status_label.text = "Waiting for %s..." % player_name
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
	"""Create sprites for the current cards"""
	# Scale cards down slightly for the play area
	var scale_factor := 0.8
	for card in current_cards:
		var card_sprite = CardSpriteScene.instantiate()
		card_container.add_child(card_sprite)
		card_sprite.setup(card)
		card_sprite.scale_for_hand_size(scale_factor)
		# Disable interaction on played cards
		card_sprite.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card_sprites.append(card_sprite)


func _gui_input(event: InputEvent) -> void:
	"""Handle tap to show play history"""
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		history_requested.emit()
		accept_event()
