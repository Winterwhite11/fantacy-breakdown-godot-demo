extends RefCounted
class_name SynthesisService
## Shared craft rules. Mode decides permanence.


enum Mode { MAP_PERMANENT, BATTLE_TEMP }


static func craft_pair(mode: Mode, card_a: CardData, card_b: CardData) -> Dictionary:
	if card_a == null or card_b == null:
		return {"ok": false, "reason": "需要两张材料卡"}
	var recipe := CardLibrary.find_recipe(card_a.id, card_b.id)
	if recipe.is_empty():
		return {"ok": false, "reason": "无匹配配方"}
	var result_id: String = recipe["result"]
	var result := CardLibrary.make_card(result_id)
	if result == null:
		return {"ok": false, "reason": "结果卡不存在"}
	result.crafted_from = [card_a.id, card_b.id]
	if mode == Mode.BATTLE_TEMP:
		result.is_battle_temp = true
	else:
		result.is_battle_temp = false
	return {
		"ok": true,
		"result": result,
		"recipe_id": recipe["id"],
		"mode": mode,
	}
