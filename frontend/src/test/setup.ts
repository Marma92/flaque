// Global test setup: importing the i18n module initialises the shared i18next
// instance (side effect) so any component using `useTranslation` renders real
// strings under test, regardless of whether the test imports i18n directly.
import "../i18n";
