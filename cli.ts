console.log("TEST")

import { loadAgentsFromFile } from "./src/utils"; // saveAgentsToFile can be added if needed
import { PuppeteerAgent } from "./src/agent";
import type { AgentConfig } from "./shared/types";
import { LogManager } from "./shared/logger";

const logger = new LogManager("P.A.W - CLI", false);
let agent: PuppeteerAgent | null = null;

const defaultStartUrl = "https://jitsi.3git.eu/test-paw-cli";

async function createNewAgent(): Promise<PuppeteerAgent | null> {
    logger.info("Creating a new agent...");
    const id = prompt("Enter Agent ID (e.g., agent1):") || `agent-${Date.now()}`;
    const startUrl = prompt(`Enter Start URL (default: ${defaultStartUrl}):`) || defaultStartUrl;
    const headlessInput = prompt("Run in headless mode? (yes/no, default: no):")?.toLowerCase();
    const headless = headlessInput === 'yes';
    const muteAudioInput = prompt("Mute audio? (yes/no, default: yes):")?.toLowerCase();
    const muteAudio = muteAudioInput !== 'no'; // Default to true if empty or not 'no'
    const scrapeDataInput = prompt("Scrape data on start? (yes/no, default: no):")?.toLowerCase();
    const scrapeData = scrapeDataInput === 'yes';

    const config: AgentConfig = {
        id,
        startUrl,
        headless,
        muteAudio,
        scrapeData,
    };

    const newAgent = new PuppeteerAgent(config);
    logger.success(`Agent "${id}" created with config:`);
    console.log(config);
    return newAgent;
}

async function loadAgent(): Promise<PuppeteerAgent | null> {
    logger.info("Loading agent from file (agents-data.json)...");
    const loadedAgents = await loadAgentsFromFile();
    const agentIds = Object.keys(loadedAgents);

    if (agentIds.length === 0) {
        logger.warn("No agents found in agents-data.json or file doesn't exist/is empty.");
        return null;
    }

    logger.info("Available agents:");
    agentIds.forEach((id, index) => console.log(`${index + 1}. ${id}`));

    const choiceInput = prompt(`Select agent by number (1-${agentIds.length}):`);
    if (!choiceInput) {
        logger.warn("No selection made.");
        return null;
    }
    const choice = parseInt(choiceInput, 10);

    if (isNaN(choice) || choice < 1 || choice > agentIds.length) {
        logger.error("Invalid selection.");
        return null;
    }

    const selectedAgentId = agentIds[choice - 1];
    if (typeof selectedAgentId === "undefined") {
        logger.error("Selected agent ID is undefined.");
        return null;
    }
    const selectedAgentInstance = loadedAgents[selectedAgentId];
    // Ensure it's a PuppeteerAgent instance, as loadAgentsFromFile creates them
    if (selectedAgentInstance instanceof PuppeteerAgent) {
        logger.success(`Agent "${selectedAgentId}" loaded.`);
        return selectedAgentInstance;
    } else {
        logger.error(`Failed to load agent "${selectedAgentId}" correctly. It might be just a config object.`);
        return null;
    }
}


