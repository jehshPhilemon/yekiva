import 'dart:ui' show Color;

/// Une étape d'une leçon. `type` choisit le widget ; `params` est libre selon le type.
class LessonStep {
  const LessonStep({required this.type, required this.params, required this.items});

  final String type;
  final Map<String, dynamic> params;

  /// Ce que l'étape fait travailler (lettre, syllabe, mot). Alimente le modèle d'apprenant.
  final List<String> items;

  factory LessonStep.fromJson(Map<String, dynamic> j) => LessonStep(
        type: j['type'] as String,
        params: Map<String, dynamic>.from(j['params'] as Map? ?? const {}),
        items: List<String>.from(j['items'] as List? ?? const []),
      );
}

class Lesson {
  const Lesson({required this.id, required this.steps});

  final String id;
  final List<LessonStep> steps;

  factory Lesson.fromJson(Map<String, dynamic> j) => Lesson(
        id: j['id'] as String,
        steps: [
          for (final s in j['steps'] as List)
            LessonStep.fromJson(Map<String, dynamic>.from(s as Map)),
        ],
      );
}

/// Règles de comparaison de la transcription : elles vivent dans le paquet (par langue), pas dans le code.
class MatchingRules {
  const MatchingRules({this.stripAccents = true, this.ignoreCase = true, this.maxEdits = 1});

  final bool stripAccents;
  final bool ignoreCase;
  final int maxEdits;

  factory MatchingRules.fromJson(Map<String, dynamic>? j) => j == null
      ? const MatchingRules()
      : MatchingRules(
          stripAccents: j['stripAccents'] as bool? ?? true,
          ignoreCase: j['ignoreCase'] as bool? ?? true,
          maxEdits: j['maxEdits'] as int? ?? 1,
        );
}

/// Une consigne parlée : audio du paquet si présent, sinon synthèse vocale du texte.
class Prompt {
  const Prompt({this.text, this.audio});

  final String? text;
  final String? audio;

  factory Prompt.fromJson(Map<String, dynamic> j) =>
      Prompt(text: j['text'] as String?, audio: j['audio'] as String?);
}

class PackManifest {
  const PackManifest({
    required this.id,
    required this.language,
    required this.version,
    required this.name,
    required this.color,
    required this.prompts,
    required this.glyphsFile,
    required this.matching,
    required this.tracks,
  });

  final String id;
  final String language;
  final int version;

  /// Pour les développeurs seulement : l'apprenant ne lit pas.
  final String name;
  final Color color;

  /// Consignes parlées dans la langue du paquet : 'language_pick' (obligatoire),
  /// puis 'audience_adult', 'audience_child', etc.
  final Map<String, Prompt> prompts;
  final String? glyphsFile;
  final MatchingRules matching;

  /// 'adult' | 'child' -> ids de leçons, dans l'ordre du parcours.
  final Map<String, List<String>> tracks;

  factory PackManifest.fromJson(Map<String, dynamic> j) {
    final hex = (j['ui']?['color'] as String? ?? '#EF6C00').replaceFirst('#', '');
    return PackManifest(
      id: j['id'] as String,
      language: j['language'] as String,
      version: j['version'] as int,
      name: j['name'] as String,
      color: Color(int.parse('FF$hex', radix: 16)),
      prompts: {
        for (final e in ((j['prompts'] as Map<String, dynamic>?) ?? const <String, dynamic>{}).entries)
          e.key: Prompt.fromJson(Map<String, dynamic>.from(e.value as Map)),
      },
      glyphsFile: j['glyphs'] as String?,
      matching: MatchingRules.fromJson(j['matching'] as Map<String, dynamic>?),
      tracks: {
        for (final e in (j['tracks'] as Map<String, dynamic>).entries)
          e.key: List<String>.from(e.value as List),
      },
    );
  }
}
