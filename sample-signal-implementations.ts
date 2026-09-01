/**
 * Sample Signal Implementations
 * Shows how to implement signals for each type (A, B, C, D)
 */

import { 
  BaseSignal, 
  SignalType, 
  EngineId, 
  AuditData,
  TypeAResult,
  TypeBResult,
  TypeCResult,
  AISystem,
  TypeDResult
} from './signal-types';
import Anthropic from '@anthropic-ai/sdk';
import { BrowserContext } from 'playwright';

// ============================================================================
// TYPE A: DETERMINISTIC SIGNALS (Automated)
// ============================================================================

/**
 * E1.01 - AI Crawl Accessibility
 * Can AI crawlers access your domain?
 */
export class CrawlAccessibilitySignal extends BaseSignal {
  code = 'E1.01';
  name = 'AI Crawl Accessibility';
  description = 'Can AI systems crawl your website content?';
  type = SignalType.A;
  engine = EngineId.E1;
  
  async compute(auditData: AuditData): Promise<TypeAResult> {
    // Check robots.txt
    const robotsTxt = await this.fetchRobotsTxt(auditData.organization.domain);
    
    // Check if major AI crawlers are allowed
    const allowedCrawlers = this.parseRobotsTxt(robotsTxt);
    const aiCrawlersAllowed = [
      'GPTBot', 'Anthropic-AI', 'Googlebot', 'Bingbot'
    ].some(bot => this.isBotAllowed(bot, allowedCrawlers));
    
    // Try actual crawl
    const crawlable = auditData.crawledPages && auditData.crawledPages.length > 0;
    
    return {
      passed: aiCrawlersAllowed && crawlable,
      metricValue: auditData.crawledPages?.length || 0,
      details: {
        robotsTxt: robotsTxt ? 'present' : 'missing',
        aiCrawlersAllowed,
        pagesDiscovered: auditData.crawledPages?.length || 0,
        avgResponseTime: this.calculateAvgResponseTime(auditData.crawledPages),
      }
    };
  }
  
  score(result: TypeAResult): number {
    if (!result.passed) return 0;
    if (result.metricValue > 100) return 100;
    return Math.min((result.metricValue as number) / 100 * 100, 100);
  }
  
  private async fetchRobotsTxt(domain: string): Promise<string> {
    // TODO: Implement with axios
    throw new Error('Not implemented');
  }
  
  private parseRobotsTxt(robots: string): string[] {
    // TODO: Parse robots.txt
    return [];
  }
  
  private isBotAllowed(bot: string, allowedList: string[]): boolean {
    // Check if bot is in allowed list or if * allows all
    return allowedList.includes('*') || allowedList.includes(bot);
  }
  
  private calculateAvgResponseTime(pages: any[]): number {
    if (!pages || pages.length === 0) return 0;
    const total = pages.reduce((sum, p) => sum + (p.responseTime || 0), 0);
    return Math.round(total / pages.length);
  }
}

/**
 * E1.09 - Structured Data Coverage
 * What % of your pages have schema.org markup?
 */
export class StructuredDataCoverageSignal extends BaseSignal {
  code = 'E1.09';
  name = 'Structured Data Coverage';
  description = 'Percentage of pages with valid schema.org markup';
  type = SignalType.A;
  engine = EngineId.E1;
  
  async compute(auditData: AuditData): Promise<TypeAResult> {
    const pagesWithSchema = auditData.crawledPages.filter(
      page => page.structuredData && Object.keys(page.structuredData).length > 0
    ).length;
    
    const coverage = (pagesWithSchema / auditData.crawledPages.length) * 100;
    
    return {
      passed: coverage >= 50, // Threshold: 50% of pages
      metricValue: coverage,
      details: {
        pagesWithSchema,
        totalPages: auditData.crawledPages.length,
        schemaTypes: this.extractSchemaTypes(auditData.crawledPages),
      }
    };
  }
  
  score(result: TypeAResult): number {
    // 0% = 0, 100% = 100
    return result.metricValue as number;
  }
  
  private extractSchemaTypes(pages: any[]): string[] {
    const types = new Set<string>();
    pages.forEach(page => {
      if (page.structuredData) {
        Object.keys(page.structuredData).forEach(key => {
          types.add(key);
        });
      }
    });
    return Array.from(types);
  }
}

