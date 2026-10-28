import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../core/services.dart';
import '../../core/step_registry.dart';
import '../lesson/lesson_runner.dart';

/// Chemin de progression sans texte : une pastille par leçon, étoile quand elle est faite.
/// TODO : persister la progression sur l'appareil (aujourd'hui en mémoire seulement).
class PathScreen extends StatefulWidget {
  const PathScreen({
    super.key,
    required this.services,
    required this.registry,
    required this.pack,
    required this.audience,
  });

  final Services services;
  final StepRegistry registry;
  final PackManifest pack;
  final String audience;

  @override
  State<PathScreen> createState() => _PathScreenState();
}

class _PathScreenState extends State<PathScreen> {
  final Set<String> _done = {};

  @override
  Widget build(BuildContext context) {
    final lessons = widget.pack.tracks[widget.audience] ?? const <String>[];
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            for (final id in lessons)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Center(
                  child: GestureDetector(
                    onTap: () async {
                      final ok = await Navigator.of(context).push<bool>(MaterialPageRoute<bool>(
                        builder: (_) => LessonRunner(
                          services: widget.services,
                          registry: widget.registry,
                          pack: widget.pack,
                          lessonId: id,
                        ),
                      ));
                      if (ok == true) setState(() => _done.add(id));
                    },
                    child: CircleAvatar(
                      radius: 52,
                      backgroundColor: widget.pack.color,
                      child: Icon(
                        _done.contains(id) ? Icons.star : Icons.play_arrow,
                        size: 56,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
