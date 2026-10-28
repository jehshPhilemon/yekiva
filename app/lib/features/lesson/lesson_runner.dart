import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../core/services.dart';
import '../../core/step_registry.dart';

/// Joue une leçon : une étape à la fois, jamais de punition.
/// Une étape de type inconnu est ignorée (une vieille app peut lire un paquet récent).
class LessonRunner extends StatefulWidget {
  const LessonRunner({
    super.key,
    required this.services,
    required this.registry,
    required this.pack,
    required this.lessonId,
  });

  final Services services;
  final StepRegistry registry;
  final PackManifest pack;
  final String lessonId;

  @override
  State<LessonRunner> createState() => _LessonRunnerState();
}

class _LessonRunnerState extends State<LessonRunner> {
  late final Future<Lesson> _lesson =
      widget.services.packs.loadLesson(widget.pack.id, widget.lessonId);
  int _index = 0;

  void _finish() {
    Navigator.of(context).pop(true);
  }

  void _stepDone(Lesson lesson, LessonStep step, bool success) {
    for (final item in step.items) {
      widget.services.learner.record(item, correct: success);
    }
    if (_index + 1 >= lesson.steps.length) {
      _finish();
    } else {
      setState(() => _index++);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: FutureBuilder<Lesson>(
          future: _lesson,
          builder: (context, snap) {
            if (snap.hasError) return const Center(child: Icon(Icons.error_outline, size: 96));
            if (!snap.hasData) return const Center(child: CircularProgressIndicator());
            final lesson = snap.data!;

            // Saute les étapes dont le type est inconnu.
            var i = _index;
            while (i < lesson.steps.length && widget.registry[lesson.steps[i].type] == null) {
              i++;
            }
            if (i >= lesson.steps.length) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) _finish();
              });
              return const Center(child: Icon(Icons.star, size: 120));
            }
            final step = lesson.steps[i];
            final builder = widget.registry[step.type]!;
            return Column(
              children: [
                LinearProgressIndicator(value: i / lesson.steps.length),
                Expanded(
                  child: KeyedSubtree(
                    key: ValueKey('$i-${step.type}'),
                    child: builder(
                      context,
                      StepContext(
                        step: step,
                        pack: widget.pack,
                        services: widget.services,
                        onDone: (ok) {
                          _index = i;
                          _stepDone(lesson, step, ok);
                        },
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
