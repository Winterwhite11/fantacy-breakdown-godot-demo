extends Node
class_name BattleController
## Turn state machine for one combat encounter.

signal state_changed(state: String)
signal log_message(text: String)
signal battle_over(won: bool)
signal ui_refresh_needed

enum State {
	SETUP,
	PLAYER_TURN_START,
	PLAYER_MAIN,
	PLAYING_CARD,
	ENEMY_TURN,
	CHECK_WIN_LOSE,
	RESULT,
}

const DRAW_PER_TURN := 5
const PLAYER_ENERGY := 3
const ENEMY_MAX_HP := 40

var state: State = State.SETUP
var player: Combatant = Combatant.new()
var enemy: Combatant = Combatant.new()
var piles: PileController = PileController.new()
var ai: SimpleEnemyAI = SimpleEnemyAI.new()
var turn_index: int = 0
## Hand indices selected for battle-temp craft (0–2 cards).
var craft_selection: Array[int] = []


func begin_battle(player_hp: int, player_max_hp: int) -> void:
	player.setup("拓宇者", player_max_hp, PLAYER_ENERGY, true)
	player.hp = player_hp
	enemy.setup("铭蚀体", ENEMY_MAX_HP, 0, false)
	piles.setup(GameState.build_battle_deck())
	ai = SimpleEnemyAI.new()
	turn_index = 0
	craft_selection.clear()
	_set_state(State.SETUP)
	_append_log("战斗开始。局内合成仅用手牌，战后瞬时合成失效（材料回到全局牌库形态）。")
	_append_log("抽牌堆耗尽不会立即洗回，下回合开始才从弃牌堆补充。")
	call_deferred("_enter_player_turn_start")


func try_play_card(hand_index: int) -> bool:
	if state != State.PLAYER_MAIN:
		return false
	if hand_index < 0 or hand_index >= piles.hand.size():
		return false
	var card: CardData = piles.hand[hand_index]
	if card.cost > player.energy:
		_append_log("费用不足，无法打出「%s」。" % card.display)
		return false
	_set_state(State.PLAYING_CARD)
	craft_selection.clear()
	player.spend_energy(card.cost)
	piles.play_from_hand(hand_index)
	_resolve_card(card, player, enemy)
	_append_log("打出「%s」。" % card.display)
	ui_refresh_needed.emit()
	if _check_immediate_end():
		return true
	_set_state(State.PLAYER_MAIN)
	ui_refresh_needed.emit()
	return true


func end_player_turn() -> void:
	if state != State.PLAYER_MAIN:
		return
	craft_selection.clear()
	piles.discard_hand()
	_append_log("结束回合。手牌进入弃牌堆。")
	_set_state(State.ENEMY_TURN)
	ui_refresh_needed.emit()
	call_deferred("_run_enemy_turn")


func toggle_craft_select(hand_index: int) -> void:
	if state != State.PLAYER_MAIN:
		return
	if hand_index < 0 or hand_index >= piles.hand.size():
		return
	var pos := craft_selection.find(hand_index)
	if pos >= 0:
		craft_selection.remove_at(pos)
	else:
		if craft_selection.size() >= 2:
			craft_selection.pop_front()
		craft_selection.append(hand_index)
	ui_refresh_needed.emit()


func clear_craft_selection() -> void:
	craft_selection.clear()
	ui_refresh_needed.emit()


func craft_preview_text() -> String:
	if craft_selection.size() != 2:
		return "局内合成：点选手牌两张材料（仅当前手牌）"
	var a: CardData = piles.hand[craft_selection[0]]
	var b: CardData = piles.hand[craft_selection[1]]
	return "选中 %s + %s %s" % [a.display, b.display, CardLibrary.recipe_preview(a.id, b.id)]


