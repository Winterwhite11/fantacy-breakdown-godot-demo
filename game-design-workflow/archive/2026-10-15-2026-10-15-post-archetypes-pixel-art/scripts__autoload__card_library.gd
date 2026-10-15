extends Node
## Loads cards.json once; provides templates and 2-material recipe lookup.

var catalog: Dictionary = {} ## id -> CardData template
var recipes: Array[Dictionary] = [] ## {id, result, materials: sorted Array}


func _ready() -> void:
	reload()


func reload() -> void:
	catalog.clear()
	recipes.clear()
	var path := "res://data/cards.json"
	if not FileAccess.file_exists(path):
		push_error("Missing cards.json")
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Invalid cards.json")
		return
	for item in parsed.get("cards", []):
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var c := CardData.from_dict(item)
		catalog[c.id] = c
	for item in parsed.get("recipes", []):
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var mats: Array = item.get("materials", [])
		var sorted_mats: Array[String] = []
		for m in mats:
			sorted_mats.append(str(m))
		sorted_mats.sort()
		recipes.append({
			"id": str(item.get("id", "")),
			"result": str(item.get("result", "")),
			"materials": sorted_mats,
		})


func has_card(id: String) -> bool:
	return catalog.has(id)


func make_card(id: String) -> CardData:
	if not catalog.has(id):
		return null
	var template: CardData = catalog[id]
	return template.duplicate_card()


func find_recipe(material_a: String, material_b: String) -> Dictionary:
	var key: Array[String] = [material_a, material_b]
	key.sort()
	for r in recipes:
		var mats: Array = r["materials"]
		if mats.size() != 2:
			continue
		if str(mats[0]) == key[0] and str(mats[1]) == key[1]:
			return r
	return {}


func recipe_preview(material_a: String, material_b: String) -> String:
	var r := find_recipe(material_a, material_b)
	if r.is_empty():
		return "无匹配配方"
	var result_id: String = r["result"]
	if not catalog.has(result_id):
		return "配方结果缺失"
	var card: CardData = catalog[result_id]
	return "→ %s（费 %d）" % [card.display, card.cost]


func list_recipe_lines() -> PackedStringArray:
	var lines: PackedStringArray = []
	for r in recipes:
		var mats: Array = r["materials"]
		var a: CardData = catalog.get(str(mats[0]), null)
		var b: CardData = catalog.get(str(mats[1]), null)
		var res: CardData = catalog.get(str(r["result"]), null)
		if a == null or b == null or res == null:
			continue
		lines.append("%s + %s → %s" % [a.display, b.display, res.display])
	return lines
