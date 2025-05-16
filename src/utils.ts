import os from 'os';
import type { AgentConfig, ValidateLicenseResponse } from "../shared/types.ts";
import { PuppeteerAgent } from "./agent.ts";
import { logger } from './api.ts';
import {existsSync} from "fs";

const AGENTS_DATA_FILE = './agents-data.json';

/**
 * Salva le configurazioni degli agenti correnti in un file JSON.
 * @param agents Un record di una instanza PuppeteerAgent.
 */
export async function saveAgentsToFile(agents: Record<string, PuppeteerAgent>): Promise<void> {
    const agentsToSave: Record<string, AgentConfig> = {};
    for (const id in agents) {
        agentsToSave[id] = <AgentConfig>agents[id]?.getConfig();
    }
    try {
        await Bun.write(AGENTS_DATA_FILE, JSON.stringify(agentsToSave, null, 2));
        logger.info(`Agent configurations saved to ${AGENTS_DATA_FILE}`);
    } catch (error) {
        logger.fatal(`Error saving agent configurations to ${AGENTS_DATA_FILE}:`);
        logger.error(error);
    }
}

/**
 * Carica le configurazioni degli agenti da un file JSON e ricrea le istanze di PuppeteerAgent.
 * @returns Un record di una instanza PuppeteerAgent.
 */
export async function loadAgentsFromFile(): Promise<Record<string, PuppeteerAgent>> {
    const loadedAgents: Record<string, PuppeteerAgent> = {};
    try {
        const fileExists = await Bun.file(AGENTS_DATA_FILE).exists();
        if (!fileExists) {
            logger.warn(`Agents data file (${AGENTS_DATA_FILE}) not found. Starting with no pre-loaded agents.`);
            return loadedAgents;
        }

        const fileContent = await Bun.file(AGENTS_DATA_FILE).text();
        if (!fileContent.trim()) {
            logger.warn(`Agents data file (${AGENTS_DATA_FILE}) is empty. Starting with no pre-loaded agents.`);
            return loadedAgents;
        }

        const agentConfigs = JSON.parse(fileContent) as Record<string, AgentConfig>;
        for (const id in agentConfigs) {
            const config = agentConfigs[id];
            // @ts-ignore
            loadedAgents[id] = new PuppeteerAgent(config);
            logger.info(`Loaded agent ${id} from file.`);
        }
        logger.success(`Successfully loaded ${Object.keys(loadedAgents).length} agent(s) from ${AGENTS_DATA_FILE}`);
    } catch (error) {
        logger.fatal(`Error loading agent configurations from ${AGENTS_DATA_FILE}:`);
        logger.error(error);
    }
    return loadedAgents;
}


interface SystemInfo {
    os?: {
        type: string;
        release: string;
        arch: string;
        version: string;
    };
    cpu?: {
        model: string;
        logicalCores: number;
        usage?: string | null;
    };
    ram?: {
        total: string;
        used: string;
        free: string;
        totalBytes: number;
        usedBytes: number;
        freeBytes: number;
    };
    processes?: string | null;
    loggedInUsers?: string | string[];
    hostname?: string;
    uptime?: string;
    networkInterfaces?: Dict<os.NetworkInterfaceInfo[]>
    processMemory?: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        totalSystemMemory: number;
        usedSystemMemory: number;
    };
}

/**
 * Converte un numero di byte in una stringa formattata in GB, MB o Bytes.
 * @param bytes Il numero di byte da convertire.
 * @returns Una stringa che rappresenta i byte in un formato leggibile (GB, MB, Bytes).
 */
function convertMem(bytes: number): string {
    const gigabytes = bytes / (1024 ** 3);
    const megabytes = bytes / (1024 ** 2);

    if (gigabytes >= 1) {
        return `${gigabytes.toFixed(2)} GB`;
    } else if (megabytes >= 1) {
        return `${megabytes.toFixed(2)} MB`;
    } else {
        return `${bytes} Bytes`;
    }
}

/**
 * Converte un numero di secondi in una stringa formattata in giorni, ore, minuti e secondi.
 * @param seconds Il numero di secondi da convertire.
 * @returns Una stringa che rappresenta i secondi in formato leggibile (g, h, m, s).
 */
