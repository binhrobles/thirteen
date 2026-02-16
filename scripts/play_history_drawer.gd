class_name PlayHistoryDrawer
extends Control

## Displays the play history for the current round in a scrollable overlay

signal dismissed()  # Emitted when drawer is closed

@onready var background: ColorRect
@onready var drawer_panel: Panel
@onready var scroll_container: ScrollContainer
@onready var history_list: VBoxContainer
@onready var title_label: Label
@onready var close_button: Button

const CardSpriteScene := preload("res://scenes/card_sprite.tscn")
const PLAYER_NAMES := ["You", "Player 2", "Player 3", "Player 4"]

var current_round_plays: Array = []  # Array of {player: int, play: Play or "pass"}


func _ready() -> void:
	_setup_ui()
	hide()  # Hidden by default


func _setup_ui() -> void:
	"""Create the overlay UI"""
	# Full screen overlay
	anchor_right = 1.0
	anchor_bottom = 1.0
	mouse_filter = Control.MOUSE_FILTER_STOP

	# Semi-transparent background (tap to dismiss)
	background = ColorRect.new()
	background.anchor_right = 1.0
	background.anchor_bottom = 1.0
	background.color = Color(0, 0, 0, 0.7)
	background.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(background)

	# Drawer panel (bottom 60% of screen)
	drawer_panel = Panel.new()
	drawer_panel.anchor_left = 0.0
	drawer_panel.anchor_right = 1.0
	drawer_panel.anchor_top = 0.4
	drawer_panel.anchor_bottom = 1.0
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = Color(0.12, 0.12, 0.15)
	style_box.corner_radius_top_left = 20
	style_box.corner_radius_top_right = 20
	drawer_panel.add_theme_stylebox_override("panel", style_box)
	add_child(drawer_panel)

	# Title
	title_label = Label.new()
	title_label.text = "Round History"
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 28)
	title_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	title_label.anchor_left = 0.0
	title_label.anchor_right = 1.0
	title_label.offset_top = 20
	title_label.offset_bottom = 60
	drawer_panel.add_child(title_label)

	# Close button (X in top right)
	close_button = Button.new()
	close_button.text = "×"
	close_button.add_theme_font_size_override("font_size", 36)
	close_button.anchor_left = 1.0
	close_button.anchor_right = 1.0
	close_button.offset_left = -60
	close_button.offset_right = -10
	close_button.offset_top = 10
	close_button.offset_bottom = 60
	var close_style := StyleBoxFlat.new()
	close_style.bg_color = Color(0.3, 0.3, 0.35)
	close_style.corner_radius_top_left = 8
	close_style.corner_radius_top_right = 8
	close_style.corner_radius_bottom_left = 8
	close_style.corner_radius_bottom_right = 8
	close_button.add_theme_stylebox_override("normal", close_style)
	close_button.pressed.connect(_on_close_pressed)
	drawer_panel.add_child(close_button)

	# Scroll container for history
	scroll_container = ScrollContainer.new()
	scroll_container.anchor_left = 0.0
	scroll_container.anchor_right = 1.0
	scroll_container.anchor_top = 0.0
	scroll_container.anchor_bottom = 1.0
	scroll_container.offset_left = 10
	scroll_container.offset_right = -10
	scroll_container.offset_top = 70
	scroll_container.offset_bottom = -10
	scroll_container.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	drawer_panel.add_child(scroll_container)

	# VBox for history entries
	history_list = VBoxContainer.new()
	history_list.size_flags_horizontal = Control.SIZE_FILL
	history_list.add_theme_constant_override("separation", 8)
	scroll_container.add_child(history_list)


func show_history(play_log: Array) -> void:
	"""Display the play history from current round"""
	# Extract current round plays (from last round_reset marker to end)
	current_round_plays = _extract_current_round(play_log)
	_populate_history()
	show()


func _extract_current_round(play_log: Array) -> Array:
	"""Get plays from the current round only"""
	var round_plays: Array = []

	# Find the last round_reset marker
	var last_reset_idx := -1
	for i in range(play_log.size() - 1, -1, -1):
		if typeof(play_log[i]) == TYPE_STRING and play_log[i] == "round_reset":
			last_reset_idx = i
			break

	# Get all plays after the last reset (or all plays if no reset found)
	var start_idx := last_reset_idx + 1 if last_reset_idx >= 0 else 0
	for i in range(start_idx, play_log.size()):
		var entry = play_log[i]
		if typeof(entry) != TYPE_STRING:  # Skip round_reset markers
			round_plays.append(entry)

	return round_plays


func _populate_history() -> void:
	"""Populate the history list with entries"""
	# Clear existing entries
	for child in history_list.get_children():
		child.queue_free()

	if current_round_plays.is_empty():
		var empty_label := Label.new()
		empty_label.text = "No plays yet this round"
		empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_label.add_theme_font_size_override("font_size", 18)
		empty_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
		history_list.add_child(empty_label)
		return

	# Add each play as an entry
	for entry in current_round_plays:
		var play_entry := _create_play_entry(entry)
		history_list.add_child(play_entry)


func _create_play_entry(entry: Dictionary) -> Control:
	"""Create a single play entry display"""
	var container := PanelContainer.new()
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = Color(0.18, 0.18, 0.22)
	style_box.corner_radius_top_left = 8
	style_box.corner_radius_top_right = 8
	style_box.corner_radius_bottom_left = 8
	style_box.corner_radius_bottom_right = 8
	style_box.content_margin_left = 10
	style_box.content_margin_right = 10
	style_box.content_margin_top = 8
	style_box.content_margin_bottom = 8
	container.add_theme_stylebox_override("panel", style_box)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 4)
	container.add_child(vbox)

	# Player name and combo type
	var header := HBoxContainer.new()
	vbox.add_child(header)

	var player_label := Label.new()
	var player_id: int = entry["player"]
	player_label.text = PLAYER_NAMES[player_id]
	player_label.add_theme_font_size_override("font_size", 20)
	player_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	header.add_child(player_label)

	# Spacer
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)

	# Handle pass vs play
	var play = entry["play"]
	if typeof(play) == TYPE_STRING and play == "pass":
		var pass_label := Label.new()
		pass_label.text = "PASS"
		pass_label.add_theme_font_size_override("font_size", 18)
		pass_label.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4))
		header.add_child(pass_label)
	else:
		# Show combo type
		var combo_label := Label.new()
		combo_label.text = Play.Combo.keys()[play.combo]
		combo_label.add_theme_font_size_override("font_size", 16)
		combo_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
		header.add_child(combo_label)

		# Show cards
		var cards_container := HBoxContainer.new()
		cards_container.add_theme_constant_override("separation", 4)
		vbox.add_child(cards_container)

		for card in play.cards:
			var card_sprite = CardSpriteScene.instantiate()
			cards_container.add_child(card_sprite)
			# Defer setup and scaling until card is ready
			card_sprite.call_deferred("setup", card)
			card_sprite.call_deferred("scale_for_hand_size", 0.5)
			card_sprite.mouse_filter = Control.MOUSE_FILTER_IGNORE

	return container


func _on_close_pressed() -> void:
	"""Close button pressed"""
	_dismiss()


func _gui_input(event: InputEvent) -> void:
	"""Handle tap outside to dismiss"""
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# Check if tap was on background (not on drawer)
		var local_pos: Vector2 = event.position
		if not drawer_panel.get_rect().has_point(local_pos):
			_dismiss()
			accept_event()


func _dismiss() -> void:
	"""Close the drawer"""
	hide()
	dismissed.emit()
