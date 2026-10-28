import 'dart:convert';
import 'dart:ui' show Offset;

import 'package:flutter/services.dart' show rootBundle;

import 'models.dart';

/// Lit les paquets de leçons. Aujourd'hui : assets embarqués.
/// Plus tard : même interface, mais en lisant aussi le dossier de l'app (paquets téléchargés ou partagés).
class PackRepository {
  PackRepository({this.root = 'assets/packs'});

  final String root;

  Future<Map<String, dynamic>> _json(String path) async =>
      jsonDecode(await rootBundle.loadString(path)) as Map<String, dynamic>;

  Future<List<PackManifest>> listPacks() async {
    final index = await _json('$root/index.json');
    final ids = List<String>.from(index['packs'] as List);
    return [for (final id in ids) PackManifest.fromJson(await _json('$root/$id/manifest.json'))];
  }

  Future<Lesson> loadLesson(String packId, String lessonId) async =>
      Lesson.fromJson(await _json('$root/$packId/lessons/$lessonId.json'));

  /// Traits d'une lettre, coordonnées normalisées 0..1.
  Future<Map<String, List<List<Offset>>>> loadGlyphs(PackManifest pack) async {
    if (pack.glyphsFile == null) return {};
    final raw = await _json('$root/${pack.id}/${pack.glyphsFile}');
    return raw.map((key, value) => MapEntry(key, [
          for (final stroke in value as List)
            [
              for (final p in stroke as List)
                Offset((p[0] as num).toDouble(), (p[1] as num).toDouble()),
            ],
        ]));
  }
}
