extends Node
## Thin scene switcher used by GameState.


func goto_map() -> void:
	get_tree().change_scene_to_file(GameState.MAP_SCENE)


func goto_battle() -> void:
	get_tree().change_scene_to_file(GameState.BATTLE_SCENE)


func goto_main() -> void:
	get_tree().change_scene_to_file("res://scenes/main.tscn")
