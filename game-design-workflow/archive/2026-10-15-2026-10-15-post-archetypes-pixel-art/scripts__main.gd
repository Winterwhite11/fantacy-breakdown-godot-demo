extends Node
## Boot: reset run and enter map.


func _ready() -> void:
	GameState.reset_run()
	SceneRouter.goto_map()
