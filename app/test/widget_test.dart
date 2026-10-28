import 'package:flutter_test/flutter_test.dart';
import 'package:yekiva/app.dart';

void main() {
  testWidgets("l'app démarre sur l'écran adulte/enfant", (tester) async {
    await tester.pumpWidget(const YekivaApp());
    expect(find.byType(YekivaApp), findsOneWidget);
  });
}