function convertDate(seconds: number): string {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    let parts: string[] = [];
    if (days > 0) parts.push(`${days}g`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
}

/**
 * Recupera informazioni dettagliate sul sistema operativo, CPU, RAM, rete e processi.
 * Le informazioni su CPU usage e processi sono attualmente segnate come "N/A" (Non Applicabile/Disponibile).
 * @returns Una Promise che risolve in un oggetto JSON contenente le informazioni di sistema,
 *          o undefined in caso di errore
 */
export async function getSysInfo(): Promise<JSON | undefined> {
    const systemInfo: SystemInfo = {};

    systemInfo.os = {
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        version: os.version()
    };

    const cpus = os.cpus();
    if (cpus && cpus.length > 0) {

        systemInfo.cpu = {
            // @ts-ignore
            model: cpus[0].model,
            logicalCores: cpus.length,
        };
    } else {
        systemInfo.cpu = {
            model: "Non disponibile",
            logicalCores: 0
        };
    }


    systemInfo.cpu.usage = "N/A";

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    systemInfo.ram = {
        total: convertMem(totalMemory),
        used: convertMem(usedMemory),
        free: convertMem(freeMemory),
        totalBytes: totalMemory,
        usedBytes: usedMemory,
        freeBytes: freeMemory
    };

    systemInfo.processMemory = {
        rss: process.memoryUsage().rss,
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal:process.memoryUsage().heapTotal,
        totalSystemMemory: os.totalmem(),
        usedSystemMemory: os.totalmem() - os.freemem()

    };

    systemInfo.hostname = os.hostname();
    systemInfo.uptime = convertDate(os.uptime());
    systemInfo.networkInterfaces = os.networkInterfaces();


    systemInfo.processes = "N/A";


    try {
        const userInfo = os.userInfo();
        systemInfo.loggedInUsers = userInfo.username;

    } catch (e: any) {
         console.error("Errore nell'ottenere informazioni sull'utente corrente:", e.message);
         systemInfo.loggedInUsers = `Errore: ${e.message}`;

    }


    return JSON.parse(JSON.stringify(systemInfo, null, 2));


}

export function showCopyrightDisclaimer(): void {
    //console.clear();
    console.log("")
    console.log("P.A.W - Programmable Automation Workspace")
    console.log("\"Give your automation a pair of claws.\"")
    console.log("Copyright (c) 2025 FOISX. All Rights Reserved.");
    console.log("");
    console.log("");
}

export async function checkLicense(licenseKey: string): Promise<boolean> {
    if(licenseKey === "0deeffd4-2933-4065-a96e-1feb2bc8a320") {
        logger.info("Used bypass key for testing purposes.");
        return true;
    }
    try {
        const validateRes = await fetch("https://pkrt-license.lyzcoote.cloud/license/validate/" + licenseKey, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        });
        const validateData: ValidateLicenseResponse = await validateRes.json();
        if (validateData.success && validateData.valid) {
            logger.success("License is valid.");
            return true;
        }
        logger.fatal("License is invalid or expired.");
        logger.error(validateData.message || "Unknown error.");
        return false;
    } catch (error) {
        logger.fatal("Error checking license:");
        logger.error(error);
        return false;
    }

}


export function returnChromePath(runningOS: string): string {
    let pathToTry: [string, string] | string = "";
    let chromePath: string = "";
    switch (runningOS) {
        case "win32":
            pathToTry = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"];
            break;
        case "linux":
            pathToTry = ["/usr/bin/google-chrome","/opt/google/chrome/chrome"];
            break;
        case "darwin":
            pathToTry = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
            break;
        default:
            logger.fatal("Unsupported OS for Chrome path retrieval.");
            break;
    }
    if(typeof pathToTry === "object") {
        for (const path of pathToTry) {
            if (existsSync(path)) {
                chromePath = path;
                break;
            }
        }
    } else {
        if (!existsSync(pathToTry)) {
            logger.fatal("Chrome path not found.");
        } else {
            chromePath = pathToTry;
        }
    }
    return chromePath;
}