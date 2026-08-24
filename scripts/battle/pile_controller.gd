extends RefCounted
class_name PileController
## Draw / hand / discard piles.
## KEY RULE (differs from STS): draw() never reshuffles.
## Discard is shuffled into draw only via ensure_draw_pile_for_turn(),
## which battle code calls at PlayerTurnStart.

signal piles_changed

var draw_pile: Array[CardData] = []
var hand: Array[CardData] = []
var discard_pile: Array[CardData] = []
var exhaust_pile: Array[CardData] = []
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func setup(deck: Array[CardData], seed_value: int = 0) -> void:
	draw_pile.clear()
	hand.clear()
	discard_pile.clear()
	exhaust_pile.clear()
	if seed_value != 0:
		_rng.seed = seed_value
	else:
		_rng.randomize()
	for card in deck:
		draw_pile.append(card.duplicate_card())
	_shuffle(draw_pile)
	piles_changed.emit()


## Called only at turn start. If draw pile cannot supply `needed` cards,
## shuffle discard into draw first. Never called from draw().
func ensure_draw_pile_for_turn(needed: int) -> void:
	if draw_pile.size() >= needed:
		return
	if discard_pile.is_empty():
		return
	_shuffle_discard_into_draw()
	piles_changed.emit()


func draw(count: int) -> int:
	var drawn := 0
	for _i in count:
		if draw_pile.is_empty():
			# Do NOT reshuffle here — intentional non-STS rule.
			break
		hand.append(draw_pile.pop_back())
		drawn += 1
	if drawn > 0:
		piles_changed.emit()
	return drawn


func discard_hand() -> void:
	while not hand.is_empty():
		discard_pile.append(hand.pop_back())
	piles_changed.emit()


func discard_from_hand(index: int) -> void:
	if index < 0 or index >= hand.size():
		return
	discard_pile.append(hand[index])
	hand.remove_at(index)
	piles_changed.emit()


func play_from_hand(index: int) -> CardData:
	assert(index >= 0 and index < hand.size())
	var card: CardData = hand[index]
	hand.remove_at(index)
	discard_pile.append(card)
	piles_changed.emit()
	return card


func remove_from_hand(index: int) -> CardData:
	assert(index >= 0 and index < hand.size())
	var card: CardData = hand[index]
	hand.remove_at(index)
	piles_changed.emit()
	return card


func add_to_hand(card: CardData) -> void:
	hand.append(card)
	piles_changed.emit()


func count_temp_crafts() -> int:
	var n := 0
	for c in draw_pile:
		if c.is_battle_temp:
			n += 1
	for c in hand:
		if c.is_battle_temp:
			n += 1
	for c in discard_pile:
		if c.is_battle_temp:
			n += 1
	for c in exhaust_pile:
		if c.is_battle_temp:
			n += 1
	return n


func counts() -> Dictionary:
	return {
		"draw": draw_pile.size(),
		"hand": hand.size(),
		"discard": discard_pile.size(),
		"exhaust": exhaust_pile.size(),
	}


func _shuffle_discard_into_draw() -> void:
	while not discard_pile.is_empty():
		draw_pile.append(discard_pile.pop_back())
	_shuffle(draw_pile)


func _shuffle(arr: Array[CardData]) -> void:
	for i in range(arr.size() - 1, 0, -1):
		var j: int = _rng.randi_range(0, i)
		var tmp: CardData = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp
