/**
 * ClawNexus - Routing Strategy Interface
 */

import type { RouteCandidate, RoutingContext, ProviderHealth } from '../types.js';

export interface StrategyContext {
  roundRobinIndex: Map<string, number>;
  providerHealth: Map<string, ProviderHealth>;
}

export interface RoutingStrategyInterface {
  /**
   * Select the best candidate from the list
   */
  select(
    candidates: RouteCandidate[],
    context: RoutingContext,
    strategyContext: StrategyContext
  ): RouteCandidate;
}
