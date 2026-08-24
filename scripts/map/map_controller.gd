extends Node2D
## Grid map: single-tile WASD/arrow moves; combat tiles start battles.
## Map craft bench: permanent 2→1 into GameState.run_deck_ids.

const TILE := 64
const COLS := 7
const ROWS := 5

const LAYOUT := [
	[1, 1, 1, 1, 1, 1, 1],
	[1, 3, 0, 0, 2, 0, 1],
	[1, 0, 1, 0, 0, 2, 1],
	[1, 0, 0, 2, 1, 0, 1],
	[1, 1, 1, 1, 1, 1, 1],
]

var _player: Node2D
var _hint: Label
var _deck_label: Label
var _moving: bool = false
var _overlay: CanvasLayer
var _craft_panel: PanelContainer
var _craft_list: VBoxContainer
var _craft_status: Label
var _selected: Array[int] = []
var _card_buttons: Array[Button] = []


func _ready() -> void:
	_draw_tiles()
	_spawn_player()
	_build_hud()
	GameState.deck_changed.connect(_refresh_deck_label)
	_refresh_deck_label()
	if GameState.game_over:
		_show_game_over()
	elif GameState.last_battle_won:
		_hint.text = "战斗胜利。局内瞬时合成已失效。继续探索。"
		GameState.last_battle_won = false


func _unhandled_input(event: InputEvent) -> void:
	if GameState.game_over or _moving:
		return
	if _craft_panel != null and _craft_panel.visible:
		return
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	var dir := Vector2i.ZERO
	match event.keycode:
		KEY_W, KEY_UP:
			dir = Vector2i(0, -1)
		KEY_S, KEY_DOWN:
			dir = Vector2i(0, 1)
		KEY_A, KEY_LEFT:
			dir = Vector2i(-1, 0)
		KEY_D, KEY_RIGHT:
			dir = Vector2i(1, 0)
		_:
			return
	_try_move(dir)
	get_viewport().set_input_as_handled()


func _try_move(dir: Vector2i) -> void:
	var next: Vector2i = GameState.map_cell + dir
	if not _in_bounds(next):
		return
	var cell_type: int = LAYOUT[next.y][next.x]
	if cell_type == 1:
		_hint.text = "无法通行。"
		return
	_moving = true
	GameState.map_cell = next
	_player.position = _cell_to_pos(next)
	_moving = false
	_hint.text = "格子 (%d, %d)  HP %d/%d" % [
		next.x, next.y, GameState.player_hp, GameState.player_max_hp
	]
	if cell_type == 2 and next not in GameState.cleared_combat_cells:
		_hint.text = "遭遇战斗！"
		GameState.start_battle("encounter_basic", next)


func _in_bounds(c: Vector2i) -> bool:
	return c.x >= 0 and c.y >= 0 and c.x < COLS and c.y < ROWS


func _cell_to_pos(c: Vector2i) -> Vector2:
	return Vector2(c.x * TILE + TILE * 0.5, c.y * TILE + TILE * 0.5) + Vector2(80, 80)


func _draw_tiles() -> void:
	for y in ROWS:
		for x in COLS:
			var rect := ColorRect.new()
			rect.size = Vector2(TILE - 2, TILE - 2)
			rect.position = _cell_to_pos(Vector2i(x, y)) - Vector2(TILE, TILE) * 0.5 + Vector2(1, 1)
			var t: int = LAYOUT[y][x]
			match t:
				1:
					rect.color = Color(0.15, 0.16, 0.18)
				2:
					if Vector2i(x, y) in GameState.cleared_combat_cells:
						rect.color = Color(0.25, 0.35, 0.28)
					else:
						rect.color = Color(0.55, 0.22, 0.22)
				3:
					rect.color = Color(0.28, 0.40, 0.55)
				_:
					rect.color = Color(0.22, 0.28, 0.24)
			add_child(rect)
			var tag := Label.new()
			tag.position = rect.position + Vector2(4, 4)
			match t:
				1:
					tag.text = ""
				2:
					tag.text = "战" if Vector2i(x, y) not in GameState.cleared_combat_cells else "清"
				3:
					tag.text = "起"
				_:
					tag.text = ""
			add_child(tag)


func _spawn_player() -> void:
	_player = Node2D.new()
	var body := ColorRect.new()
	body.size = Vector2(28, 28)
	body.position = Vector2(-14, -14)
	body.color = Color(0.85, 0.75, 0.35)
	_player.add_child(body)
	_player.position = _cell_to_pos(GameState.map_cell)
	add_child(_player)


func _build_hud() -> void:
	_overlay = CanvasLayer.new()
	add_child(_overlay)
	_hint = Label.new()
	_hint.position = Vector2(40, 20)
	_hint.add_theme_font_size_override("font_size", 18)
	_hint.text = "WASD / 方向键：单格移动。红色格触发战斗。"
	_overlay.add_child(_hint)

	_deck_label = Label.new()
	_deck_label.position = Vector2(40, 48)
	_deck_label.size = Vector2(900, 40)
	_deck_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_overlay.add_child(_deck_label)

	var craft_open := Button.new()
	craft_open.text = "合成台（永久）"
	craft_open.position = Vector2(1000, 20)
	craft_open.custom_minimum_size = Vector2(160, 36)
	craft_open.pressed.connect(_open_craft)
	_overlay.add_child(craft_open)

	var legend := Label.new()
	legend.position = Vector2(40, 500)
	legend.text = "蓝=起点  绿=地板  红=战斗  灰=墙 | 地图合成=永久2合1 | 战斗合成=局内瞬时，战后失效"
	_overlay.add_child(legend)

	_build_craft_panel()


