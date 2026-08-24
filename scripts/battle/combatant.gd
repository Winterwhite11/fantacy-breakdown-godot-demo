extends RefCounted
class_name Combatant
## HP / block / energy / poison for one side.


signal changed

var name_label: String = ""
var max_hp: int = 30
var hp: int = 30
var block: int = 0
var energy: int = 0
var max_energy: int = 3
var poison: int = 0
var is_player: bool = false


func setup(p_name: String, p_max_hp: int, p_max_energy: int, p_is_player: bool) -> void:
	name_label = p_name
	max_hp = p_max_hp
	hp = p_max_hp
	block = 0
	max_energy = p_max_energy
	energy = 0
	poison = 0
	is_player = p_is_player
	changed.emit()


func refill_energy() -> void:
	energy = max_energy
	changed.emit()


func spend_energy(amount: int) -> bool:
	if amount > energy:
		return false
	energy -= amount
	changed.emit()
	return true


func clear_block() -> void:
	block = 0
	changed.emit()


func gain_block(amount: int) -> void:
	block += maxi(amount, 0)
	changed.emit()


func take_damage(amount: int) -> int:
	var remaining := maxi(amount, 0)
	if block > 0:
		var absorbed: int = mini(block, remaining)
		block -= absorbed
		remaining -= absorbed
	if remaining > 0:
		hp = maxi(0, hp - remaining)
	changed.emit()
	return remaining


func heal(amount: int) -> void:
	hp = mini(max_hp, hp + maxi(amount, 0))
	changed.emit()


func apply_poison(amount: int) -> void:
	poison += maxi(amount, 0)
	changed.emit()


## STS-like: poison ticks at start of owner's turn, then decays by 1.
func tick_poison() -> void:
	if poison <= 0:
		return
	hp = maxi(0, hp - poison)
	poison = maxi(0, poison - 1)
	changed.emit()


func is_dead() -> bool:
	return hp <= 0
