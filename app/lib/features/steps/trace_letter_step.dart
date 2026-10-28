import 'package:flutter/material.dart';

import '../../core/step_registry.dart';
import '../../ui/big_tile.dart';
import '../../ui/glyph_painter.dart';
import 'glyph_loader.dart';

/// « Suivre le modèle » : lettre en pointillés, repassée du doigt.
/// TODO (prochaine étape) : vérifier sens et ordre des traits, puis valider/guider doucement.
/// Pour l'instant le bouton coche valide toujours : c'est un squelette, pas une évaluation.
Widget buildTraceLetter(BuildContext context, StepContext ctx) =>
    GlyphLoader(ctx: ctx, builder: (_, strokes) => _TraceLetter(ctx: ctx, strokes: strokes));

class _TraceLetter extends StatefulWidget {
  const _TraceLetter({required this.ctx, required this.strokes});

  final StepContext ctx;
  final List<List<Offset>> strokes;

  @override
  State<_TraceLetter> createState() => _TraceLetterState();
}

class _TraceLetterState extends State<_TraceLetter> {
  final List<List<Offset>> _user = [];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          flex: 3,
          child: Center(
            child: AspectRatio(
              aspectRatio: 1,
              child: GestureDetector(
                onPanStart: (d) => setState(() => _user.add([d.localPosition])),
                onPanUpdate: (d) => setState(() => _user.last.add(d.localPosition)),
                child: CustomPaint(
                  painter: GlyphPainter(strokes: widget.strokes, dashed: true, user: _user),
                ),
              ),
            ),
          ),
        ),
        Expanded(
          child: Row(
            children: [
              Expanded(child: BigTile(icon: Icons.delete_outline, onTap: () => setState(_user.clear), size: 56)),
              Expanded(child: BigTile(icon: Icons.check, onTap: () => widget.ctx.onDone(true), size: 56)),
            ],
          ),
        ),
      ],
    );
  }
}