// ============================================================================
// TYPE B: AI-ASSISTED SIGNALS (Claude interpretation)
// ============================================================================

/**
 * E3.01 - Core Topic Clarity
 * Does the website clearly communicate what the company does?
 */
export class CoreTopicClaritySignal extends BaseSignal {
  code = 'E3.01';
  name = 'Core Topic Clarity';
  description = 'How clearly does the company communicate its core topic?';
  type = SignalType.B;
  engine = EngineId.E3;
  
  private anthropic: Anthropic;
  
  constructor() {
    super();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  
  async compute(auditData: AuditData): Promise<TypeBResult> {
    // Get homepage and key pages content
    const homePage = auditData.crawledPages.find(p => p.url === auditData.organization.websiteUrl);
    const content = homePage?.title + '\n' + 
      (homePage?.metaDescription || '') + '\n' +
      'H1: ' + (homePage?.h1 || '');
    
    const prompt = `You are analyzing a company's website to assess how clearly they communicate their core topic.

Company: ${auditData.organization.name}
Website Content:
${content}

Please evaluate:
1. Is the core topic/offering immediately clear from the homepage?
2. How specific or generic is the messaging?
3. Is there a clear value proposition?

Provide:
- A clarity rating (1-10)
- The inferred core topic
- Key observations
- Recommendations for improvement`;

    const response = await this.anthropic.messages.create({
      model: 'claude-opus-4',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const assessment = response.content[0].type === 'text' ? response.content[0].text : '';
    const rating = this.extractRatingFromAssessment(assessment);
    
    return {
      assessment,
      rating,
      reasoning: {
        model: 'claude-opus-4',
        tokensUsed: response.usage.output_tokens
      },
      confidence: 0.85 // Claude assessments are ~85% confident
    };
  }
  
  score(result: TypeBResult): number {
    // Convert 1-10 rating to 0-100
    if (!result.rating) return 0;
    return Math.min(result.rating * 10, 100);
  }
  
  private extractRatingFromAssessment(text: string): number | undefined {
    const match = text.match(/rating[:\s]+(\d+)/i);
    return match ? parseInt(match[1]) : undefined;
  }
}

/**
 * E4.09 - Case Study Evidence
 * Does the company provide detailed case studies?
 */
export class CaseStudyEvidenceSignal extends BaseSignal {
  code = 'E4.09';
  name = 'Case Study Evidence';
  description = 'Quality and comprehensiveness of case study documentation';
  type = SignalType.B;
  engine = EngineId.E4;
  
  private anthropic: Anthropic;
  
  constructor() {
    super();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  
  async compute(auditData: AuditData): Promise<TypeBResult> {
    // Find case study pages
    const caseStudyPages = auditData.crawledPages.filter(p => 
      /case.?studies?|success.?stories?|results/i.test(p.url)
    );
    
    if (caseStudyPages.length === 0) {
      return {
        assessment: 'No case studies found on the website.',
        rating: 0,
        reasoning: { caseStudyCount: 0 },
        confidence: 1.0
      };
    }
    
    // Evaluate case study quality
    const prompt = `Evaluate the quality of these case study pages:
${caseStudyPages.map(p => `- ${p.url}: "${p.title}"`).join('\n')}

Assessment criteria:
1. Number of case studies: ${caseStudyPages.length}
2. Do they include metrics/ROI?
3. Are client names/companies mentioned?
4. Level of detail (generic vs specific)?

Provide a quality rating 1-10 and reasoning.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-opus-4',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const assessment = response.content[0].type === 'text' ? response.content[0].text : '';
    const rating = this.extractRatingFromAssessment(assessment);
    
    return {
      assessment,
      rating,
      reasoning: { caseStudyCount: caseStudyPages.length },
      confidence: 0.80
    };
  }
  
  score(result: TypeBResult): number {
    return result.rating ? Math.min(result.rating * 10, 100) : 0;
  }
  
  private extractRatingFromAssessment(text: string): number | undefined {
    const match = text.match(/rating[:\s]+(\d+)/i);
    return match ? parseInt(match[1]) : undefined;
  }
}

// ============================================================================
// TYPE C: GENERATIVE OBSERVATION SIGNALS (Query AI systems)
// ============================================================================

/**
 * E5.01 - AI Brand Mention Rate
 * How often do AI systems mention your brand?
 */
export class AIBrandMentionRateSignal extends BaseSignal {
  code = 'E5.01';
  name = 'AI Brand Mention Rate';
  description = 'Frequency that AI systems mention your brand';
  type = SignalType.C;
  engine = EngineId.E5;
  
  async compute(auditData: AuditData): Promise<TypeCResult> {
    // These AI queries should already be in auditData from E5 queries
    const e5Queries = auditData.aiQueries.filter(q => 
      q.id.startsWith('E5')
    );
    
    const mentionsBySystem = new Map<AISystem, number>();
    
    for (const system of Object.values(AISystem)) {
      const systemQueries = e5Queries.filter(q => q.system === system);
      const mentions = systemQueries.filter(q => q.mentionsBrand).length;
      mentionsBySystem.set(system, mentions);
    }
    
    const totalQueries = e5Queries.length;
    const totalMentions = Array.from(mentionsBySystem.values()).reduce((a, b) => a + b, 0);
    const avgMentionRate = totalMentions / (totalQueries || 1);
    
    const observations = new Map();
    for (const [system, count] of mentionsBySystem) {
      observations.set(system, [{
        query: 'branded queries',
        mentions: count,
        context: []
      }]);
    }
    
    return {
      observations,
      aggregatedMetric: avgMentionRate * 100, // Convert to percentage
      trend: 'stable'
    };
  }
  
  score(result: TypeCResult): number {
    // 0% = 0, 100% = 100
    return Math.min(result.aggregatedMetric, 100);
  }
}

/**
 * E5.05 - AI Brand Description Accuracy
 * How accurately does AI describe your brand?
 */
export class AIBrandDescriptionAccuracySignal extends BaseSignal {
  code = 'E5.05';
  name = 'AI Brand Description Accuracy';
  description = 'Accuracy of AI systems\' descriptions of your brand';
  type = SignalType.C;
  engine = EngineId.E5;
  
  private anthropic: Anthropic;
  
  constructor() {
    super();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  
  async compute(auditData: AuditData): Promise<TypeCResult> {
    // Get AI system responses that describe the brand
    const descriptionQueries = auditData.aiQueries.filter(q => 
      /describe|what is|about/i.test(q.query)
    );
    
    if (descriptionQueries.length === 0) {
      return {
        observations: new Map(),
        aggregatedMetric: 0,
        trend: 'stable'
      };
    }
    
    // Have Claude evaluate accuracy
    const evaluationPrompt = `Compare these AI-generated descriptions of ${auditData.organization.name} 
to what's stated on their website.

Website Description:
${auditData.organization.description}

AI Descriptions:
${descriptionQueries.map(q => `${q.system}: "${q.response}"`).join('\n\n')}

Rate overall accuracy (1-10) and identify inaccuracies.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-opus-4',
      max_tokens: 400,
      messages: [{ role: 'user', content: evaluationPrompt }]
    });
    
    const assessment = response.content[0].type === 'text' ? response.content[0].text : '';
    const accuracy = this.extractAccuracyScore(assessment);
    
    const observations = new Map();
    for (const system of Object.values(AISystem)) {
      observations.set(system, [{
        query: 'describe brand',
        mentions: accuracy,
        context: [descriptionQueries.find(q => q.system === system)?.response || '']
      }]);
    }
    
    return {
      observations,
      aggregatedMetric: accuracy * 10, // Convert to 0-100
      trend: 'stable'
    };
  }
  
  score(result: TypeCResult): number {
    return Math.min(result.aggregatedMetric, 100);
  }
  
  private extractAccuracyScore(text: string): number {
    const match = text.match(/accuracy[:\s]+(\d+)/i);
    return match ? parseInt(match[1]) : 5;
  }
}

// ============================================================================
// TYPE D: CROSS-SOURCE REASONING SIGNALS
// ============================================================================

/**
 * E2.02 - Entity Name Consistency
 * How consistently is your brand name represented across sources?
 */
export class EntityNameConsistencySignal extends BaseSignal {
  code = 'E2.02';
  name = 'Entity Name Consistency';
  description = 'Consistency of organization name across sources';
  type = SignalType.D;
  engine = EngineId.E2;
  
  private anthropic: Anthropic;
  
  constructor() {
    super();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  
  async compute(auditData: AuditData): Promise<TypeDResult> {
    // Collect names from multiple sources
    const sources = {
      website: auditData.organization.name,
      websiteEntity: auditData.organization.entityNames?.official,
      linkedin: auditData.externalSources?.linkedin?.companyName,
      crunchbase: auditData.externalSources?.crunchbase?.name,
      wikipedia: auditData.externalSources?.wikipedia?.title,
      googleKG: auditData.externalSources?.googleKnowledgeGraph?.name,
    };
    
    // Have Claude analyze consistency
    const prompt = `Analyze if these company names refer to the same entity:
${Object.entries(sources)
  .filter(([_, v]) => v)
  .map(([k, v]) => `- ${k}: "${v}"`)
  .join('\n')}

Determine:
1. Are these all referring to the same organization?
2. Are the variations minor (punctuation, spacing) or significant?
3. Any name aliases that should be recognized?
4. Overall consistency score (1-10)

Provide: consistency rating (yes/partial/no), reasoning.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-opus-4',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const reasoning = response.content[0].type === 'text' ? response.content[0].text : '';
    const consistency = this.extractConsistencyLevel(reasoning);
    const score = this.consistencyToScore(consistency);
    
    return {
      sources,
      consistency,
      reasoning,
      alignmentScore: score
    };
  }
  
  score(result: TypeDResult): number {
    return result.alignmentScore;
  }
  
  private extractConsistencyLevel(text: string): 'yes' | 'partial' | 'no' {
    if (/yes/i.test(text)) return 'yes';
    if (/partial/i.test(text)) return 'partial';
    return 'no';
  }
  
  private consistencyToScore(consistency: 'yes' | 'partial' | 'no'): number {
    const scores = { yes: 100, partial: 60, no: 0 };
    return scores[consistency];
  }
}

/**
 * E4.10 - Claim-Evidence Alignment
 * Are the company's claims backed by evidence?
 */
export class ClaimEvidenceAlignmentSignal extends BaseSignal {
  code = 'E4.10';
  name = 'Claim-Evidence Alignment';
  description = 'How well supported are key claims with evidence';
  type = SignalType.D;
  engine = EngineId.E4;
  
  private anthropic: Anthropic;
  
  constructor() {
    super();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  
  async compute(auditData: AuditData): Promise<TypeDResult> {
    // Extract key claims from website
    const homePageContent = auditData.crawledPages
      .find(p => p.url === auditData.organization.websiteUrl);
    
    const prompt = `Analyze these website claims and evaluate supporting evidence:

Claims from ${auditData.organization.name}:
${homePageContent?.title}
${homePageContent?.metaDescription}

Available Evidence Sources:
- Third-party mentions: ${auditData.aiQueries.filter(q => q.mentionsBrand).length} AI references
- Case studies: ${auditData.crawledPages.filter(p => /case/i.test(p.url)).length} found
- Reviews/testimonials: ${auditData.crawledPages.filter(p => /review|testimonial/i.test(p.url)).length} found

For each major claim, assess:
1. Is it explicitly stated with evidence?
2. Are claims quantified or vague?
3. Can claims be independently verified?

Overall alignment score (1-10) and recommendations.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-opus-4',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const reasoning = response.content[0].type === 'text' ? response.content[0].text : '';
    const score = this.extractScoreFromAssessment(reasoning);
    
    return {
      sources: {
        websiteClaims: 'extracted',
        evidenceItems: auditData.aiQueries.length + auditData.crawledPages.length
      },
      consistency: 'yes', // Placeholder
      reasoning,
      alignmentScore: score * 10 // Convert to 0-100
    };
  }
  
  score(result: TypeDResult): number {
    return Math.min(result.alignmentScore, 100);
  }
  
  private extractScoreFromAssessment(text: string): number {
    const match = text.match(/score[:\s]+(\d+)/i);
    return match ? parseInt(match[1]) : 5;
  }
}

export const SAMPLE_SIGNALS = [
  // Type A
  new CrawlAccessibilitySignal(),
  new StructuredDataCoverageSignal(),
  
  // Type B
  new CoreTopicClaritySignal(),
  new CaseStudyEvidenceSignal(),
  
  // Type C
  new AIBrandMentionRateSignal(),
  new AIBrandDescriptionAccuracySignal(),
  
  // Type D
  new EntityNameConsistencySignal(),
  new ClaimEvidenceAlignmentSignal(),
];
