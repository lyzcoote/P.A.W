import puppeteer, { Browser, Page } from "puppeteer";
import type { AgentConfig } from "../shared/types.ts";
import { LogManager } from "../shared/logger.ts";
import { existsSync } from 'fs';

const logger = new LogManager("P.A.W - AGENT", false);

export class PuppeteerAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly config: AgentConfig;
  private status: "idle" | "running" | "stopped" | "error" | "starting" = "idle";

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async stop(): Promise<void> {
    try {
      if (this.page) {
        // Ensure page is closed if it exists, browser will be closed in finally
        await this.page.close();
        this.page = null;
      }
    } catch (error) {
      logger.fatal("Error while closing page:");
      logger.error(error);
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      this.status = "stopped";
    }
  }

  async getScreenshot() {
    try {
      if (this.page) {
        return this.page.screenshot();
      }
    }
    catch (error) {
      logger.error("Error while taking screenshot:");
      logger.error(error);
      return null;
    }
  }

  public getStatus() {
    return this.status;
  }

  public getConfig() {
    return this.config;
  }

  public getData() {
    return {
      status: this.status,
      config: this.config,
    };
  }

  async start(): Promise<boolean> {
    try {
      let startupArgs: string[] = []
      this.status = "starting";
      if (this.config.muteAudio) {
        startupArgs.push('--mute-audio');
      }
      // TODO: Add support for more browsers and OS (Linux)
      if (existsSync("C:\\Program Files\\Google\\Chrome\\Application")) {
        logger.info("Using default installed Chrome");
        this.browser = await puppeteer.launch({
          headless: this.config.headless,
          args: startupArgs,
          executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        });
      } else {
        this.browser = await puppeteer.launch({
          headless: this.config.headless,
          args: startupArgs,
        });
      }

      const context = this.browser.defaultBrowserContext();
      await context.overridePermissions(this.config.startUrl, ["clipboard-read", "clipboard-write"]);

      this.page = await this.browser.newPage();

      const chromeLogger = new LogManager("P.A.W - BROWSER", true);
      chromeLogger.success("Browser console logger created");

      this.page.on('console', msg => {
        chromeLogger.debug(msg.text());
      });
      try {
        await this.page.goto(this.config.startUrl, { waitUntil: 'domcontentloaded' });
      } catch (error) {
        logger.fatal("Error navigating to start URL:");
        logger.error(error);
        this.status = "error";
        await this.stop();
        throw error;
      }
      this.status = "running";

      if (this.config.scrapeData) {
        const data = await this.page.evaluate(() => {
          // TODO: Insert future scraping logic here
          return { title: document.title };
        });
        logger.info(`Scraped data`);
        logger.info(data);
      }

      return true;

    } catch (error) {
      this.status = "error";
      logger.fatal("Agent error");
      logger.error(error);
      await this.stop();
      throw error;
    }
  }

  private async _openParticipantsPane(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.keyboard.press('p');
      logger.info("Pressed P to open participants pane");
      await this.page.waitForSelector('div[class="participants_pane"]', { timeout: 5000 });
      const shareDiv = await this.page.$('div[class="participants_pane"]');
      const shareDivContent = await this.page.$('div[class="participants_pane-content"]');
      if (!shareDiv || !shareDivContent) {
        logger.error("Participants pane elements not found after pressing P");
        return false;
      }
      logger.info("Participants pane opened successfully");
      return true;
    } catch (error) {
      logger.error("Error opening participants pane:");
      logger.error(error);
      return false;
    }
  }

  private async _closeParticipantsPane(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.keyboard.press('p');
      logger.info("Pressed P to close participants pane");

      // Wait a brief moment for the pane to potentially close
      await new Promise(resolve => setTimeout(resolve, 500));

      const shareDivStillOpen = await this.page.$('div[class="participants_pane"]');
      if (shareDivStillOpen) {
        logger.info("Participants pane still open, attempting to close with button");
        const closeButton = await this.page.$('button[aria-label="Close"]');
        if (closeButton) {
          await closeButton.click();
          logger.info("Participants pane closed via button");
          // Wait for the pane to actually disappear
          await this.page.waitForSelector('div[class="participants_pane"]', { hidden: true, timeout: 5000 });
        } else {
          logger.warn("Close button for participants pane not found after retrying");
          // Fallback: move mouse and try to ensure focus for next 'p' press if needed elsewhere
          const viewport = this.page.viewport();
          if (viewport) {
            logger.debug("Moving mouse to center of screen as a fallback");
            await this.page.mouse.move(viewport.width / 2, viewport.height / 2);
            await new Promise(resolve => setTimeout(resolve, 250));
          }
        }
      } else {
        logger.info("Participants pane closed successfully via key press");
      }
    } catch (error) {
      logger.error("Error closing participants pane:");
      logger.error(error);
    }
  }

  async listParticipants() {
    if (!this.page) {
      return null;
    }

    try {
      if (!await this._openParticipantsPane()) {
        return null;
      }

      const participantsDivs = await this.page.$$('div[class="list-item-container css-1nxmpxc-container"]');
      if (!participantsDivs || participantsDivs.length === 0) {
        logger.fatal("No participants found");
        await this._closeParticipantsPane();
        return null;
      }

      logger.info(`Found ${participantsDivs.length} participants`);

      const participants = await Promise.all(participantsDivs.map(async (div) => {
        const nameElement = await div.$('div[class="css-1lacpev-name"]');
        const name = nameElement ? await this.page!.evaluate(element => element.textContent, nameElement) : null;

        const videoElement = await div.$('svg[id="videoMuted"]');
        const videoMuted = !!videoElement;

        const audioElement = await div.$('svg[id="audioMuted"]');
        const audioMuted = !!audioElement;

        return { name, videoMuted, audioMuted };
      }));

      logger.info(`Found ${participants.length} participants`);
      participants.forEach((participant, index) => {
        logger.info(`Participant ${index + 1}:`);
        logger.info(`Name: ${participant.name}`);
        logger.info(`Video Muted: ${participant.videoMuted}`);
        logger.info(`Audio Muted: ${participant.audioMuted}`);
      });

      await this._closeParticipantsPane();

      return participants;
    } catch (error) {
      logger.fatal("Error while listing participants:");
      logger.error(error);
      await this._closeParticipantsPane(); // Attempt to close pane even on error
      return null;
    }
  }

  async clickShareLinkButton() {
    if (!this.page) {
      return null;
    }

    try {
      if (!await this._openParticipantsPane()) {
        return null;
      }

      const inviteBtn = await this.page.waitForSelector('button[aria-label="Invite Someone"]', { timeout: 5000 });
      if (!inviteBtn) {
        logger.fatal("Invite button not found");
        await this._closeParticipantsPane();
        return null;
      }

      await inviteBtn.click();
      logger.info("Invite button clicked");

      const shareLinkBtn = await this.page.waitForSelector('div[aria-label="Copy meeting invitation"]', { visible: true, timeout: 5000 });
      if (!shareLinkBtn) {
        logger.fatal("Share link button not found");
        await this._closeParticipantsPane();
        return null;
      }

      await shareLinkBtn.click();
      logger.info("Share link button clicked");

      const closeBtn = await this.page.waitForSelector('button[aria-label="Close dialog"]', { visible: true, timeout: 5000 });
      if (!closeBtn) {
        logger.fatal("Close button for dialog not found");
        await this._closeParticipantsPane();
        return null;
      }


      await closeBtn.click();
      logger.info("Close dialog button clicked");
      
      // Wait for the dialog to actually disappear
      await this.page.waitForSelector('button[aria-label="Close dialog"]', { hidden: true, timeout: 5000 });


      await this._closeParticipantsPane();

      const inviteLink = await this.page.evaluate(() => navigator.clipboard.readText());
      logger.info(`Clipboard content: ${inviteLink}`); // Corrected extra quote

      const viewPort = this.page.viewport();
      if (viewPort) {
        logger.info(`Screen size: ${viewPort.width}x${viewPort.height}`);
        logger.debug("Move mouse to center of screen");
        await this.page.mouse.move(viewPort.width / 2, viewPort.height / 2);
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      const linkRegex = /https:\/\/jitsi.3git.eu\/[a-zA-Z0-9]+/;
      const match = inviteLink.match(linkRegex);
      if (match) {
        logger.info(`Matched invite link: ${match[0]}`);
      }

      return match ? match[0] : null;
    } catch (error) {
      logger.fatal("Error while trying to click share link button:");
      logger.error(error);
      await this._closeParticipantsPane(); // Attempt to close pane even on error
      return null;
    }
  }

  async getMeetingDuration() {
    if (!this.page) {
      return null;
    }

    try {
      const durationElement = await this.page.$('span[class="css-h6c4xs-timer"]');
      if (!durationElement) {
        logger.fatal("Duration element not found");
        return null;
      }

      const durationText = await this.page.evaluate(element => element.textContent, durationElement);
      logger.info(`Meeting duration: ${durationText}`);
      return durationText;
    } catch (error) {
      logger.fatal("Error while trying to get meeting duration:");
      logger.error(error);
      return null;
    }
  }

  /**
   * Performs a "cold start" test by launching a temporary browser instance,
   * navigating to example.com, and verifying the page title.
   * @returns {Promise<boolean>} True if the cold start was successful, false otherwise.
   */
  async coldStart(): Promise<boolean> {
    let tempBrowser: Browser | null = null;
    logger.info("Attempting cold start test...");

    try {
      // 1. Launch a new Puppeteer instance
      logger.info("Launching temporary browser instance for cold start...");
      if (existsSync("C:\\Program Files\\Google\\Chrome\\Application")) {
        logger.info("Using default installed Chrome");
        tempBrowser = await puppeteer.launch({
          headless: false,
          args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ],
          timeout: 180000,
          executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" 
        });
      } else {
        tempBrowser = await puppeteer.launch({
          headless: false,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ],
          timeout: 180000,
        });
      }

      const tempPage = await tempBrowser.newPage();
      logger.info("Temporary browser instance launched.");

      // 2. Navigate to example.com
      const targetUrl = "https://example.com";
      logger.info(`Cold start: Navigating to ${targetUrl}...`);
      await tempPage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      logger.info(`Cold start: Navigation to ${targetUrl} complete.`);

      // 3. Wait for the title to be "Example Domain"
      const expectedTitle = "Example Domain";
      logger.info(`Cold start: Waiting for page title to be "${expectedTitle}"...`);
      await tempPage.waitForFunction(
        (title) => document.title === title,
        { timeout: 10000 },
        expectedTitle
      );
      logger.success(`Cold start: Page title is "${expectedTitle}". Check passed.`);

      // 4. Close the temporary browser
      logger.info("Cold start: Closing temporary browser instance...");
      await tempBrowser.close();
      logger.success("Cold start test finished successfully.");

      // 5. Return true
      return true;

    } catch (error) {
      logger.error("Cold start test failed.");
      if (error instanceof Error) {
        logger.error(`Error: ${error.message}`);
      } else {
        logger.error("An unknown error occurred during cold start test.");
        logger.error(error);
      }

      return false;
    }
  }
}
