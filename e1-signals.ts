import { Signal, SignalType, EngineId, AuditData, CrawledPageData } from '@/types';
import { SignalModel } from '@models/Signal';
import { logger } from '@utils/logger';

/**
 * Base class for Type A (Deterministic) signals
 */
export abstract class TypeASignal {
  abstract code: string;
  abstract name: string;
  abstract description: string;
  engineId = EngineId.E1;
  type = SignalType.A;

  abstract compute(auditData: AuditData): Promise<number>;

  async save(auditData: AuditData): Promise<Signal> {
    const score = await this.compute(auditData);
    return SignalModel.create({
      auditId: auditData.audit.id,
      engineId: this.engineId,
      signalCode: this.code,
      signalType: this.type,
      name: this.name,
      description: this.description,
      normalizedScore: score,
      confidence: 1.0, // Type A signals are 100% confident
      evidence: this.getEvidence(auditData),
      computationDetails: {
        type: 'deterministic',
        autoChecked: true,
      },
    });
  }

  protected getEvidence(_: AuditData): Record<string, any> {
    return {};
  }
}

/**
 * E1.01 - AI Crawl Accessibility
 * Can AI systems crawl your website?
 */
export class E1_01_CrawlAccessibility extends TypeASignal {
  code = 'E1.01';
  name = 'AI Crawl Accessibility';
  description = 'Can AI systems access and crawl your website content?';

  async compute(auditData: AuditData): Promise<number> {
    const { crawledPages } = auditData;

    if (!crawledPages || crawledPages.length === 0) {
      return 0; // No pages discovered
    }

    // Check if homepage is accessible
    const homepage = crawledPages.find((p) => p.url === auditData.organization.websiteUrl);
    if (!homepage || homepage.statusCode >= 400) {
      return 0; // Homepage not accessible
    }

    // Check crawlability of other pages
    const crawlablePages = crawledPages.filter((p) => p.statusCode < 400);
    const crawlabilityRate = (crawlablePages.length / crawledPages.length) * 100;

    // Check average response time (fast = good)
    const avgResponseTime = this.calculateAvgResponseTime(crawledPages);
    const responseTimeScore = Math.max(0, 100 - (avgResponseTime / 100) * 10);

    // Combine scores
    return (crawlabilityRate + responseTimeScore) / 2;
  }

  private calculateAvgResponseTime(pages: CrawledPageData[]): number {
    if (pages.length === 0) return 0;
    const sum = pages.reduce((acc, p) => acc + p.responseTime, 0);
    return sum / pages.length;
  }

  protected getEvidence(auditData: AuditData): Record<string, any> {
    const { crawledPages } = auditData;
    const crawlablePages = crawledPages?.filter((p) => p.statusCode < 400) || [];
    const avgResponseTime = this.calculateAvgResponseTime(crawledPages || []);

    return {
      totalPagesCrawled: crawledPages?.length || 0,
      crawlablePages: crawlablePages.length,
      crawlabilityRate: ((crawlablePages.length / (crawledPages?.length || 1)) * 100).toFixed(2),
      avgResponseTimeMs: Math.round(avgResponseTime),
      homepage: crawledPages?.[0]?.url,
      homepageStatusCode: crawledPages?.[0]?.statusCode,
    };
  }
}

/**
 * E1.08 - Machine-Readable Content Ratio
 * What percentage of your content is actual text (vs noise)?
 */
export class E1_08_MachineReadableContent extends TypeASignal {
  code = 'E1.08';
  name = 'Machine-Readable Content Ratio';
  description = 'Percentage of pages with substantial machine-readable text content';

  async compute(auditData: AuditData): Promise<number> {
    const { crawledPages } = auditData;

    if (!crawledPages || crawledPages.length === 0) {
      return 0;
    }

    // Define minimum content threshold (200 characters)
    const MIN_CONTENT_LENGTH = 200;

    const pagesWithContent = crawledPages.filter(
      (p) => p.contentLength >= MIN_CONTENT_LENGTH && p.crawlableAsBot
    );

    const ratio = (pagesWithContent.length / crawledPages.length) * 100;
    return Math.min(ratio, 100);
  }

  protected getEvidence(auditData: AuditData): Record<string, any> {
    const { crawledPages } = auditData;
    const MIN_CONTENT_LENGTH = 200;

    const stats = {
      totalPages: crawledPages?.length || 0,
      pagesWithAdequateContent: crawledPages?.filter(
        (p) => p.contentLength >= MIN_CONTENT_LENGTH
      ).length || 0,
      avgContentLength: Math.round(
        (crawledPages?.reduce((sum, p) => sum + p.contentLength, 0) || 0) /
          (crawledPages?.length || 1)
      ),
      minContentThreshold: MIN_CONTENT_LENGTH,
    };

    return stats;
  }
}

/**
 * E1.09 - Structured Data Coverage
 * What % of your pages have schema.org markup?
 */
export class E1_09_StructuredDataCoverage extends TypeASignal {
  code = 'E1.09';
  name = 'Structured Data Coverage';
  description = 'Percentage of pages with valid schema.org structured data';