func confirm_battle_craft() -> Dictionary:
	if state != State.PLAYER_MAIN:
		return {"ok": false, "reason": "仅能在你的回合合成"}
	if craft_selection.size() != 2:
		return {"ok": false, "reason": "请选择两张手牌"}
	var i0: int = craft_selection[0]
	var i1: int = craft_selection[1]
	if i0 == i1:
		return {"ok": false, "reason": "请选择两张不同手牌"}
	var card_a: CardData = piles.hand[i0]
	var card_b: CardData = piles.hand[i1]
	var crafted := SynthesisService.craft_pair(SynthesisService.Mode.BATTLE_TEMP, card_a, card_b)
	if not crafted.get("ok", false):
		_append_log(str(crafted.get("reason", "合成失败")))
		ui_refresh_needed.emit()
		return crafted
	# Remove higher index first so lower stays valid.
	var hi := maxi(i0, i1)
	var lo := mini(i0, i1)
	piles.remove_from_hand(hi)
	piles.remove_from_hand(lo)
	var result: CardData = crafted["result"]
	piles.add_to_hand(result)
	craft_selection.clear()
	_append_log("局内瞬时合成：%s + %s → %s〔战后失效〕" % [card_a.display, card_b.display, result.display])
	ui_refresh_needed.emit()
	return crafted


func finish_and_return(won: bool) -> void:
	var temps := piles.count_temp_crafts()
	if temps > 0:
		_append_log("战斗结束：%d 张局内合成牌失效，材料形态回到全局牌库。" % temps)
	GameState.finish_battle(won)


func _enter_player_turn_start() -> void:
	if state == State.RESULT:
		return
	turn_index += 1
	_set_state(State.PLAYER_TURN_START)
	craft_selection.clear()
	player.clear_block()
	player.tick_poison()
	if player.is_dead():
		_finish(false)
		return
	player.refill_energy()
	piles.ensure_draw_pile_for_turn(DRAW_PER_TURN)
	var drawn := piles.draw(DRAW_PER_TURN)
	_append_log("第 %d 回合 — 抽了 %d 张（抽牌堆 %d / 弃牌堆 %d）。" % [
		turn_index, drawn, piles.draw_pile.size(), piles.discard_pile.size()
	])
	_set_state(State.PLAYER_MAIN)
	ui_refresh_needed.emit()


func _run_enemy_turn() -> void:
	enemy.clear_block()
	enemy.tick_poison()
	if enemy.is_dead():
		_finish(true)
		return
	var line := ai.execute(enemy, player)
	_append_log(line)
	GameState.apply_player_hp(player.hp)
	ui_refresh_needed.emit()
	_set_state(State.CHECK_WIN_LOSE)
	if _check_immediate_end():
		return
	call_deferred("_enter_player_turn_start")


func _check_immediate_end() -> bool:
	if enemy.is_dead():
		_finish(true)
		return true
	if player.is_dead():
		_finish(false)
		return true
	return false


func _finish(won: bool) -> void:
	if state == State.RESULT:
		return
	_set_state(State.RESULT)
	GameState.apply_player_hp(player.hp)
	var temps := piles.count_temp_crafts()
	if temps > 0:
		_append_log("瞬时合成将失效（1→2 概念分解，全局牌库保持材料）。")
	if won:
		_append_log("胜利。")
	else:
		_append_log("战败。")
	ui_refresh_needed.emit()
	battle_over.emit(won)


func _resolve_card(card: CardData, source: Combatant, target: Combatant) -> void:
	match card.effect_type:
		"damage":
			target.take_damage(card.amount)
		"block":
			source.gain_block(card.amount)
		"poison":
			target.apply_poison(card.amount)
		"acid":
			target.take_damage(card.amount)
			target.block = int(floor(float(target.block) * 0.5))
			target.changed.emit()
		"energy", "energy_next":
			source.energy = mini(source.max_energy + 2, source.energy + card.amount)
			source.changed.emit()
		_:
			pass


func _set_state(s: State) -> void:
	state = s
	state_changed.emit(State.keys()[s])


func _append_log(text: String) -> void:
	log_message.emit(text)
