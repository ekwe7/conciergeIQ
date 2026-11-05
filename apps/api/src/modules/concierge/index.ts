// Public API of the concierge module. Other modules import from this file only.
export { createConciergeModule, type ConciergeModule } from './concierge.module.js';
export type { ConciergeGuest, HotelFacts } from './application/concierge.service.js';
export type { ConciergeModel, ConciergeTurn, ModelAnswer } from './application/concierge-model.port.js';
export { ConciergeUnavailableError } from './application/concierge-model.port.js';
export { ClaudeConciergeModel } from './infrastructure/claude.model.js';
export type { ConciergeContext } from './domain/prompt.js';