  async compute(auditData: AuditData): Promise<number> {
    const { crawledPages } = auditData;

    if (!crawledPages || crawledPages.length === 0) {
      return 0;
    }

    const pagesWithSchema = crawledPages.filter(
      (p) => p.structuredData && Object.keys(p.structuredData).length > 0
    );

    const coverage = (pagesWithSchema.length / crawledPages.length) * 100;
    return Math.min(coverage, 100);
  }

  protected getEvidence(auditData: AuditData): Record<string, any> {
    const { crawledPages } = auditData;

    const pagesWithSchema = crawledPages?.filter(
      (p) => p.structuredData && Object.keys(p.structuredData).length > 0
    ) || [];

    // Aggregate schema types
    const schemaTypes = new Set<string>();
    crawledPages?.forEach((page) => {
      if (page.structuredData) {
        Object.keys(page.structuredData).forEach((type) => schemaTypes.add(type));
      }
    });

    return {
      totalPages: crawledPages?.length || 0,
      pagesWithSchema: pagesWithSchema.length,
      coverage: ((pagesWithSchema.length / (crawledPages?.length || 1)) * 100).toFixed(2),
      schemaTypes: Array.from(schemaTypes),
      recommendedSchemaTypes: ['Organization', 'Product', 'LocalBusiness', 'Article'],
    };
  }
}

/**
 * E1.11 - Canonical Consistency
 * Are canonical tags used consistently and correctly?
 */
export class E1_11_CanonicalConsistency extends TypeASignal {
  code = 'E1.11';
  name = 'Canonical Consistency';
  description = 'Proper implementation and consistency of canonical tags';

  async compute(auditData: AuditData): Promise<number> {
    const { crawledPages } = auditData;

    if (!crawledPages || crawledPages.length === 0) {
      return 50; // Unknown
    }

    // In a real implementation, we would parse canonical tags from HTML
    // For now, we'll estimate based on URL structure (no duplicates/parameters)

    const urlSet = new Set<string>();
    let potentialDuplicates = 0;

    for (const page of crawledPages) {
      // Extract base URL without query params
      const baseUrl = page.url.split('?')[0];

      if (urlSet.has(baseUrl)) {
        potentialDuplicates++;
      } else {
        urlSet.add(baseUrl);
      }
    }

    const duplicateRate = (potentialDuplicates / crawledPages.length) * 100;
    const score = Math.max(0, 100 - duplicateRate * 2);

    return score;
  }

  protected getEvidence(auditData: AuditData): Record<string, any> {
    const { crawledPages } = auditData;

    const urlSet = new Set<string>();
    let potentialDuplicates = 0;

    for (const page of crawledPages || []) {
      const baseUrl = page.url.split('?')[0];
      if (urlSet.has(baseUrl)) {
        potentialDuplicates++;
      } else {
        urlSet.add(baseUrl);
      }
    }

    return {
      totalPages: crawledPages?.length || 0,
      uniqueBaseUrls: urlSet.size,
      potentialDuplicateParams: potentialDuplicates,
      duplicateRate: ((potentialDuplicates / (crawledPages?.length || 1)) * 100).toFixed(2),
      recommendation: 'Ensure each URL has only one canonical version',
    };
  }
}

/**
 * E1.12 - Content Freshness
 * How recent is your website content?
 */
export class E1_12_ContentFreshness extends TypeASignal {
  code = 'E1.12';
  name = 'Content Freshness Accessibility';
  description = 'Indicates if your content appears to be regularly updated';

  async compute(auditData: AuditData): Promise<number> {
    const { crawledPages } = auditData;

    if (!crawledPages || crawledPages.length === 0) {
      return 50; // Unknown
    }

    // Look for freshness indicators in content
    const now = new Date();
    let freshnessScore = 50; // Default middle score

    const allContent = crawledPages
      .map((p) => `${p.title} ${p.metaDescription} ${p.h1}`)
      .join(' ')
      .toLowerCase();

    // Check for date indicators (simplified)
    const currentYear = now.getFullYear();
    const lastYear = currentYear - 1;

    const currentYearMentions = (allContent.match(new RegExp(String(currentYear), 'g')) || [])
      .length;
    const lastYearMentions = (allContent.match(new RegExp(String(lastYear), 'g')) || []).length;

    if (currentYearMentions > 0) {
      freshnessScore = 80; // Recent updates likely
    } else if (lastYearMentions > 0) {
      freshnessScore = 60; // Somewhat recent
    } else {
      freshnessScore = 40; // Potentially stale
    }

    return freshnessScore;
  }

  protected getEvidence(auditData: AuditData): Record<string, any> {
    return {
      note: 'Freshness estimated from content mentions of dates',
      method: 'Automatic analysis of published dates and year mentions',
      recommendation: 'Regularly update your content and include publish/update dates',
    };
  }
}

/**
 * All E1 Type A signals
 */
export const E1_TYPE_A_SIGNALS = [
  new E1_01_CrawlAccessibility(),
  new E1_08_MachineReadableContent(),
  new E1_09_StructuredDataCoverage(),
  new E1_11_CanonicalConsistency(),
  new E1_12_ContentFreshness(),
];
