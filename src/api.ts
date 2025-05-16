console.log("INIT P.A.W v0.0.0");

import {Elysia} from "elysia";
import {cors} from "@elysiajs/cors";
import {cron} from '@elysiajs/cron'
import {PuppeteerAgent} from "./agent";
import type {AgentConfig} from "../shared/types";
import {LogManager} from "../shared/logger";
import {checkLicense, getSysInfo, loadAgentsFromFile, saveAgentsToFile, showCopyrightDisclaimer} from "./utils.ts";
import {parseArgs} from "util";

export const logger = new LogManager("P.A.W - API", true);

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        port: {
            type: 'string',
        },
        coldstart: {
            type: 'boolean',
            default: false,
        },
        license: {
            type: 'string'
        }
    },
    strict: true,
    allowPositionals: true,
});

logger.success("Parsed any command line arguments");

process.title = "P.A.W - TEST CLIENT";

showCopyrightDisclaimer();
await new Promise(resolve => setTimeout(resolve, 5000));
//.clear();

if(!values.license) {
    logger.fatal("No license provided. Please provide a license key using the --license option.");
    process.exit(1);
}

if(!await checkLicense(values.license)) {
    process.exit(1);
}

logger.info("Setting up API Server...");

export const PORT = values.port || 3001;

logger.info("Using PORT: " + PORT);

const coldStart = values.coldstart || false;

logger.info("Executing coldStart: " + coldStart);

let agents: { [id: string]: PuppeteerAgent } = await loadAgentsFromFile();

if (coldStart) {
    logger.info("Coldstart enabled, starting a new temporary agent.");
    const config: AgentConfig = {
        startUrl: "https://example.org",
        headless: false,
        muteAudio: true,
        scrapeData: false,
    }

    const agentId = crypto.randomUUID();
    agents[agentId] = new PuppeteerAgent(config);
    const res = await agents[agentId].coldStart();
    if (res) {
        logger.success("Coldstart successful, agent is ready to use.");
        await new Promise(resolve => setTimeout(resolve, 500));
        delete agents[agentId];

        await new Promise(resolve => setTimeout(resolve, 5000));
        logger.info("Temporary coldstart agent process finished.");
    }
}
if (Object.keys(agents).length > 0) {
    logger.info(`Loaded ${Object.keys(agents).length} agents from persistent storage.`);
}

