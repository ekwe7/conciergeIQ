// Public API of the escalations module. Other modules import from this file only.
export { createEscalationsModule, type EscalationsModule } from './escalations.module.js';
export type { Notifier, OutgoingMessage } from './application/notifier.port.js';
export { NotifierError } from './application/notifier.port.js';
export { TermiiNotifier } from './infrastructure/termii.notifier.js';
export { LogNotifier } from './infrastructure/log.notifier.js';
