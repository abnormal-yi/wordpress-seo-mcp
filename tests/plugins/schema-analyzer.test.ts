import { describe, it, expect } from 'vitest';
import { analyzeSchema } from '../../src/plugins/schema/analyzer.js';

describe('Schema Analyzer', () => {
  it('reports missing schema when no JSON-LD', () => {
    const r = analyzeSchema('<p>No schema here</p>');
    expect(r.issues.some(i => i.fixId === 'missing-schema')).toBe(true);
  });

  it('detects existing Article schema', () => {
    const r = analyzeSchema('<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>');
    expect(r.issues.some(i => i.fixId === 'missing-article-schema')).toBe(false);
  });

  it('suggests missing schema types', () => {
    const r = analyzeSchema('<p>No schema</p>');
    expect(r.metrics.suggestedTypes).toContain('Article');
    expect(r.metrics.suggestedTypes).toContain('Organization');
    expect(r.metrics.suggestedTypes).toContain('BreadcrumbList');
  });

  it('detects Organization in @graph', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Test"}]}</script>`;
    const r = analyzeSchema(html);
    expect(r.metrics.foundTypes).toContain('Organization');
    expect(r.issues.some(i => i.fixId === 'missing-org-schema')).toBe(false);
  });

  it('handles invalid JSON gracefully', () => {
    const html = '<script type="application/ld+json">{invalid}</script>';
    const r = analyzeSchema(html);
    expect(r.issues.some(i => i.fixId === 'missing-schema')).toBe(true);
  });

  it('counts schemas correctly', () => {
    const html = `
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
    `;
    const r = analyzeSchema(html);
    expect(r.metrics.schemaCount).toBe(2);
  });
});
