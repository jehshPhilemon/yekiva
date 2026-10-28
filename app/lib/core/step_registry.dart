import 'package:flutter/widgets.dart';

import 'models.dart';
import 'services.dart';

/// Ce que reçoit le widget d'une étape.
class StepContext {
  StepContext({
    required this.step,
    required this.pack,
    required this.services,
    required this.onDone,
  });

  final LessonStep step;
  final PackManifest pack;
  final Services services;

  /// À appeler quand l'étape est terminée. `success` = réussie sans erreur.
  final void Function(bool success) onDone;
}

typedef StepBuilder = Widget Function(BuildContext context, StepContext ctx);

/// type d'étape (string du JSON) -> widget. Un type inconnu renvoie null : la leçon l'ignore.
class StepRegistry {
  final Map<String, StepBuilder> _builders = {};

  void register(String type, StepBuilder builder) => _builders[type] = builder;

  StepBuilder? operator [](String type) => _builders[type];
}
