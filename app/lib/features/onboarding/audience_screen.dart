import 'package:flutter/material.dart';

import '../../core/services.dart';
import '../../core/step_registry.dart';
import '../../ui/big_tile.dart';
import 'language_screen.dart';

/// Écran 1 : adulte ou enfant. Deux grosses icônes, aucun mot.
/// QUESTION OUVERTE (voir docs/OPEN_QUESTIONS.md) : dans quelle langue parle la voix ici,
/// puisque la langue n'est pas encore choisie ?
class AudienceScreen extends StatefulWidget {
  const AudienceScreen({super.key, required this.services, required this.registry});

  final Services services;
  final StepRegistry registry;

  @override
  State<AudienceScreen> createState() => _AudienceScreenState();
}

class _AudienceScreenState extends State<AudienceScreen> {
  @override
  void initState() {
    super.initState();
    // TODO voix : consigne parlée « touche l'image qui te ressemble ».
    widget.services.speaker.say(text: 'audience_prompt');
  }

  void _pick(String audience) {
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LanguageScreen(
        services: widget.services,
        registry: widget.registry,
        audience: audience,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(child: BigTile(icon: Icons.person, onTap: () => _pick('adult'))),
            Expanded(child: BigTile(icon: Icons.child_care, onTap: () => _pick('child'))),
          ],
        ),
      ),
    );
  }
}