export const app = new Elysia()
    .use(cors({
        origin: "*",
        methods: "*",
        credentials: true,
    }))
    .use(
        cron({
            name: 'heartbeat',
            pattern: '*/10 * * * * *',
            run() {
                logger.debug('Heartbeat')
            }
        })
    )
    .onError(({ error, set, code }) => {

        switch (code) {
            case "NOT_FOUND":
                logger.warn("Route not found");
                logger.error(error);
                set.status = 404;
                return { error: "Not Found" };
            case "VALIDATION":
                set.status = 400;
                logger.fatal("Validation error:");
                logger.error(error);
                return { error: "Invalid request" };
            default:
                logger.fatal("Error occurred:");
                logger.error(error);
                set.status = 500;
                return { error: "Internal Server Error" };
        }
    })
    .onRequest(({ request }) => {
        logger.debug(`New request: ${request.method} ${request.url} from UA: ${request.headers.get("user-agent")}`);
        logger.debug(request.headers);
        if (request.body) {
            logger.debug("Request body:");
            logger.debug(request.body);
        }
    })
    .get("/", () => ({ message: "Agent Server is running" }))
    .get("/agents.list", () => {
        logger.info("Listing agents");
        return Object.keys(agents);
    })
    .get("/agents.status", () => {
        logger.info("Listing all agents status");
        return Object.keys(agents).map((id) => {
            return {id, status: agents[id]?.getStatus()};
        });
    })
    .post("/agent/create", async ({ body, set }) => {
        logger.info("Creating agent");
        try {
            const config = body as AgentConfig;
            logger.debug("Agent config:");
            logger.debug(config);
            const agentId = crypto.randomUUID();
            logger.debug(`Agent ID: ${agentId}`);
            agents[agentId] = new PuppeteerAgent(config);
            console.log(agents)
            await saveAgentsToFile(agents);
            set.status = 201;
            logger.debug("Agent created, returning agent ID");
            return { agentId };
        } catch (error) {
            logger.fatal("Error creating agent");
            logger.error(error);
            set.status = 500;
            return { error: "Failed to create agent" };
        }
    })
    .post("/agent/:id/start", async ({ params: { id }, set }) => {
        if (!agents[id]) {
            logger.fatal("Agent not found");
            logger.debug(agents);
            set.status = 404;
            return { error: "Agent not found" };
        }
        try {
            logger.info(`Starting agent ${id}`);
            const res = await agents[id].start();
            if (!res) {
                logger.fatal("Error starting agent");
                set.status = 500;
                return { error: "Failed to start agent" };
            }
            logger.info("Agent started successfully");
            return { status: "Agent started" };
        } catch (error) {
            logger.fatal("Error starting agent:");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to start agent" };
        }
    })
    .get("/agent/:id/status", ({ params: { id }, set }) => {
        if (!agents[id]) {
            logger.fatal("Agent not found");
            logger.debug(agents);
            set.status = 404;
            return { error: "Agent not found" };
        }
        logger.info(`Getting status of agent ${id}`);
        const status = agents[id].getStatus();
        return { status };
    })
    .post("/agent/:id/stop", async ({ params: { id }, set }) => {
        if (!agents[id]) {
            logger.fatal("Agent not found");
            logger.debug(agents);
            set.status = 404;
            return { error: "Agent not found" };
        }
        try {
            logger.info(`Stopping agent ${id}`);
            await agents[id].stop();
            return { status: "Agent stopped" };
        } catch (error) {
            logger.fatal("Error stopping agent:");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to stop agent" };
        }
    })
    .post("/agent/:id/exec", async ({ params: { id }, body, set }) => {
        if (!agents[id]) {
            logger.fatal("Agent not found");
            logger.debug(agents);
            set.status = 404;
            return { error: "Agent not found" };
        }
        try {
            const { code } = body as { code: string };
            logger.info(`Executing code on agent ${id}: ${code}`);
            switch (code) {
                case "share_link":
                    logger.info("Executing share_link code");
                    const result = await agents[id].clickShareLinkButton();
                    return {
                        status: "Executed code OK", result: {
                            success: !!result,
                            data: result,
                        }
                    };
                case "list_participants":
                    logger.info("Executing list_participants code");
                    const res1 = await agents[id].listParticipants();
                    return {
                        status: "Executed code OK", result: {
                            success: !!res1,
                            data: res1,
                        }
                    };
                case "cold_start":
                    logger.info("Executing cold-start code");
                    const config: AgentConfig = {
                        startUrl: "https://example.com",
                        scrapeData: false,
                        headless: false,
                        muteAudio: true
                    }
                    const agentId = crypto.randomUUID();
                    agents[agentId] = new PuppeteerAgent(config);
                    const res = await agents[agentId].coldStart();
                    if (res) {
                        return {
                            status: "Executed code OK", result: {
                                success: res,
                                data: res,
                            }
                        };
                    } else {
                        return {
                            status: "Executed code OK", result: {
                                success: false,
                                data: null,
                            }
                        };
                    }
                default:
                    console.log(code)
                    logger.warn(`Unknown code: ${code}`);
                    set.status = 400;
                    return { error: "Unknown code" };
            }
        } catch (error) {
            logger.fatal("Error executing code:");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to execute code" };
        }
    })
    .get("/agent/:id/config", ({ params: { id }, set }) => {
        if (!agents[id]) {
            logger.fatal("Agent not found");
            logger.debug(agents);
            set.status = 404;
            return { error: "Agent not found" };
        }
        logger.info(`Getting config of agent ${id}`);
        const config = agents[id].getConfig();
        logger.debug(config);
        return { config: config };
    })
    .get("/agent/:id/screenshot", async ({ params: { id }, set }) => {
        if (!agents[id]) {
            logger.fatal("Agent not found");
            logger.debug(agents);
            set.status = 404;
            return { error: "Agent not found" };
        }
        logger.info(`Getting screenshot of agent ${id}`);
        return await agents[id].getScreenshot();
    })
    .post("/rc/login", async ({ body, set }) => {
        try {
            const { rcUsername, rcPassword } = body as { rcUsername: string; rcPassword: string };
            // Perform login to Rocket.Chat
            // Return auth token
            const response = await fetch("https://rocketchat.3git.eu/api/v1/login", {
                method: "POST",
                body: JSON.stringify({
                    "user": rcUsername,
                    "password": rcPassword
                }),
                headers: { "Content-Type": "application/json", "accept": "application/json", "referer": "https://rocketchat.3git.eu/" },
            });
            if (!response.ok) {
                throw new Error(`Failed to login to Rocket.Chat: ${response.statusText}`);
            }
            logger.info(`Login response`);
            console.log(response)
            return await response.json();
        } catch (error) {
            logger.fatal("Error logging in to Rocket.Chat");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to login to Rocket.Chat" };
        }
    })
    .post("/rc/me", async ({ headers, set }) => {
        try {
            const rcAuthToken = headers["x-auth-token"];
            const rcUserId = headers["x-user-id"];
            logger.info(`x-auth-token: ${rcAuthToken}`);
            logger.info(`x-user-id: ${rcUserId}`);
            // Get Rocket.Chat user info
            const response = await fetch("https://rocketchat.3git.eu/api/v1/me", {
                method: "GET",
                headers: {
                    "x-auth-token": rcAuthToken as string,
                    "x-user-id": rcUserId as string,
                },
            });
            logger.info(response);
            if (!response.ok) {
                throw new Error(`Failed to get Rocket.Chat user info: ${response.statusText}`);
            }
            logger.info(`User info response: ${response}`);
            const data = await response.json();
            if (!data.success) {
                return { status: "error", message: data.error }
            } else {
                return { status: "ok", data: data }
            }
        } catch (error) {
            logger.fatal("Error getting Rocket.Chat user info:");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to get Rocket.Chat user info" };
        }
    })
    .get("/rc/capabilities", async ({ headers, set }) => {
        try {
            const rcAuthToken = headers["x-auth-token"];
            const rcUserId = headers["x-user-id"];
            logger.info(`x-auth-token: ${rcAuthToken}`);
            logger.info(`x-user-id: ${rcUserId}`);
            // Get Rocket.Chat capabilities
            const response = await fetch("https://rocketchat.3git.eu/api/v1/video-conference.capabilities", {
                method: "GET",
                headers: {
                    "x-auth-token": rcAuthToken as string,
                    "x-user-id": rcUserId as string,
                },
            });
            logger.info(response);
            if (!response.ok) {
                throw new Error(`Failed to get Rocket.Chat capabilities: ${response.statusText}`);
            }
            logger.info(`Capabilities response: ${response}`);
            return await response.json();
        } catch (error) {
            logger.fatal("Error getting Rocket.Chat capabilities:");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to get Rocket.Chat capabilities" };
        }
    })
    .post("/rc/call.create", async ({ body, headers, set }) => {
        try {
            const rcAuthToken = headers["x-auth-token"] as string;
            const rcUserId = headers["x-user-id"] as string;

            // Parse the request body
            const { roomId, allowRinging } = typeof body === 'string'
                ? JSON.parse(body)
                : body as { roomId: string; allowRinging: boolean };

            // Make API call to Rocket.Chat
            const response = await fetch("https://rocketchat.3git.eu/api/v1/video-conference.start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": rcAuthToken,
                    "x-user-id": rcUserId
                },
                body: JSON.stringify({ roomId, allowRinging })
            });

            if (!response.ok) {
                throw new Error(`Failed to create Rocket.Chat call: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            logger.fatal("Error creating Rocket.Chat call:");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to create Rocket.Chat call" };
        }
    })
    .get("/rc/call.info/:id", async ({ params: { id }, headers, set }) => {
        try {
            const rcAuthToken = headers["x-auth-token"] as string;
            const rcUserId = headers["x-user-id"] as string;
            const response = await fetch(`https://rocketchat.3git.eu/api/v1/video-conference.info?callId=${id}`, {
                method: "GET",
                headers: {
                    "x-auth-token": rcAuthToken,
                    "x-user-id": rcUserId
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get Rocket.Chat call info: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            logger.fatal("Error getting Rocket.Chat call info:");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to get Rocket.Chat call info" };
        }
    })
    .post("/rc/call.join/", async ({ body, headers, set }) => {
        try {
            const rcAuthToken = headers["x-auth-token"] as string;
            const rcUserId = headers["x-user-id"] as string;
            const { callId, state } = typeof body === 'string'
                ? JSON.parse(body)
                : body as { callId: string; state: { mic: boolean; cam: boolean } };

            const response = await fetch("https://rocketchat.3git.eu/api/v1/video-conference.join", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": rcAuthToken,
                    "x-user-id": rcUserId
                },
                body: JSON.stringify({ callId, state })
            });

            if (!response.ok) {
                throw new Error(`Failed to join Rocket.Chat call: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            logger.fatal("Error joining Rocket.Chat call:");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to join Rocket.Chat call" };
        }
    })
    .delete("/agent/:id", async ({ params: { id }, set }) => {
        if (!agents[id]) {
            logger.fatal("Agent not found");
            logger.debug(agents);
            set.status = 404;
            return { error: "Agent not found" };
        }
        try {
            logger.info(`Deleting agent ${id}`);
            await agents[id].stop();
            delete agents[id];
            await saveAgentsToFile(agents);
            logger.info(`Agent ${id} deleted`);
            return { status: "Agent deleted" };
        } catch (error) {
            logger.fatal("Error deleting agent:");
            logger.error(error);

            set.status = 500;
            return { error: "Failed to delete agent" };
        }
    })
    .get("/agent/:id", ({ params: { id }, set }) => {
        if (!agents[id]) {
            logger.fatal("Agent not found");
            logger.debug(agents);
            set.status = 404;
            return { error: "Agent not found" };
        }
        logger.info(`Getting agent ${id}`);
        const agent = agents[id].getData();
        console.log(agent)
        return agent;
    })
    .get("/machine", async () => {
        logger.info(`Getting machine info`);
        const data = await getSysInfo();
        console.log(data)
        return data;
    })
    .listen({idleTimeout: 30, port: PORT});

logger.success(
    `API Server online! Running on ${app.server?.hostname}:${PORT}`
);
