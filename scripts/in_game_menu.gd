class_name InGameMenu
extends Control

## In-game menu overlay with Exit button
## Uses mouse_filter = MOUSE_FILTER_STOP pattern (no _input() override)

signal exit_game_requested()

@onready var background: ColorRect
@onready var menu_panel: PanelContainer
@onready var exit_button: Button

const SoftRetroTheme := preload("res://assets/themes/soft_retro/soft_retro.tres")


func _ready() -> void:
	_setup_ui()
	hide()


func _setup_ui() -> void:
	"""Create the menu overlay UI"""
	theme = SoftRetroTheme

	# Full screen overlay
	anchor_right = 1.0
	anchor_bottom = 1.0
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 250
	z_as_relative = false

	var viewport_height: float = get_viewport_rect().size.y if is_inside_tree() else 844.0

	# Semi-transparent background (tap to dismiss)
	background = ColorRect.new()
	background.anchor_right = 1.0
	background.anchor_bottom = 1.0
	background.color = Color(0, 0, 0, 0.7)
	background.mouse_filter = Control.MOUSE_FILTER_STOP
	background.gui_input.connect(_on_background_input)
	add_child(background)

	# Centered menu panel
	menu_panel = PanelContainer.new()
	menu_panel.anchor_left = 0.15
	menu_panel.anchor_right = 0.85
	menu_panel.anchor_top = 0.35
	menu_panel.anchor_bottom = 0.55
	menu_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.12, 0.12, 0.15)
	var corner_radius := int(viewport_height * 0.015)
	panel_style.corner_radius_top_left = corner_radius
	panel_style.corner_radius_top_right = corner_radius
	panel_style.corner_radius_bottom_left = corner_radius
	panel_style.corner_radius_bottom_right = corner_radius
	var margin := int(viewport_height * 0.024)
	panel_style.content_margin_left = margin
	panel_style.content_margin_right = margin
	panel_style.content_margin_top = margin
	panel_style.content_margin_bottom = margin
	menu_panel.add_theme_stylebox_override("panel", panel_style)
	add_child(menu_panel)

	# VBox for menu items
	var vbox := VBoxContainer.new()
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_theme_constant_override("separation", int(viewport_height * 0.02))
	menu_panel.add_child(vbox)

	# Title
	var title := Label.new()
	title.text = "Menu"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", int(viewport_height * 0.04))
	title.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	vbox.add_child(title)

	# Exit button (red)
	exit_button = Button.new()
	exit_button.text = "Exit Game"
	exit_button.add_theme_font_size_override("font_size", int(viewport_height * 0.035))
	var exit_style := StyleBoxFlat.new()
	exit_style.bg_color = Color(0.8, 0.2, 0.2, 0.9)
	exit_style.corner_radius_top_left = 8
	exit_style.corner_radius_top_right = 8
	exit_style.corner_radius_bottom_left = 8
	exit_style.corner_radius_bottom_right = 8
	exit_style.content_margin_top = int(viewport_height * 0.012)
	exit_style.content_margin_bottom = int(viewport_height * 0.012)
	exit_button.add_theme_stylebox_override("normal", exit_style)
	exit_button.pressed.connect(_on_exit_pressed)
	vbox.add_child(exit_button)


func show_menu() -> void:
	"""Show the menu overlay"""
	# Must be last child to get input priority over game UI added later
	move_to_front()
	show()


func _on_background_input(event: InputEvent) -> void:
	"""Handle tap on background to dismiss"""
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		accept_event()
		hide()


func _on_exit_pressed() -> void:
	"""Handle exit button press"""
	exit_game_requested.emit()
	hide()
