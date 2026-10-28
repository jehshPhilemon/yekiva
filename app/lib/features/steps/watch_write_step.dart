import 'package:flutter/material.dart';

import '../../core/step_registry.dart';
import '../../ui/big_tile.dart';
import '../../ui/glyph_painter.dart';
import 'glyph_loader.dart';

/// « Voir écrire » : la lettre se dessine trait après trait, avec la voix. Rejouable.
Widget buildWatchWrite(BuildContext context, StepContext ctx) =>
    GlyphLoader(ctx: ctx, builder: (_, strokes) => _WatchWrite(ctx: ctx, strokes: strokes));

class _WatchWrite extends StatefulWidget {
  const _WatchWrite({required this.ctx, required this.strokes});

  final StepContext ctx;
  final List<List<Offset>> strokes;

  @override
  State<_WatchWrite> createState() => _WatchWriteState();
}

class _WatchWriteState extends State<_WatchWrite> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: widget.ctx.step.params['durationMs'] as int? ?? 2500),
  );

  @override
  void initState() {
    super.initState();
    _play();
  }

  void _play() {
    final say = widget.ctx.step.params['say'] as Map<String, dynamic>?;
    widget.ctx.services.speaker.say(
      audioAsset: say?['audio'] as String?,
      text: say?['text'] as String?,
      lang: widget.ctx.pack.language,
    );
    _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          flex: 3,
          child: Center(
            child: AspectRatio(
              aspectRatio: 1,
              child: AnimatedBuilder(
                animation: _c,
                builder: (_, __) => CustomPaint(
                  painter: GlyphPainter(strokes: widget.strokes, progress: _c.value),
                ),
              ),
            ),
          ),
        ),
        Expanded(
          child: Row(
            children: [
              Expanded(child: BigTile(icon: Icons.replay, onTap: _play, size: 56)),
              Expanded(child: BigTile(icon: Icons.check, onTap: () => widget.ctx.onDone(true), size: 56)),
            ],
          ),
        ),
      ],
    );
  }
}