func _refresh_deck_label() -> void:
	if _deck_label == null:
		return
	_deck_label.text = "全局牌库（%d）：%s" % [GameState.run_deck_ids.size(), GameState.deck_summary()]


func _build_craft_panel() -> void:
	_craft_panel = PanelContainer.new()
	_craft_panel.visible = false
	_craft_panel.position = Vector2(280, 80)
	_craft_panel.custom_minimum_size = Vector2(720, 480)
	_overlay.add_child(_craft_panel)

	var root := VBoxContainer.new()
	_craft_panel.add_child(root)

	var title := Label.new()
	title.text = "地图合成台 — 永久合成（2 消失 → 1 写入全局牌库）"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(title)

	_craft_status = Label.new()
	_craft_status.text = "选择两张牌"
	root.add_child(_craft_status)

	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(700, 320)
	root.add_child(scroll)
	_craft_list = VBoxContainer.new()
	scroll.add_child(_craft_list)

	var recipes := Label.new()
	recipes.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	recipes.text = "配方：" + "；".join(CardLibrary.list_recipe_lines())
	root.add_child(recipes)

	var row := HBoxContainer.new()
	root.add_child(row)
	var confirm := Button.new()
	confirm.text = "确认永久合成"
	confirm.pressed.connect(_confirm_map_craft)
	row.add_child(confirm)
	var clear_btn := Button.new()
	clear_btn.text = "清空选择"
	clear_btn.pressed.connect(_clear_map_selection)
	row.add_child(clear_btn)
	var close := Button.new()
	close.text = "关闭"
	close.pressed.connect(_close_craft)
	row.add_child(close)


func _open_craft() -> void:
	_selected.clear()
	_rebuild_craft_list()
	_craft_panel.visible = true
	_update_craft_status()


func _close_craft() -> void:
	_craft_panel.visible = false
	_selected.clear()


func _clear_map_selection() -> void:
	_selected.clear()
	_rebuild_craft_list()
	_update_craft_status()


func _rebuild_craft_list() -> void:
	for child in _craft_list.get_children():
		_craft_list.remove_child(child)
		child.free()
	_card_buttons.clear()
	for i in GameState.run_deck_ids.size():
		var id: String = GameState.run_deck_ids[i]
		var card := CardLibrary.make_card(id)
		var btn := Button.new()
		var name := card.display if card else id
		var desc := card.describe() if card else id
		btn.text = "[%d] %s" % [i, name]
		btn.tooltip_text = desc
		btn.toggle_mode = true
		btn.button_pressed = _selected.has(i)
		btn.pressed.connect(_on_deck_card_pressed.bind(i))
		_craft_list.add_child(btn)
		_card_buttons.append(btn)


func _on_deck_card_pressed(index: int) -> void:
	var pos := _selected.find(index)
	if pos >= 0:
		_selected.remove_at(pos)
	else:
		if _selected.size() >= 2:
			_selected.pop_front()
		_selected.append(index)
	_rebuild_craft_list()
	_update_craft_status()


func _update_craft_status() -> void:
	if _selected.size() != 2:
		_craft_status.text = "已选 %d/2 — 选择两张不同的全局牌库卡" % _selected.size()
		return
	var id_a: String = GameState.run_deck_ids[_selected[0]]
	var id_b: String = GameState.run_deck_ids[_selected[1]]
	var a := CardLibrary.make_card(id_a)
	var b := CardLibrary.make_card(id_b)
	_craft_status.text = "%s + %s %s" % [a.display, b.display, CardLibrary.recipe_preview(id_a, id_b)]


func _confirm_map_craft() -> void:
	if _selected.size() != 2:
		_craft_status.text = "请先选择两张牌"
		return
	var result := GameState.craft_permanent_at_indices(_selected[0], _selected[1])
	if result.get("ok", false):
		_hint.text = str(result.get("message", "永久合成成功"))
		_selected.clear()
		_rebuild_craft_list()
		_refresh_deck_label()
		_craft_status.text = "合成成功。可继续选择。"
	else:
		_craft_status.text = str(result.get("reason", "合成失败"))


func _show_game_over() -> void:
	var panel := PanelContainer.new()
	panel.position = Vector2(420, 240)
	panel.custom_minimum_size = Vector2(320, 140)
	_overlay.add_child(panel)
	var v := VBoxContainer.new()
	panel.add_child(v)
	var l := Label.new()
	l.text = "本局结束 — 战败"
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	var btn := Button.new()
	btn.text = "重新开始"
	btn.pressed.connect(_on_restart)
	v.add_child(btn)
	_hint.text = "战斗失败。"


func _on_restart() -> void:
	GameState.reset_run()
	get_tree().reload_current_scene()
