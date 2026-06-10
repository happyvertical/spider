/**
 * Platform-adapter engine
 *
 * A domain-agnostic registry + two-phase detection layer on top of the spider
 * fetch/render adapters. Consumers register {@link PlatformAdapter}s that turn a
 * source into normalized items (job postings, meetings, …); the registry detects
 * which adapter handles a URL (URL patterns first, then fetched HTML).
 */
export * from './types.js';
export * from './registry.js';
export * from './link-filter.js';
export * from './context.js';
