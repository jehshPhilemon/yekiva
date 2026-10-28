import 'package:flutter/material.dart';

import '../../core/step_registry.dart';
import '../../ui/big_tile.dart';

/// « Écoute et touche » : l'app dit une syllabe, l'apprenant touche la bonne.
/// Fonctionne sans réseau et sans micro : c'est aussi le plan B des exercices vocaux.
Widget buildListenTap(BuildContext context, StepContext ctx) => _ListenTap(ctx: ctx);

class _ListenTap extends StatefulWidget {
  const _ListenTap({required this.ctx});

  final StepContext ctx;

  @override
  State<_ListenTap> createState() => _ListenTapState();
}

class _ListenTapState extends State<_ListenTap> {
  bool _wrongOnce = false;

  Map<String, dynamic> get _params => widget.ctx.step.params;

  List<Map<String, dynamic>> get _choices =>
      [for (final c in _params['choices'] as List) Map<String, dynamic>.from(c as Map)];

  @override
  void initState() {
    super.initState();
    _sayPrompt();
  }

  void _sayPrompt() {
    final say = _params['say'] as Map<String, dynamic>?;
    widget.ctx.services.speaker.say(
      audioAsset: say?['audio'] as String?,
      text: say?['text'] as String?,
      lang: widget.ctx.pack.language,
    );
  }

  void _tap(Map<String, dynamic> choice) {
    if (choice['id'] == _params['answer']) {
      widget.ctx.onDone(!_wrongOnce);
    } else {
      // Pas de punition : on réécoute doucement, on laisse réessayer.
      _wrongOnce = true;
      _sayPrompt();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(child: BigTile(icon: Icons.volume_up, onTap: _sayPrompt)),
        Expanded(
          flex: 2,
          child: Row(
            children: [
              for (final c in _choices)
                Expanded(
                  child: InkWell(
                    onTap: () => _tap(c),
                    child: Card(
                      child: Center(
                        child: FittedBox(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text(c['text'] as String, style: const TextStyle(fontSize: 72)),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