async function mainLoop() {
    while (true) {
        console.log("\n--- P.A.W. CLI ---");
        if (agent) {
            console.log(`Current Agent: ${agent.getConfig().id} | Status: ${agent.getStatus()}`);
        } else {
            console.log("No active agent.");
        }

        console.log("\nMain Menu:");
        if (!agent) {
            console.log("1. Create New Agent");
            console.log("2. Load Agent from File");
            console.log("3. Run Cold Start Test");
            console.log("0. Exit");
        } else {
            console.log("1. Start Agent");
            console.log("2. Stop Agent");
            console.log("3. Get Agent Status");
            console.log("4. Get Agent Config");
            console.log("5. Get Agent Data (Status + Config)");
            console.log("6. Get Screenshot");
            console.log("7. List Participants");
            console.log("8. Click Share Link Button & Get Link");
            console.log("9. Get Meeting Duration");
            console.log("---");
            console.log("10. Run Cold Start Test (independent)");
            console.log("11. Switch/Load Another Agent");
            console.log("12. Create New Agent (replaces current)");
            console.log("0. Exit");
        }

        const choice = prompt("Enter your choice: ");

        if (!agent) {
            switch (choice) {
                case "1":
                    agent = await createNewAgent();
                    break;
                case "2":
                    agent = await loadAgent();
                    break;
                case "3":
                    logger.info("Running Cold Start Test...");
                    // Create a temporary agent instance just for the cold start test
                    let tempConfig: AgentConfig = {
                        id: "cold-start-dummy",
                        startUrl: "https://example.com",
                        headless: true,
                        muteAudio: true,
                        scrapeData: false,
                    };
                    const tempAgentForColdStart = new PuppeteerAgent(tempConfig);
                    const coldStartResult = await tempAgentForColdStart.coldStart();
                    logger.info(`Cold Start Test ${coldStartResult ? "succeeded" : "failed"}.`);
                    break;
                case "0":
                    logger.info("Exiting CLI.");
                    return;
                default:
                    logger.warn("Invalid choice. Please try again.");
            }
        } else { // Agent is active
            switch (choice) {
                case "1": // Start Agent
                    if (agent.getStatus() === "running") {
                        logger.warn("Agent is already running.");
                    } else if (agent.getStatus() === "starting") {
                        logger.warn("Agent is already starting.");
                    }
                    else {
                        try {
                            logger.info("Starting agent...");
                            await agent.start();
                            logger.success("Agent started successfully.");
                        } catch (error) {
                            logger.error("Failed to start agent. Check logs above.");
                        }
                    }
                    break;
                case "2": // Stop Agent
                    if (agent.getStatus() === "stopped" || agent.getStatus() === "idle") {
                        logger.warn("Agent is not running or already stopped.");
                    } else {
                        logger.info("Stopping agent...");
                        await agent.stop();
                        logger.success("Agent stopped.");
                    }
                    break;
                case "3": // Get Agent Status
                    logger.info(`Agent Status: ${agent.getStatus()}`);
                    break;
                case "4": // Get Agent Config
                    logger.info("Agent Config:");
                    console.log(agent.getConfig());
                    break;
                case "5": // Get Agent Data
                    logger.info("Agent Data:");
                    console.log(agent.getData());
                    break;
                case "6": // Get Screenshot
                    if (agent.getStatus() !== "running") {
                        logger.warn("Agent must be running to take a screenshot.");
                        break;
                    }
                    logger.info("Taking screenshot...");
                    const screenshot = await agent.getScreenshot();
                    if (screenshot) {
                        const filename = `screenshot-${agent.getConfig().id}-${Date.now()}.png`;
                        await Bun.write(filename, screenshot);
                        logger.success(`Screenshot saved as ${filename}`);
                    } else {
                        logger.error("Failed to take screenshot.");
                    }
                    break;
                case "7": // List Participants
                    if (agent.getStatus() !== "running") {
                        logger.warn("Agent must be running to list participants.");
                        break;
                    }
                    logger.info("Listing participants...");
                    const participants = await agent.listParticipants();
                    if (participants) {
                        logger.info("Participants:");
                        console.log(JSON.stringify(participants, null, 2));
                    } else {
                        logger.warn("Could not retrieve participants list or list was empty.");
                    }
                    break;
                case "8": // Click Share Link Button
                    if (agent.getStatus() !== "running") {
                        logger.warn("Agent must be running to click share link button.");
                        break;
                    }
                    logger.info("Attempting to click share link button and get link...");
                    const link = await agent.clickShareLinkButton();
                    if (link) {
                        logger.success(`Invite Link: ${link}`);
                    } else {
                        logger.error("Failed to get invite link.");
                    }
                    break;
                case "9": // Get Meeting Duration
                    if (agent.getStatus() !== "running") {
                        logger.warn("Agent must be running to get meeting duration.");
                        break;
                    }
                    logger.info("Getting meeting duration...");
                    const duration = await agent.getMeetingDuration();
                    if (duration) {
                        logger.info(`Meeting Duration: ${duration}`);
                    } else {
                        logger.warn("Could not retrieve meeting duration.");
                    }
                    break;
                case "10": // Run Cold Start Test
                    logger.info("Running Cold Start Test...");
                    // Even if an agent is active, coldStart is a standalone test.
                    // It uses its own browser instance.
                    let tempConfig: AgentConfig = {
                        id: "cold-start-dummy",
                        startUrl: "https://example.com",
                        headless: true,
                        muteAudio: true,
                        scrapeData: false,
                    };
                    const coldStartAgent = agent || new PuppeteerAgent(tempConfig);
                    const coldStartResult = await coldStartAgent.coldStart();
                    logger.info(`Cold Start Test ${coldStartResult ? "succeeded" : "failed"}.`);
                    break;
                case "11": // Switch/Load Another Agent
                    if (agent.getStatus() === "running" || agent.getStatus() === "starting") {
                        logger.info("Stopping current agent before switching...");
                        await agent.stop();
                    }
                    agent = await loadAgent();
                    break;
                case "12": // Create New Agent (replaces current)
                     if (agent && (agent.getStatus() === "running" || agent.getStatus() === "starting")) {
                        logger.info("Stopping current agent before creating a new one...");
                        await agent.stop();
                    }
                    agent = await createNewAgent();
                    break;
                case "0": // Exit
                    logger.info("Exiting CLI.");
                    if (agent && (agent.getStatus() === "running" || agent.getStatus() === "starting")) {
                        await agent.stop();
                    }
                    return;
                default:
                    logger.warn("Invalid choice. Please try again.");
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    }
}

(async () => {
    logger.info("P.A.W. Command Line Interface started.");
    logger.info("Make sure you have Chrome installed for the agent to function correctly.");
    logger.info("If 'agents-data.json' exists, you can load pre-configured agents.");
    await mainLoop();
})().catch(error => {
    logger.fatal("Unhandled error in CLI main execution:");
    logger.error(error);
    if (agent && (agent.getStatus() === "running" || agent.getStatus() === "starting")) {
        logger.info("Attempting to stop active agent due to error...");
        agent.stop().catch(stopError => {
            logger.error("Error stopping agent during cleanup:");
            logger.error(stopError);
        });
    }
    process.exit(1);
});