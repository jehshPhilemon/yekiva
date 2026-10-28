import 'package:flutter_test/flutter_test.dart';
import 'package:yekiva/core/learner_model.dart';

void main() {
  test('un élément raté revient tout de suite, un élément réussi attend', () {
    var now = DateTime(2026, 10, 27, 9);
    final m = LearnerModel(clock: () => now);

    m.record('ma', correct: false);
    m.record('ba', correct: true);
    m.record('ba', correct: true); // boîte 2 -> échéance dans 1 jour

    expect(m.prioritize(['ma', 'ba']), ['ma']);

    now = now.add(const Duration(days: 2));
    expect(m.prioritize(['ma', 'ba']), containsAll(['ma', 'ba']));
  });

  test("un élément jamais vu est à travailler ; l'état se sérialise", () {
    final m = LearnerModel();
    expect(m.prioritize(['ji']), ['ji']);
    m.record('ji', correct: true);

    final copy = LearnerModel()..loadJson(m.toJson());
    expect(copy.stateOf('ji')!.seen, 1);
  });
}
