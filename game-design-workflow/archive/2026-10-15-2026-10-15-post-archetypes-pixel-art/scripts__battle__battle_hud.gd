extends Control
## Builds STS-like battle layout and binds to BattleController.

@onready var controller: BattleController = $BattleController

var _enemy_hp: Label
var _enemy_intent: Label
var _player_hp: Label
var _player_block: Label
var _energy_label: Label
var _draw_btn: Button
var _discard_btn: Button
var _hand_row: HBoxContainer
var _log_box: RichTextLabel
var _phase_label: Label
var _result_panel: PanelContainer
var _result_label: Label
var _status_label: Label
var _end_btn: Button
var _craft_btn: Button
var _confirm_craft_btn: Button
var _cancel_craft_btn: Button
var _craft_mode: bool = false


func _ready() -> void:
	_build_ui()
	controller.state_changed.connect(_on_state_changed)
	controller.log_message.connect(_on_log)
	controller.battle_over.connect(_on_battle_over)
	controller.ui_refresh_needed.connect(refresh)
	controller.begin_battle(GameState.player_hp, GameState.player_max_hp)
	refresh()


func refresh() -> void:
	if _enemy_hp == null:
		return
	_enemy_hp.text = "敌 HP %d/%d  甲 %d  毒 %d" % [
		controller.enemy.hp, controller.enemy.max_hp, controller.enemy.block, controller.enemy.poison
	]
	_enemy_intent.text = "意图：%s" % controller.ai.intent_text()
	_player_hp.text = "我 HP %d/%d" % [controller.player.hp, controller.player.max_hp]
	_player_block.text = "护甲 %d  毒 %d" % [controller.player.block, controller.player.poison]
	_energy_label.text = "%d / %d" % [controller.player.energy, controller.player.max_energy]
	var counts := controller.piles.counts()
	_draw_btn.text = "抽牌堆\n%d" % counts["draw"]
	_discard_btn.text = "弃牌堆\n%d" % counts["discard"]
	var in_main := controller.state == BattleController.State.PLAYER_MAIN
	_end_btn.disabled = not in_main or _craft_mode
	_craft_btn.disabled = not in_main
	_confirm_craft_btn.visible = _craft_mode
	_cancel_craft_btn.visible = _craft_mode
	_confirm_craft_btn.disabled = controller.craft_selection.size() != 2
	_status_label.text = controller.craft_preview_text() if _craft_mode else ""
	_rebuild_hand()
	_phase_label.text = _phase_name(controller.state)


func _phase_name(s: BattleController.State) -> String:
	if _craft_mode and s == BattleController.State.PLAYER_MAIN:
		return "合成台（局内）— 选择两张手牌后确认"
	match s:
		BattleController.State.PLAYER_MAIN:
			return "你的回合 — 打出卡牌 / 合成台 / 结束回合"
		BattleController.State.PLAYER_TURN_START:
			return "回合开始"
		BattleController.State.ENEMY_TURN:
			return "敌方回合"
		BattleController.State.RESULT:
			return "战斗结束"
		_:
			return "准备中"


func _rebuild_hand() -> void:
	for child in _hand_row.get_children():
		_hand_row.remove_child(child)
		child.free()
	var in_main := controller.state == BattleController.State.PLAYER_MAIN
	for i in controller.piles.hand.size():
		var card: CardData = controller.piles.hand[i]
		var selected := _craft_mode and controller.craft_selection.has(i)
		var interactable := in_main and (
			_craft_mode or card.cost <= controller.player.energy
		)
		var view := CardView.new()
		_hand_row.add_child(view)
		view.setup(i, card, interactable, selected, _craft_mode)
		view.card_pressed.connect(_on_card_pressed)


func _on_card_pressed(index: int) -> void:
	if _craft_mode:
		controller.toggle_craft_select(index)
	else:
		controller.try_play_card(index)
	refresh()


