class_name InGameMenu
extends Control

## In-game pause/settings menu overlay

signal exit_game_requested()  # Emitted when player wants to exit to main menu

@onready var background: ColorRect
@onready var menu_panel: Panel
@onready var exit_button: Button

const SoftRetroTheme := preload("res://assets/themes/soft_retro/soft_retro.tres")


func _ready() -> void:
	_setup_ui()
	hide()  # Hidden by default


func _setup_ui() -> void:
	"""Create the in-game menu UI"""
	# Apply retro theme for consistent font
	theme = SoftRetroTheme

	# Get viewport for responsive sizing
	var viewport_size := get_viewport_rect().size
	var viewport_height := viewport_size.y

	# Full screen overlay
	anchor_right = 1.0
	anchor_bottom = 1.0
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 200  # Render above everything else
	z_as_relative = false  # Use absolute z-index

	# Semi-transparent background (tap to dismiss)
	background = ColorRect.new()
	background.anchor_right = 1.0
	background.anchor_bottom = 1.0
	background.color = Color(0, 0, 0, 0.7)
	background.mouse_filter = Control.MOUSE_FILTER_STOP
	background.gui_input.connect(_on_background_input)
	add_child(background)

	# Menu panel (centered)
	menu_panel = Panel.new()
	menu_panel.anchor_left = 0.15
	menu_panel.anchor_right = 0.85
	menu_panel.anchor_top = 0.35
	menu_panel.anchor_bottom = 0.65
	var style_box := StyleBoxFlat.new()
	style_box.bg_color = Color(0.08, 0.15, 0.18)  # Dark teal to complement green poker table
	var corner_radius := int(viewport_height * 0.024)  # ~20px on 844px screen
	style_box.corner_radius_top_left = corner_radius
	style_box.corner_radius_top_right = corner_radius
	style_box.corner_radius_bottom_left = corner_radius
	style_box.corner_radius_bottom_right = corner_radius
	menu_panel.add_theme_stylebox_override("panel", style_box)
	add_child(menu_panel)

	# Container for menu items
	var vbox := VBoxContainer.new()
	vbox.anchor_left = 0.1
	vbox.anchor_right = 0.9
	vbox.anchor_top = 0.2
	vbox.anchor_bottom = 0.8
	vbox.add_theme_constant_override("separation", int(viewport_height * 0.03))  # ~25px spacing
	menu_panel.add_child(vbox)

	# Title
	var title_label := Label.new()
	title_label.text = "Menu"
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", int(viewport_height * 0.05))  # ~42px on 844px screen
	title_label.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	vbox.add_child(title_label)

	# Spacer
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, int(viewport_height * 0.024))
	vbox.add_child(spacer)

	# Exit Game button (red)
	exit_button = Button.new()
	exit_button.text = "Exit Game"
	exit_button.custom_minimum_size = Vector2(0, int(viewport_height * 0.08))  # ~70px on 844px screen
	exit_button.add_theme_font_size_override("font_size", int(viewport_height * 0.035))  # ~30px on 844px screen

	# Red button style
	var exit_style := StyleBoxFlat.new()
	exit_style.bg_color = Color(0.8, 0.2, 0.2, 0.9)  # Red
	var button_radius := int(viewport_height * 0.012)  # ~10px on 844px screen
	exit_style.corner_radius_top_left = button_radius
	exit_style.corner_radius_top_right = button_radius
	exit_style.corner_radius_bottom_left = button_radius
	exit_style.corner_radius_bottom_right = button_radius
	exit_button.add_theme_stylebox_override("normal", exit_style)

	# Darker red hover style
	var exit_hover_style := StyleBoxFlat.new()
	exit_hover_style.bg_color = Color(0.9, 0.3, 0.3, 0.9)
	exit_hover_style.corner_radius_top_left = button_radius
	exit_hover_style.corner_radius_top_right = button_radius
	exit_hover_style.corner_radius_bottom_left = button_radius
	exit_hover_style.corner_radius_bottom_right = button_radius
	exit_button.add_theme_stylebox_override("hover", exit_hover_style)

	exit_button.pressed.connect(_on_exit_button_pressed)
	vbox.add_child(exit_button)


func show_menu() -> void:
	"""Display the in-game menu"""
	show()


func _on_background_input(event: InputEvent) -> void:
	"""Handle tap on background to dismiss"""
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_dismiss()


func _dismiss() -> void:
	"""Close the menu"""
	hide()


func _on_exit_button_pressed() -> void:
	"""Handle exit button press"""
	exit_game_requested.emit()
	hide()
