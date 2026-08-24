extends RefCounted
class_name CardData
## Card instance. Templates come from CardLibrary; battle crafts may be temporary.

var id: String = ""
var display: String = ""
var cost: int = 1
var effect_type: String = "damage" ## damage | block | poison | acid | energy | energy_next
var amount: int = 0
var tags: Array = []
## If true, this instance was crafted in the current battle and vanishes after combat.
var is_battle_temp: bool = false
## Material card ids consumed to create this instance (length 2 for demo recipes).
var crafted_from: Array[String] = []


static func from_dict(d: Dictionary) -> CardData:
	var c := CardData.new()
	c.id = str(d.get("id", ""))
	c.display = str(d.get("display", c.id))
	c.cost = int(d.get("cost", 1))
	c.effect_type = str(d.get("effect_type", "damage"))
	c.amount = int(d.get("amount", 0))
	c.tags = d.get("tags", [])
	return c


func duplicate_card() -> CardData:
	var c := CardData.new()
	c.id = id
	c.display = display
	c.cost = cost
	c.effect_type = effect_type
	c.amount = amount
	c.tags = tags.duplicate()
	c.is_battle_temp = is_battle_temp
	c.crafted_from = crafted_from.duplicate()
	return c


func describe() -> String:
	var extra := ""
	if is_battle_temp:
		extra = "〔局内〕"
	match effect_type:
		"damage":
			return "%s%s：造成 %d 伤害（费 %d）" % [display, extra, amount, cost]
		"block":
			return "%s%s：获得 %d 护甲（费 %d）" % [display, extra, amount, cost]
		"poison":
			return "%s%s：施加 %d 毒（费 %d）" % [display, extra, amount, cost]
		"acid":
			return "%s%s：%d 伤并清除 50%% 护甲（费 %d）" % [display, extra, amount, cost]
		"energy":
			return "%s%s：弃 1 得 %d 费（费 %d，灰盒简化为直接得费）" % [display, extra, amount, cost]
		"energy_next":
			return "%s%s：下回合 +%d 费标记（费 %d，灰盒简化为本回合得费）" % [display, extra, amount, cost]
		_:
			return "%s%s（费 %d）" % [display, extra, cost]