func _on_end_turn() -> void:
	_craft_mode = false
	controller.end_player_turn()
	refresh()


func _on_craft_toggle() -> void:
	if controller.state != BattleController.State.PLAYER_MAIN:
		return
	_craft_mode = not _craft_mode
	controller.clear_craft_selection()
	_craft_btn.text = "退出合成" if _craft_mode else "合成台"
	refresh()


func _on_confirm_craft() -> void:
	var result := controller.confirm_battle_craft()
	if result.get("ok", false):
		_status_label.text = "合成成功（局内）"
	else:
		_status_label.text = str(result.get("reason", "合成失败"))
	refresh()


func _on_cancel_craft() -> void:
	_craft_mode = false
	controller.clear_craft_selection()
	_craft_btn.text = "合成台"
	refresh()


func _on_state_changed(_s: String) -> void:
	if controller.state != BattleController.State.PLAYER_MAIN:
		_craft_mode = false
		_craft_btn.text = "合成台"
	refresh()


func _on_log(text: String) -> void:
	_log_box.append_text(text + "\n")


func _on_battle_over(won: bool) -> void:
	_craft_mode = false
	_result_panel.visible = true
	_result_label.text = "胜利！" if won else "战败…"
	refresh()


func _on_return_pressed() -> void:
	var won := controller.enemy.is_dead() and not controller.player.is_dead()
	controller.finish_and_return(won)


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var bg := ColorRect.new()
	bg.color = Color(0.09, 0.11, 0.14)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	move_child(bg, 0)

	_enemy_hp = _make_label(Vector2(0.5, 0.06), "敌", 22)
	_enemy_intent = _make_label(Vector2(0.5, 0.12), "意图", 18)
	_phase_label = _make_label(Vector2(0.5, 0.20), "阶段", 16)
	_status_label = _make_label(Vector2(0.5, 0.25), "", 14)
	_status_label.modulate = Color(0.85, 0.75, 0.45)

	_player_hp = _make_label(Vector2(0.5, 0.58), "HP", 20)
	_player_block = _make_label(Vector2(0.5, 0.63), "甲", 16)

	var energy_box := PanelContainer.new()
	energy_box.anchor_left = 0.72
	energy_box.anchor_right = 0.88
	energy_box.anchor_top = 0.68
	energy_box.anchor_bottom = 0.78
	add_child(energy_box)
	var energy_v := VBoxContainer.new()
	energy_box.add_child(energy_v)
	var energy_title := Label.new()
	energy_title.text = "费用"
	energy_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	energy_v.add_child(energy_title)
	_energy_label = Label.new()
	_energy_label.text = "3 / 3"
	_energy_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_energy_label.add_theme_font_size_override("font_size", 28)
	energy_v.add_child(_energy_label)

	var item_box := PanelContainer.new()
	item_box.anchor_left = 0.88
	item_box.anchor_right = 0.98
	item_box.anchor_top = 0.35
	item_box.anchor_bottom = 0.62
	add_child(item_box)
	var item_v := VBoxContainer.new()
	item_box.add_child(item_v)
	var item_title := Label.new()
	item_title.text = "道具区"
	item_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	item_v.add_child(item_title)
	for i in 3:
		var slot := Button.new()
		slot.text = "空"
		slot.disabled = true
		slot.custom_minimum_size = Vector2(0, 40)
		item_v.add_child(slot)

	_draw_btn = Button.new()
	_draw_btn.anchor_left = 0.02
	_draw_btn.anchor_right = 0.12
	_draw_btn.anchor_top = 0.82
	_draw_btn.anchor_bottom = 0.96
	_draw_btn.disabled = true
	_draw_btn.text = "抽牌堆\n0"
	add_child(_draw_btn)

	_discard_btn = Button.new()
	_discard_btn.anchor_left = 0.88
	_discard_btn.anchor_right = 0.98
	_discard_btn.anchor_top = 0.82
	_discard_btn.anchor_bottom = 0.96
	_discard_btn.disabled = true
	_discard_btn.text = "弃牌堆\n0"
	add_child(_discard_btn)

	var hand_panel := PanelContainer.new()
	hand_panel.anchor_left = 0.14
	hand_panel.anchor_right = 0.70
	hand_panel.anchor_top = 0.78
	hand_panel.anchor_bottom = 0.98
	add_child(hand_panel)
	_hand_row = HBoxContainer.new()
	_hand_row.alignment = BoxContainer.ALIGNMENT_CENTER
	hand_panel.add_child(_hand_row)

	_end_btn = Button.new()
	_end_btn.text = "结束回合"
	_end_btn.anchor_left = 0.72
	_end_btn.anchor_right = 0.86
	_end_btn.anchor_top = 0.80
	_end_btn.anchor_bottom = 0.86
	_end_btn.pressed.connect(_on_end_turn)
	add_child(_end_btn)

	_craft_btn = Button.new()
	_craft_btn.text = "合成台"
	_craft_btn.anchor_left = 0.72
	_craft_btn.anchor_right = 0.86
	_craft_btn.anchor_top = 0.87
	_craft_btn.anchor_bottom = 0.92
	_craft_btn.pressed.connect(_on_craft_toggle)
	add_child(_craft_btn)

	_confirm_craft_btn = Button.new()
	_confirm_craft_btn.text = "确认合成"
	_confirm_craft_btn.anchor_left = 0.58
	_confirm_craft_btn.anchor_right = 0.70
	_confirm_craft_btn.anchor_top = 0.70
	_confirm_craft_btn.anchor_bottom = 0.76
	_confirm_craft_btn.visible = false
	_confirm_craft_btn.pressed.connect(_on_confirm_craft)
	add_child(_confirm_craft_btn)

	_cancel_craft_btn = Button.new()
	_cancel_craft_btn.text = "取消选择"
	_cancel_craft_btn.anchor_left = 0.58
	_cancel_craft_btn.anchor_right = 0.70
	_cancel_craft_btn.anchor_top = 0.64
	_cancel_craft_btn.anchor_bottom = 0.69
	_cancel_craft_btn.visible = false
	_cancel_craft_btn.pressed.connect(_on_cancel_craft)
	add_child(_cancel_craft_btn)

	var log_panel := PanelContainer.new()
	log_panel.anchor_left = 0.02
	log_panel.anchor_right = 0.28
	log_panel.anchor_top = 0.32
	log_panel.anchor_bottom = 0.75
	add_child(log_panel)
	_log_box = RichTextLabel.new()
	_log_box.bbcode_enabled = false
	_log_box.scroll_following = true
	_log_box.fit_content = false
	_log_box.custom_minimum_size = Vector2(200, 200)
	log_panel.add_child(_log_box)

	_result_panel = PanelContainer.new()
	_result_panel.visible = false
	_result_panel.anchor_left = 0.35
	_result_panel.anchor_right = 0.65
	_result_panel.anchor_top = 0.35
	_result_panel.anchor_bottom = 0.55
	add_child(_result_panel)
	var result_v := VBoxContainer.new()
	_result_panel.add_child(result_v)
	_result_label = Label.new()
	_result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result_label.add_theme_font_size_override("font_size", 28)
	result_v.add_child(_result_label)
	var ret := Button.new()
	ret.text = "返回地图"
	ret.pressed.connect(_on_return_pressed)
	result_v.add_child(ret)


func _make_label(anchor: Vector2, text: String, size: int) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", size)
	l.anchor_left = anchor.x
	l.anchor_right = anchor.x
	l.anchor_top = anchor.y
	l.anchor_bottom = anchor.y
	l.offset_left = -280
	l.offset_right = 280
	l.offset_top = -12
	l.offset_bottom = 12
	add_child(l)
	return l
