import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../core/services.dart';
import '../../core/step_registry.dart';
import '../../ui/big_tile.dart';
import '../path/path_screen.dart';

/// Choix de la langue « à l'oreille » : chaque langue installée parle à son tour, dans sa propre langue
/// (prompts.language_pick de son paquet), et sa tuile clignote pendant qu'elle parle.
/// Toucher une tuile à tout moment la choisit. Une nouvelle langue apparaît dès qu'un paquet est ajouté.
class LanguageScreen extends StatefulWidget {
  const LanguageScreen({
    super.key,
    required this.services,
    required this.registry,
    required this.audience,
  });

  final Services services;
  final StepRegistry registry;
  final String audience;

  @override
  State<LanguageScreen> createState() => _LanguageScreenState();
}

class _LanguageScreenState extends State<LanguageScreen> with SingleTickerProviderStateMixin {
  late final Future<List<PackManifest>> _packs = widget.services.packs.listPacks().then(
        (all) => all.where((p) => (p.tracks[widget.audience] ?? const []).isNotEmpty).toList(),
      );

  late final AnimationController _blink = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 600),
  )..repeat(reverse: true);

  int? _active;
  bool _stopped = false;

  @override
  void initState() {
    super.initState();
    _cycle();
  }

  @override
  void dispose() {
    _stopped = true;
    _blink.dispose();
    super.dispose();
  }

  Future<void> _say(PackManifest p) {
    final prompt = p.prompts['language_pick'];
    return widget.services.speaker.say(
      audioAsset: prompt?.audio,
      text: prompt?.text,
      lang: p.language,
    );
  }

  /// Boucle : chaque langue à son tour, jusqu'à ce que l'apprenant touche une tuile.
  Future<void> _cycle() async {
    final packs = await _packs;
    while (mounted && !_stopped && packs.isNotEmpty) {
      for (var i = 0; i < packs.length; i++) {
        if (!mounted || _stopped) return;
        setState(() => _active = i);
        await _say(packs[i]);
        await Future<void>.delayed(const Duration(milliseconds: 800));
      }
      await Future<void>.delayed(const Duration(seconds: 3));
    }
  }

  void _choose(PackManifest p) {
    _stopped = true;
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => PathScreen(
        services: widget.services,
        registry: widget.registry,
        pack: p,
        audience: widget.audience,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: FutureBuilder<List<PackManifest>>(
          future: _packs,
          builder: (context, snap) {
            if (!snap.hasData) return const Center(child: CircularProgressIndicator());
            final packs = snap.data!;
            return Column(
              children: [
                for (var i = 0; i < packs.length; i++)
                  Expanded(
                    child: AnimatedBuilder(
                      animation: _blink,
                      builder: (context, child) => Opacity(
                        opacity: _active == i && !_stopped ? 0.35 + 0.65 * _blink.value : 1.0,
                        child: child,
                      ),
                      child: BigTile(
                        icon: Icons.touch_app,
                        color: packs[i].color.withAlpha(90),
                        onTap: () => _choose(packs[i]),
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
