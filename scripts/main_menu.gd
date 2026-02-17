extends Control
## Main menu landing page
##
## Entry point for the game with options for local/online play

@onready var local_game_button: Button = $CenterContainer/VBoxContainer/MenuButtons/LocalGameButton
@onready var online_game_button: Button = $CenterContainer/VBoxContainer/MenuButtons/OnlineGameButton
@onready var network_test_button: Button = $CenterContainer/VBoxContainer/MenuButtons/NetworkTestButton
@onready var about_button: Button = $CenterContainer/VBoxContainer/MenuButtons/AboutButton
@onready var about_panel: Panel = $AboutPanel
@onready var about_close_button: Button = $AboutPanel/MarginContainer/VBoxContainer/CloseButton
@onready var github_button: Button = $AboutPanel/MarginContainer/VBoxContainer/GitHubButton

const GITHUB_URL = "https://github.com/binhrobles/thirteen-vibes"


func _ready() -> void:
	# Connect button signals
	local_game_button.pressed.connect(_on_local_game_pressed)
	online_game_button.pressed.connect(_on_online_game_pressed)
	network_test_button.pressed.connect(_on_network_test_pressed)
	about_button.pressed.connect(_on_about_pressed)
	about_close_button.pressed.connect(_on_about_close_pressed)
	github_button.pressed.connect(_on_github_pressed)

	# Override panel style to use teal instead of theme purple
	var teal_style := StyleBoxFlat.new()
	teal_style.bg_color = Color(0.08, 0.15, 0.18, 1)  # Dark teal
	teal_style.border_width_left = 2
	teal_style.border_width_top = 2
	teal_style.border_width_right = 2
	teal_style.border_width_bottom = 2
	teal_style.border_color = Color(1, 0.933333, 0.8, 1)  # Keep theme border color
	teal_style.corner_radius_top_left = 10
	teal_style.corner_radius_top_right = 10
	about_panel.add_theme_stylebox_override("panel", teal_style)

	# Hide about panel initially
	about_panel.hide()


func _on_local_game_pressed() -> void:
	# Load the main game scene
	get_tree().change_scene_to_file("res://scenes/main.tscn")


func _on_online_game_pressed() -> void:
	# Load online multiplayer lobby
	get_tree().change_scene_to_file("res://scenes/online_lobby.tscn")


func _on_network_test_pressed() -> void:
	# Load the network test scene
	get_tree().change_scene_to_file("res://scenes/network_test.tscn")


func _on_about_pressed() -> void:
	about_panel.show()


func _on_about_close_pressed() -> void:
	about_panel.hide()


func _on_github_pressed() -> void:
	OS.shell_open(GITHUB_URL)
