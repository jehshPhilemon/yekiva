import 'package:flutter/material.dart';

import 'core/services.dart';
import 'core/step_registry.dart';
import 'features/onboarding/audience_screen.dart';
import 'features/steps/listen_tap_step.dart';
import 'features/steps/trace_letter_step.dart';
import 'features/steps/watch_write_step.dart';

class YekivaApp extends StatelessWidget {
  const YekivaApp({super.key});

  @override
  Widget build(BuildContext context) {
    final services = Services.defaults();
    final registry = StepRegistry()
      ..register('listen_tap', buildListenTap)
      ..register('trace_letter', buildTraceLetter)
      ..register('watch_write', buildWatchWrite);
    // Nouveau format de leçon = une ligne register() ici + un widget. Rien d'autre ne change.

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Yekiva',
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFFEF6C00),
        useMaterial3: true,
      ),
      home: AudienceScreen(services: services, registry: registry),
    );
  }
}
