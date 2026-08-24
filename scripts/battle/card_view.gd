extends Button
class_name CardView
## Clickable hand card widget.

signal card_pressed(hand_index: int)

var hand_index: int = -1
var card: CardData = null


func setup(index: int, data: CardData, interactable: bool, selected: bool = false, craft_mode: bool = false) -> void:
	hand_index = index
	card = data
	custom_minimum_size = Vector2(100, 140)
	disabled = not interactable
	var tag := ""
	if data.is_battle_temp:
		tag = "〔局〕"
	var mode_hint := "选" if craft_mode else ""
	text = "%s%s\n费 %d\n%s%s" % [data.display, tag, data.cost, _effect_short(data), ("\n" + mode_hint) if craft_mode and selected else ""]
	tooltip_text = data.describe()
	if selected:
		modulate = Color(1.0, 0.92, 0.45, 1)
	elif interactable:
		modulate = Color(1, 1, 1, 1)
	else:
		modulate = Color(0.55, 0.55, 0.55, 1)


func _ready() -> void:
	if not pressed.is_connected(_on_pressed):
		pressed.connect(_on_pressed)


func _on_pressed() -> void:
	card_pressed.emit(hand_index)


func _effect_short(data: CardData) -> String:
	match data.effect_type:
		"damage":
			return "伤%d" % data.amount
		"block":
			return "甲%d" % data.amount
		"poison":
			return "毒%d" % data.amount
		"acid":
			return "酸%d" % data.amount
		"energy", "energy_next":
			return "费+%d" % data.amount
		_:
			return ""
