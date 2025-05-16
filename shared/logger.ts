import { join } from 'path';
import { existsSync, mkdirSync, createWriteStream, WriteStream } from 'fs';
import { format as utilFormat } from 'util';
import { format } from 'date-fns';

let dateNow: Date = new Date();
let dateStamp: string = format(dateNow, "yyyy-MM-dd");

/**
 * The LogManager class provides logging functionality for the application.
 */
export class LogManager {
    logger: WriteStream | null;
    debugType: boolean;
    logDir: string;
    logFilePath: string;
    logFileName: string;
    logApp: string;

    /**
     * Constructs a new instance of the LogManager class.
     * @param logAppName - The name of the application for logging.
     * @param debugType - The debug type for logging.
     */
    constructor(logAppName: string, debugType?: boolean) {
        this.logger = null;
        this.debugType = debugType || false;
        this.logDir = '';
        this.logFilePath = '';
        this.logApp = logAppName;
        this.logFileName = utilFormat('%s_%s.log', this.logApp, dateStamp);
        this.checkLogDirectory();
        this.openFile();

        if(this.debugType){
            this.info("Debug Mode Enabled! Debug logs will be written and shown ONLY to the log file.");
        }
    }

    /**
     * Checks if the log directory exists and creates it if it doesn't.
     */
    checkLogDirectory(): void {
        const currentDirectory = process.cwd();

        if (this.debugType) {
            // If debug mode is enabled, set logDir to current directory
            this.logDir = join(currentDirectory, 'logs');
        } else {
            this.logDir = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : '/tmp') || (process.platform === 'linux' ? process.env.HOME + '/.local/share' : '/tmp/');
        }

        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir);
            console.log("Writing Log Directory at: "+this.returnLogDirectory())
        }

        this.logDir = join(this.logDir, 'JitsiBot');
        this.logFilePath = join(this.logDir, this.logFileName);

        // If directory does not exist, create it
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir);
        }
    }

    /**
     * Opens the log file in append mode.
     */
    openFile(): void {
        if (!this.logger) {
            this.logger = createWriteStream(this.logFilePath, {
                flags: 'a'
            });
        }
    }

    /**
     * Closes the log file stream.
     */
    closeFile(): void {
        if (this.logger) {
            this.logger.end();
            this.logger = null;
        }
    }

    /**
     * Formats the log line with the specified level and message.
     * @param level - The log level.
     * @param message - The log message.
     * @returns The formatted log line.
     */
    logLine(level: string, message: any): string {
        let dateNow: Date = new Date();
        let dateLOG: string = format(dateNow, 'dd/MM/yyyy H:mm:ss:SSS');
        let appName = this.logApp === 'VRSPACE' ? 'MAIN' : this.logApp;
        return utilFormat('[%s] - [%s] - [%s] - %s', dateLOG, appName, level, typeof message === 'object' ? JSON.stringify(message) : message);
    }

    /**
     * Logs a message with the specified level.
     * @param level - The log level.
     * @param message - The message to log.
     */
    private log(level: string, message: any): void {
        const logLine = this.logLine(level, message);
        if (this.logger) {
            this.logger.write(logLine + '\n');
        }
        if(level !== 'DEBUG'){
            this.logToConsole(logLine, level);
        }
    }

    /**
     * Logs an info message.
     * @param message - The info message to log.
     */
    info(message: any): void {
        this.log('INFO', message);
    }

    /**
     * Logs a success message.
     * @param message - The success message to log.
     */
    success(message: any): void {
        this.log('SUCCESS', message);
    }

    /**
     * Logs a working message.
     * @param message - The working message to log.
     */
    working(message: any): void {
        this.log('WORKING', message);
    }

    /**
     * Logs a debug message if debug mode is enabled.
     * @param message - The debug message to log.
     */
    debug(message: any): void {
        if (this.debugType) {
            this.log('DEBUG', message);
        }
    }

    /**
     * Logs an error message and stack trace.
     * @param exception - The error exception to log.
     */
    error(exception: any): void {
        this.log('ERROR', exception.message);
        this.log('ERROR', exception.stack || exception);
    }

    /**
     * Logs a warning message.
     * @param message - The warning message to log.
     */
    warn(message: any): void {
        this.log('WARN', message);
    }


    /**
     * Writes a message to the log file without logging to the console.
     * @param message - The message to write.
     */
    write(message: any): void {
        this.log('INFO', message);
    }

    /**
     * Logs a fatal error message.
     * @param message - The fatal error message to log.
     */
    fatal(message: any): void {
        this.log('FATAL', message);
    }

    /**
     * Logs a message to the console.
     * @param message - The message to log to the console.
     * @param level - The log level.
     */
    logToConsole(message: any, level: string): void {
        if (level === 'ERROR' || level === 'FATAL') {
            console.error(message);
        } else {
            console.log(message);
        }
    }

    /**
     * Returns the log directory path.
     * @returns The log directory path.
     */
    returnLogDirectory(): string {
        return this.logDir;
    }
}

const logManager = new LogManager('DEBUG');
process.on('exit', () => {
    logManager.closeFile();
});