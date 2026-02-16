class_name GameOverScreen
extends Control

## Displays game over results and allows replay

signal new_game_requested()

@onready var background: Panel
@onready var title_label: Label
@onready var results_container: VBoxContainer
@onready var new_game_button: Button


func _ready() -> void:
	_setup_ui()
	hide()


func _setup_ui() -> void:
	"""Create the game over screen UI"""
	# Full screen overlay
	anchor_left = 0.0
	anchor_right = 1.0
	anchor_top = 0.0
	anchor_bottom = 1.0
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 200  # Render above everything else
	z_as_relative = false  # Use absolute z-index

	# Semi-transparent background
	background = Panel.new()
	background.anchor_right = 1.0
	background.anchor_bottom = 1.0
	var bg_style := StyleBoxFlat.new()
	bg_style.bg_color = Color(0.0, 0.0, 0.0, 0.85)  # Dark overlay
	background.add_theme_stylebox_override("panel", bg_style)
	add_child(background)

	# Get viewport for responsive sizing
	var viewport_height: float
	if is_inside_tree():
		viewport_height = get_viewport_rect().size.y
	else:
		viewport_height = 844.0  # Default mobile portrait

	# Title "Game Over!"
	title_label = Label.new()
	title_label.anchor_left = 0.0
	title_label.anchor_right = 1.0
	title_label.anchor_top = 0.15
	title_label.offset_top = 0
	title_label.offset_bottom = int(viewport_height * 0.08)
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.text = "Game Over!"
	title_label.add_theme_font_size_override("font_size", int(viewport_height * 0.06))
	title_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	add_child(title_label)

	# Results container (centered)
	results_container = VBoxContainer.new()
	results_container.anchor_left = 0.2
	results_container.anchor_right = 0.8
	results_container.anchor_top = 0.3
	results_container.anchor_bottom = 0.65
	results_container.add_theme_constant_override("separation", int(viewport_height * 0.025))
	add_child(results_container)

	# New Game button
	new_game_button = Button.new()
	new_game_button.anchor_left = 0.25
	new_game_button.anchor_right = 0.75
	new_game_button.anchor_top = 0.75
	new_game_button.anchor_bottom = 0.82
	new_game_button.text = "New Game"
	new_game_button.add_theme_font_size_override("font_size", int(viewport_height * 0.04))

	# Green button style
	var button_style := StyleBoxFlat.new()
	button_style.bg_color = Color(0.2, 0.7, 0.3, 0.9)
	button_style.corner_radius_top_left = 12
	button_style.corner_radius_top_right = 12
	button_style.corner_radius_bottom_left = 12
	button_style.corner_radius_bottom_right = 12
	new_game_button.add_theme_stylebox_override("normal", button_style)
	new_game_button.pressed.connect(_on_new_game_pressed)
	add_child(new_game_button)


func show_results(win_order: Array[int]) -> void:
	"""Display the game results with finish order"""
	# Clear previous results
	for child in results_container.get_children():
		child.queue_free()

	# Get viewport for responsive sizing
	var viewport_height: float = get_viewport_rect().size.y
	var result_font_size := int(viewport_height * 0.04)

	# Position labels (1st, 2nd, 3rd, 4th)
	var positions := ["1st", "2nd", "3rd", "4th"]
	var position_colors := [
		Color(1.0, 0.84, 0.0),   # Gold for 1st
		Color(0.75, 0.75, 0.75), # Silver for 2nd
		Color(0.8, 0.5, 0.2),    # Bronze for 3rd
		Color(0.6, 0.6, 0.6)     # Gray for 4th
	]

	for i in range(win_order.size()):
		var player_id: int = win_order[i]
		var player_name := "You" if player_id == 0 else "Player %d" % (player_id + 1)

		var result_label := Label.new()
		result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		result_label.text = "%s:  %s" % [positions[i], player_name]
		result_label.add_theme_font_size_override("font_size", result_font_size)
		result_label.add_theme_color_override("font_color", position_colors[i])

		# Make 1st place larger
		if i == 0:
			result_label.add_theme_font_size_override("font_size", int(result_font_size * 1.3))

		results_container.add_child(result_label)

	show()


func _on_new_game_pressed() -> void:
	"""Handle new game button press"""
	new_game_requested.emit()
	hide()
