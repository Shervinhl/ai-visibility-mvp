import { chromium, Browser, BrowserContext } from 'playwright';
import { CrawledPageData } from '@/types';
import { logger } from '@utils/logger';
import * as cheerio from 'cheerio';

export class WebCrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private crawledUrls: Set<string> = new Set();
  private maxPages: number = parseInt(process.env.MAX_PAGES_PER_AUDIT || '500');
  private crawlTimeout: number = parseInt(process.env.CRAWL_TIMEOUT_MS || '30000');

  /**
   * Initialize browser
   */
  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (compatible; AIVisibility/1.0; +https://aivisibility.ai)',
      });
      logger.info('Web crawler initialized');
    } catch (error) {
      logger.error('Failed to initialize web crawler', { error });
      throw error;
    }
  }

  /**
   * Crawl a website and return all discovered pages
   */
  async crawlWebsite(startUrl: string): Promise<CrawledPageData[]> {
    if (!this.context) {
      throw new Error('Crawler not initialized');
    }

    this.crawledUrls.clear();
    const pages: CrawledPageData[] = [];
    const queue: string[] = [startUrl];

    try {
      while (queue.length > 0 && pages.length < this.maxPages) {
        const url = queue.shift();
        if (!url || this.crawledUrls.has(url)) continue;

        this.crawledUrls.add(url);

        try {
          const pageData = await this.crawlPage(url);
          if (pageData) {
            pages.push(pageData);

            // Add discovered internal links to queue
            for (const link of pageData.internalLinks) {
              if (
                !this.crawledUrls.has(link) &&
                queue.length < this.maxPages &&
                !queue.includes(link)
              ) {
                queue.push(link);
              }
            }
          }
        } catch (error) {
          logger.warn(`Failed to crawl page: ${url}`, { error });
        }
      }

      logger.info(`Crawl completed: ${pages.length} pages discovered`);
      return pages;
    } catch (error) {
      logger.error('Crawl failed', { error, startUrl });
      throw error;
    }
  }

  /**
   * Crawl a single page
   */
  private async crawlPage(url: string): Promise<CrawledPageData | null> {
    if (!this.context) return null;

    const page = await this.context.newPage();
    try {
      const startTime = Date.now();

      // Navigate to page
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.crawlTimeout,
      });

      const responseTime = Date.now() - startTime;
      const statusCode = response?.status() || 0;

      if (statusCode >= 400) {
        logger.warn(`Page returned ${statusCode}: ${url}`);
        return null;
      }

      // Get page content
      const content = await page.content();
      const $ = cheerio.load(content);

      // Extract metadata
      const title = $('title').text() || $('h1').first().text();
      const metaDescription = $('meta[name="description"]').attr('content');
      const h1 = $('h1').first().text();
      const bodyText = $('body').text().trim();
      const contentLength = bodyText.length;

      // Extract links
      const allLinks = new Set<string>();
      $('a[href]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href) {
          try {
            const absoluteUrl = new URL(href, url).href;
            allLinks.add(absoluteUrl);
          } catch {}
        }
      });

      // Separate internal and external links
      const baseUrl = new URL(url);
      const internalLinks = Array.from(allLinks).filter(
        (link) => new URL(link).hostname === baseUrl.hostname
      );
      const externalLinks = Array.from(allLinks).filter(
        (link) => new URL(link).hostname !== baseUrl.hostname
      );

      // Extract media counts
      const imageCount = $('img').length;
      const scriptCount = $('script').length;

      // Extract structured data
      const structuredData = this.extractStructuredData($);

      // Check if page is renderable as bot
      const renderableAsBot = true; // We successfully rendered it

      logger.debug(`Crawled: ${url} (${contentLength} bytes, ${responseTime}ms)`);

      return {
        url,
        title,
        metaDescription,
        h1,
        contentLength,
        statusCode,
        responseTime,
        crawlableAsBot: true,
        structuredData,
        internalLinks,
        externalLinks,
        imageCount,
        scriptCount,
        renderableAsBot,
        crawledAt: new Date(),
      };
    } catch (error) {
      logger.warn(`Error crawling ${url}`, { error: String(error) });
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Extract structured data (schema.org) from page
   */
  private extractStructuredData($: cheerio.CheerioAPI): Record<string, any> {
    const structuredData: Record<string, any> = {};

    // Extract JSON-LD
    $('script[type="application/ld+json"]').each((_, elem) => {
      try {
        const json = JSON.parse($(elem).html() || '{}');
        if (json['@type']) {
          structuredData[json['@type']] = json;
        }
      } catch {}
    });

    // Extract microdata
    $('[itemtype]').each((_, elem) => {
      const type = $(elem).attr('itemtype') || 'Unknown';
      if (!structuredData[type]) {
        structuredData[type] = {
          properties: {},
        };
      }
    });

    return Object.keys(structuredData).length > 0 ? structuredData : {};
  }

  /**
   * Check robots.txt
   */
  async checkRobotsTxt(domain: string): Promise<string> {
    if (!this.context) return '';

    const page = await this.context.newPage();
    try {
      const url = `https://${domain}/robots.txt`;
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      });

      if (response?.ok()) {
        return await page.content();
      }
      return '';
    } catch (error) {
      logger.warn(`Failed to fetch robots.txt for ${domain}`);
      return '';
    } finally {
      await page.close();
    }
  }

  /**
   * Check sitemap
   */
  async checkSitemap(domain: string): Promise<string[]> {
    if (!this.context) return [];

    const page = await this.context.newPage();
    const urls: string[] = [];

    try {
      // Try standard sitemap locations
      const sitemapUrls = [
        `https://${domain}/sitemap.xml`,
        `https://${domain}/sitemap_index.xml`,
      ];

      for (const sitemapUrl of sitemapUrls) {
        try {
          const response = await page.goto(sitemapUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 5000,
          });

          if (response?.ok()) {
            const content = await page.content();
            const $ = cheerio.load(content);

            $('loc').each((_, elem) => {
              const url = $(elem).text().trim();
              if (url) urls.push(url);
            });
          }
        } catch {}
      }

      logger.info(`Found ${urls.length} URLs in sitemaps for ${domain}`);
      return urls;
    } catch (error) {
      logger.warn(`Failed to check sitemaps for ${domain}`);
      return urls;
    } finally {
      await page.close();
    }
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    logger.info('Web crawler closed');
  }
}
