extends Node
## Cross-scene run state for the greybox demo.

signal battle_started(encounter_id: String)
signal battle_ended(won: bool)
signal run_reset()
signal deck_changed()

const PLAYER_MAX_HP := 30
const MAP_SCENE := "res://scenes/map/map_scene.tscn"
const BATTLE_SCENE := "res://scenes/battle/battle_scene.tscn"

## Permanent run deck: ordered multiset of card ids (map craft mutates this).
var run_deck_ids: Array[String] = []

var player_hp: int = PLAYER_MAX_HP
var player_max_hp: int = PLAYER_MAX_HP
var map_cell: Vector2i = Vector2i(1, 1)
var cleared_combat_cells: Array[Vector2i] = []
var pending_encounter_id: String = ""
var pending_combat_cell: Vector2i = Vector2i(-1, -1)
var last_battle_won: bool = false
var game_over: bool = false


func reset_run() -> void:
	player_hp = PLAYER_MAX_HP
	player_max_hp = PLAYER_MAX_HP
	map_cell = Vector2i(1, 1)
	cleared_combat_cells.clear()
	pending_encounter_id = ""
	pending_combat_cell = Vector2i(-1, -1)
	last_battle_won = false
	game_over = false
	_init_starter_deck()
	run_reset.emit()
	deck_changed.emit()


func _ready() -> void:
	# CardLibrary may load in parallel; defer deck init to next frame.
	call_deferred("_ensure_deck")


func _ensure_deck() -> void:
	if run_deck_ids.is_empty():
		_init_starter_deck()
		deck_changed.emit()


func _init_starter_deck() -> void:
	run_deck_ids.clear()
	var counts := {
		"elem_water": 2,
		"elem_fire": 2,
		"elem_air": 2,
		"elem_poison": 2,
		"elem_sand": 2,
		"proc_compress": 2,
		"proc_stack": 2,
	}
	for id in counts.keys():
		for _i in counts[id]:
			run_deck_ids.append(id)


func build_battle_deck() -> Array[CardData]:
	var deck: Array[CardData] = []
	for id in run_deck_ids:
		var c := CardLibrary.make_card(id)
		if c != null:
			deck.append(c)
	return deck


## Map permanent craft: remove two deck indices, insert result id. 2→1 forever.
func craft_permanent_at_indices(index_a: int, index_b: int) -> Dictionary:
	if index_a == index_b:
		return {"ok": false, "reason": "请选择两张不同的牌"}
	if index_a < 0 or index_b < 0 or index_a >= run_deck_ids.size() or index_b >= run_deck_ids.size():
		return {"ok": false, "reason": "牌库索引无效"}
	var hi := maxi(index_a, index_b)
	var lo := mini(index_a, index_b)
	var id_a := run_deck_ids[index_a]
	var id_b := run_deck_ids[index_b]
	var card_a := CardLibrary.make_card(id_a)
	var card_b := CardLibrary.make_card(id_b)
	var crafted := SynthesisService.craft_pair(SynthesisService.Mode.MAP_PERMANENT, card_a, card_b)
	if not crafted.get("ok", false):
		return crafted
	var result: CardData = crafted["result"]
	run_deck_ids.remove_at(hi)
	run_deck_ids.remove_at(lo)
	run_deck_ids.append(result.id)
	deck_changed.emit()
	return {
		"ok": true,
		"result": result,
		"message": "永久合成：%s + %s → %s（已写入全局牌库）" % [card_a.display, card_b.display, result.display],
	}


func start_battle(encounter_id: String, cell: Vector2i) -> void:
	pending_encounter_id = encounter_id
	pending_combat_cell = cell
	battle_started.emit(encounter_id)
	SceneRouter.goto_battle()


func finish_battle(won: bool) -> void:
	last_battle_won = won
	if won:
		if pending_combat_cell != Vector2i(-1, -1) and pending_combat_cell not in cleared_combat_cells:
			cleared_combat_cells.append(pending_combat_cell)
	else:
		game_over = true
		player_hp = 0
	pending_encounter_id = ""
	pending_combat_cell = Vector2i(-1, -1)
	# Battle-temp crafts never mutated run_deck_ids; ending combat drops them (1→2 conceptually).
	battle_ended.emit(won)
	SceneRouter.goto_map()


func apply_player_hp(hp: int) -> void:
	player_hp = clampi(hp, 0, player_max_hp)


func deck_summary() -> String:
	var counts: Dictionary = {}
	for id in run_deck_ids:
		counts[id] = int(counts.get(id, 0)) + 1
	var parts: PackedStringArray = []
	for id in counts.keys():
		var c := CardLibrary.make_card(id)
		var name := c.display if c else id
		parts.append("%s×%d" % [name, counts[id]])
	return ", ".join(parts)
