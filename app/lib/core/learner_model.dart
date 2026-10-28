/// Modèle d'apprenant : dit quels éléments (lettres, syllabes) doivent revenir.
/// Dart pur, sans dépendance, donc testable partout. Principe des boîtes de Leitner.
class ItemState {
  ItemState({this.box = 0, this.seen = 0, this.wrong = 0, this.due});

  int box;
  int seen;
  int wrong;
  DateTime? due;

  Map<String, dynamic> toJson() =>
      {'box': box, 'seen': seen, 'wrong': wrong, 'due': due?.toIso8601String()};

  factory ItemState.fromJson(Map<String, dynamic> j) => ItemState(
        box: j['box'] as int,
        seen: j['seen'] as int,
        wrong: j['wrong'] as int,
        due: j['due'] == null ? null : DateTime.parse(j['due'] as String),
      );
}

class LearnerModel {
  LearnerModel({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;
  final Map<String, ItemState> _items = {};

  static const List<Duration> _intervals = [
    Duration.zero,
    Duration(minutes: 10),
    Duration(days: 1),
    Duration(days: 3),
    Duration(days: 7),
  ];

  ItemState? stateOf(String item) => _items[item];

  void record(String item, {required bool correct}) {
    final s = _items.putIfAbsent(item, () => ItemState());
    s.seen++;
    if (correct) {
      s.box = s.box + 1 < _intervals.length ? s.box + 1 : _intervals.length - 1;
    } else {
      s.box = 0;
      s.wrong++;
    }
    s.due = _clock().add(_intervals[s.box]);
  }

  /// Éléments à retravailler maintenant (jamais vus ou échéance passée), les plus ratés d'abord.
  List<String> prioritize(Iterable<String> candidates) {
    final now = _clock();
    final due = <String>[];
    for (final c in candidates) {
      final s = _items[c];
      if (s == null || s.due == null || !s.due!.isAfter(now)) due.add(c);
    }
    due.sort((a, b) => (_items[b]?.wrong ?? 0).compareTo(_items[a]?.wrong ?? 0));
    return due;
  }

  Map<String, dynamic> toJson() => _items.map((k, v) => MapEntry(k, v.toJson()));

  void loadJson(Map<String, dynamic> j) {
    _items
      ..clear()
      ..addAll(j.map((k, v) => MapEntry(k, ItemState.fromJson(Map<String, dynamic>.from(v as Map)))));
  }
}
