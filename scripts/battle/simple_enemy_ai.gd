extends RefCounted
class_name SimpleEnemyAI
## Alternating attack / defend intents for greybox.


enum Intent { ATTACK, DEFEND }

var attack_damage: int = 6
var defend_block: int = 5
var next_intent: Intent = Intent.ATTACK


func peek_intent() -> Intent:
	return next_intent


func intent_text() -> String:
	match next_intent:
		Intent.ATTACK:
			return "攻击 %d" % attack_damage
		Intent.DEFEND:
			return "防御 %d" % defend_block
	return "?"


func execute(enemy: Combatant, player: Combatant) -> String:
	var log_line := ""
	match next_intent:
		Intent.ATTACK:
			var dealt := player.take_damage(attack_damage)
			log_line = "敌人攻击 %d（穿透护甲后伤 %d）" % [attack_damage, dealt]
			next_intent = Intent.DEFEND
		Intent.DEFEND:
			enemy.gain_block(defend_block)
			log_line = "敌人获得 %d 护甲" % defend_block
			next_intent = Intent.ATTACK
	return log_line
